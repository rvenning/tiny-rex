/** Per-profile character book: persistence with backup + known-good copies, soft-delete with recovery, legacy migration and
 *  per-character sync merge. Never touches `trex_adventure_v1_*` or `trex_progress_*`. */
import { AdventureStore } from "../adventure/save";
import { cleanName, charactersFromLegacy, freshCharacter, validateCharacter, type Character } from "./character";
import type { Dino } from "./types";

export interface TrashEntry {
  character: Character;
  deletedAt: number;
}
export interface CharacterBook {
  version: 2;
  /** last played character id */
  active: string | null;
  characters: Record<string, Character>;
  trash: TrashEntry[];
  updated: number;
}
export const emptyBook = (): CharacterBook => ({ version: 2, active: null, characters: {}, trash: [], updated: 0 });
export const TRASH_DAYS = 30;
export const MAX_CHARACTERS = 12;

export function validateBook(value: unknown): CharacterBook | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2) return null;
  const book = emptyBook();
  const chars = raw.characters && typeof raw.characters === "object" ? (raw.characters as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(chars).slice(0, 40)) {
    const c = validateCharacter(v, id);
    if (c) book.characters[id] = c;
  }
  for (const t of Array.isArray(raw.trash) ? raw.trash.slice(0, 40) : []) {
    const e = t as { character?: unknown; deletedAt?: unknown };
    const c = validateCharacter(e?.character);
    if (c && typeof e.deletedAt === "number" && Number.isFinite(e.deletedAt)) book.trash.push({ character: c, deletedAt: e.deletedAt });
  }
  book.active = typeof raw.active === "string" && book.characters[raw.active] ? raw.active : null;
  book.updated = typeof raw.updated === "number" && Number.isFinite(raw.updated) ? raw.updated : 0;
  return book;
}

/** total progress used to decide which copy of a book is "more complete" when recovering */
const weight = (b: CharacterBook) => Object.values(b.characters).reduce((n, c) => n + c.xp + c.bag.length * 3 + Object.keys(c.quests).length * 10, 0);

/** Merge two books (e.g. this device and the cloud): per character the higher `rev` wins; trash tombstones beat older revs. */
export function mergeBooks(a: CharacterBook, b: CharacterBook, now = Date.now()): CharacterBook {
  const out = emptyBook();
  const trash = new Map<string, TrashEntry>();
  for (const t of [...a.trash, ...b.trash]) {
    const cur = trash.get(t.character.id);
    if (!cur || t.deletedAt > cur.deletedAt) trash.set(t.character.id, t);
  }
  const ids = new Set([...Object.keys(a.characters), ...Object.keys(b.characters)]);
  for (const id of ids) {
    const x = a.characters[id],
      y = b.characters[id];
    const pick = !x ? y : !y ? x : y.rev > x.rev || (y.rev === x.rev && y.updated > x.updated) ? y : x;
    const t = trash.get(id);
    if (t && t.deletedAt >= pick.updated) continue; // deleted after its last change
    if (t) trash.delete(id); // changed after deletion: restored elsewhere
    out.characters[id] = pick;
  }
  out.trash = [...trash.values()].filter((t) => now - t.deletedAt < TRASH_DAYS * 864e5 && !out.characters[t.character.id]);
  const newest = a.updated >= b.updated ? a : b;
  out.active = (newest.active && out.characters[newest.active] ? newest.active : null) ?? (a.active && out.characters[a.active] ? a.active : null) ?? (b.active && out.characters[b.active] ? b.active : null);
  out.updated = Math.max(a.updated, b.updated);
  return out;
}

