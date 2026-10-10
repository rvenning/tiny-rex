import {
  SaveStore,
  mergeProgress,
  type Profile,
  type Progress,
} from "./storage";
import { validateProfile, validateProgress, validId } from "./validation";
import { CharacterStore, mergeBooks, emptyBook, type CharacterBook } from "../rpg/store";
import { validateCharacter } from "../rpg/character";
import {
  AdventureStore,
  mergeAdventure,
  validateAdventure,
  type AdventureSave,
} from "../adventure/save";
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>,
    keys = Object.keys(x);
  return (
    keys.length === Object.keys(y).length &&
    keys.every((k) => Object.hasOwn(y, k) && sameData(x[k], y[k]))
  );
}
export const charDocId = (profile: string, character: string) => "char_" + profile + "__" + character;
export const charDelDocId = (profile: string, character: string) => "chardel_" + profile + "__" + character;
const splitDoc = (id: string, prefix: string) => {
  const rest = id.slice(prefix.length);
  const i = rest.indexOf("__");
  return i > 0 ? { profile: rest.slice(0, i), character: rest.slice(i + 2) } : null;
};
export function reconcile(
  store: SaveStore,
  docs: { id: string; data: unknown }[],
  queued: Map<string, unknown>,
  characters = new CharacterStore(),
) {
  const remoteProfiles = new Map<string, Profile>(),
    remoteProgress = new Map<string, Progress>(),
    remoteDeleted = new Set<string>();
  const localDeleted = store.read<unknown>("deleted", []);
  const remoteAdventures = new Map<string, AdventureSave>();
  const remoteBooks = new Map<string, CharacterBook>();
  const adventureStore = new AdventureStore();
  const deleted = new Set(
    Array.isArray(localDeleted) ? localDeleted.filter(validId) : [],
  );
  for (const doc of docs) {
    if (doc.id.startsWith("deleted_") && validId(doc.id.slice(8))) {
      remoteDeleted.add(doc.id.slice(8));
      deleted.add(doc.id.slice(8));
    } else if (
      doc.id.startsWith("adventure_v1_") &&
      validId(doc.id.slice(13))
    ) {
      remoteAdventures.set(doc.id.slice(13), validateAdventure(doc.data));
    } else if (doc.id.startsWith("char_") || doc.id.startsWith("chardel_")) {
      const del = doc.id.startsWith("chardel_");
      const ref = splitDoc(doc.id, del ? "chardel_" : "char_");
      if (!ref || !validId(ref.profile) || !validId(ref.character)) continue;
      const book = remoteBooks.get(ref.profile) ?? emptyBook();
      if (del) {
        const c = (doc.data as { character?: unknown } | undefined)?.character;
        const at = Number((doc.data as { at?: unknown } | undefined)?.at ?? 0);
        const ch = validateCharacter(c, ref.character);
        if (ch) book.trash.push({ character: ch, deletedAt: at });
      } else {
        const ch = validateCharacter(doc.data, ref.character);
        if (ch) book.characters[ch.id] = ch;
      }
      remoteBooks.set(ref.profile, book);
    } else if (doc.id.startsWith("profile_")) {
      const p = validateProfile(doc.data, doc.id.slice(8));
      if (p) remoteProfiles.set(p.id, p);
    } else if (doc.id.startsWith("progress_") && validId(doc.id.slice(9)))
      remoteProgress.set(doc.id.slice(9), validateProgress(doc.data));
  }
  const byId = new Map(
    store.profiles.filter((p) => !deleted.has(p.id)).map((p) => [p.id, p]),
  );
  for (const p of remoteProfiles.values()) {
    if (deleted.has(p.id)) continue;
    const local = byId.get(p.id);
    if (!local || p.updated > local.updated) byId.set(p.id, p);
  }
  store.write("deleted", [...deleted], false);
  store.write("profiles", [...byId.values()], false);
  for (const p of byId.values()) {
    // characters: merge the cloud's per-character documents into this device's book, then queue whatever the cloud lacks
    const localBook = characters.read(p.id, p.name);
    const cloud = remoteBooks.get(p.id);
    const mergedBook = cloud ? mergeBooks(localBook, cloud) : localBook;
    if (cloud) characters.replace(p.id, mergedBook);
    for (const c of Object.values(mergedBook.characters)) {
      const remote = cloud?.characters[c.id];
      if (!remote || remote.rev < c.rev || (remote.rev === c.rev && remote.updated < c.updated)) queued.set(charDocId(p.id, c.id), c);
      else queued.delete(charDocId(p.id, c.id));
    }
    for (const t of mergedBook.trash) {
      if (!cloud?.trash.some((x) => x.character.id === t.character.id)) queued.set(charDelDocId(p.id, t.character.id), { character: t.character, at: t.deletedAt });
    }
    const localAdventure = adventureStore.read(p.id);
    const remoteAdventure = remoteAdventures.get(p.id);
    const adventure = remoteAdventure
      ? mergeAdventure(localAdventure, remoteAdventure)
      : localAdventure;
    if (remoteAdventure) adventureStore.write(p.id, adventure);
    if (adventure.updated > 0 && !sameData(adventure, remoteAdventure))
      queued.set("adventure_v1_" + p.id, adventure);
    else queued.delete("adventure_v1_" + p.id);
    if (!sameData(p, remoteProfiles.get(p.id)))
      queued.set("profile_" + p.id, p);
    else queued.delete("profile_" + p.id);
    const local = store.progress(p.id),
      remote = remoteProgress.get(p.id),
      merged = remote ? mergeProgress(local, remote) : local;
    store.write("progress_" + p.id, merged, false);
    if (!sameData(merged, remote)) queued.set("progress_" + p.id, merged);
    else queued.delete("progress_" + p.id);
  }
  for (const id of deleted) {
    try {
      localStorage.removeItem("trex_progress_" + id);
      localStorage.removeItem("trex_adventure_v1_" + id);
      localStorage.removeItem("trex_adventure_v1_" + id + "_backup");
    } catch {}
    queued.delete("profile_" + id);
    queued.delete("progress_" + id);
    queued.delete("adventure_v1_" + id);
    if (!remoteDeleted.has(id) && !queued.has("deleted_" + id))
      queued.set("deleted_" + id, { id, at: Date.now() });
    else if (remoteDeleted.has(id)) queued.delete("deleted_" + id);
  }
}