export type Recovery = "backup" | "good" | "legacy" | null;
export class CharacterStore {
  available = true;
  /** set when the last read had to fall back; the UI shows a plain-language notice then clears it */
  recovered: Recovery = null;
  private cache = new Map<string, CharacterBook>();
  constructor(private legacy = new AdventureStore(), private storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage) {}
  private key(pid: string, suffix = "") {
    return `trex_chars_v2_${pid}${suffix}`;
  }
  private parse(pid: string, suffix: string) {
    try {
      const text = this.storage?.getItem(this.key(pid, suffix));
      return text ? validateBook(JSON.parse(text)) : null;
    } catch {
      return null;
    }
  }
  /** Read the book; falls back primary → backup → good copy → legacy migration. A missing key just means "new profile". */
  read(pid: string, profileName = "Hatchling"): CharacterBook {
    const cached = this.cache.get(pid);
    if (cached) return cached;
    this.recovered = null;
    let book = this.parse(pid, "");
    const existed = !!this.storage?.getItem(this.key(pid));
    if (!book && existed) {
      try {
        this.storage?.setItem(this.key(pid, "_corrupt"), this.storage.getItem(this.key(pid)) ?? "");
      } catch {}
      book = this.parse(pid, "_backup");
      if (book) this.recovered = "backup";
      else {
        book = this.parse(pid, "_good");
        if (book) this.recovered = "good";
      }
    }
    if (!book) {
      book = emptyBook();
      const legacy = this.legacy.readExisting(pid);
      if (legacy) {
        for (const c of charactersFromLegacy(profileName, legacy)) book.characters[c.id] = c;
        const first = Object.values(book.characters).sort((x, y) => y.xp - x.xp)[0];
        book.active = Object.values(book.characters).find((c) => c.species === legacy.snapshot.dino)?.id ?? first?.id ?? null;
        if (Object.keys(book.characters).length) this.recovered = existed ? "legacy" : null;
      }
      if (Object.keys(book.characters).length) this.persist(pid, book);
    } else if (this.recovered) this.persist(pid, book);
    this.cache.set(pid, book);
    return book;
  }
  private persist(pid: string, book: CharacterBook) {
    if (!this.storage) return;
    try {
      const prev = this.storage.getItem(this.key(pid));
      const text = JSON.stringify(book);
      if (prev) {
        // keep the previous write as a backup, and promote it to the "good" copy only when it still validates
        this.storage.setItem(this.key(pid, "_backup"), prev);
        const old = this.parse(pid, "_backup");
        if (old && weight(old) >= weight(this.parse(pid, "_good") ?? emptyBook())) this.storage.setItem(this.key(pid, "_good"), prev);
      }
      this.storage.setItem(this.key(pid), text);
    } catch {
      this.available = false;
    }
  }
  /** replace the in-memory book (e.g. after a sync merge) and persist it */
  replace(pid: string, book: CharacterBook) {
    this.cache.set(pid, book);
    this.persist(pid, book);
    return book;
  }
  invalidate(pid?: string) {
    if (pid) this.cache.delete(pid);
    else this.cache.clear();
  }
  list(pid: string, profileName?: string): Character[] {
    return Object.values(this.read(pid, profileName).characters).sort((a, b) => b.updated - a.updated);
  }
  get(pid: string, id: string) {
    return this.read(pid).characters[id] ?? null;
  }
  create(pid: string, name: string, species: Dino, now = Date.now()): Character | null {
    const book = this.read(pid);
    if (Object.keys(book.characters).length >= MAX_CHARACTERS) return null;
    const c = freshCharacter(name, species, now);
    book.characters[c.id] = c;
    book.active = c.id;
    book.updated = now;
    this.persist(pid, book);
    return c;
  }
  /** write a character; bumps its rev so a sync merge prefers it */
  save(pid: string, c: Character, now = Date.now()): Character {
    const book = this.read(pid);
    const prev = book.characters[c.id];
    if (!prev && book.trash.some((t) => t.character.id === c.id)) return c; // deleted: never resurrect from a stale autosave
    c.rev = Math.max(c.rev, prev?.rev ?? 0) + 1;
    c.updated = now;
    book.characters[c.id] = c;
    book.active = c.id;
    book.updated = now;
    this.persist(pid, book);
    return c;
  }
  remove(pid: string, id: string, now = Date.now()): boolean {
    const book = this.read(pid);
    const c = book.characters[id];
    if (!c) return false;
    delete book.characters[id];
    book.trash = [{ character: c, deletedAt: now }, ...book.trash.filter((t) => t.character.id !== id)].slice(0, 20);
    if (book.active === id) book.active = Object.keys(book.characters)[0] ?? null;
    book.updated = now;
    this.persist(pid, book);
    return true;
  }
  trash(pid: string, now = Date.now()) {
    return this.read(pid).trash.filter((t) => now - t.deletedAt < TRASH_DAYS * 864e5);
  }
  restore(pid: string, id: string, now = Date.now()): Character | null {
    const book = this.read(pid);
    const entry = book.trash.find((t) => t.character.id === id);
    if (!entry || book.characters[id]) return null;
    book.trash = book.trash.filter((t) => t !== entry);
    entry.character.updated = now;
    entry.character.rev += 1;
    book.characters[id] = entry.character;
    book.updated = now;
    this.persist(pid, book);
    return entry.character;
  }
  /** permanently drop a character's local data when the profile itself is deleted (the legacy keys are removed by SaveStore) */
  purgeProfile(pid: string) {
    this.cache.delete(pid);
    try {
      for (const s of ["", "_backup", "_good"]) this.storage?.removeItem(this.key(pid, s));
    } catch {}
  }
}
