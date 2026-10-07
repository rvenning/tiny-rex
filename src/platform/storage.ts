import type { Result } from "../game/types";
import { validateProfile, validateProgress } from "./validation";
export interface Profile {
  id: string;
  name: string;
  avatar: string;
  pin: string | null;
  created: number;
  updated: number;
}
export interface Progress {
  levels: Record<string, { stars: number; best: number }>;
  met: Record<string, number>;
  feastBest: number;
  feastTier: number;
  catches: number;
  updated: number;
  [key: string]: unknown;
}
export interface Settings {
  sound: boolean;
  lastProfile: string | null;
  motion?: boolean;
}
export const blankProgress = (): Progress => ({
  levels: {},
  met: {},
  feastBest: 0,
  feastTier: 0,
  catches: 0,
  updated: 0,
});
export function mergeProgress(a: Progress, b: Progress): Progress {
  const levels = { ...a.levels };
  for (const [key, r] of Object.entries(b.levels || {})) {
    const old = levels[key];
    levels[key] = {
      stars: Math.max(old?.stars || 0, r.stars || 0),
      best: Math.max(old?.best || 0, r.best || 0),
    };
  }
  return {
    ...a,
    ...b,
    levels,
    met: { ...a.met, ...b.met },
    feastBest: Math.max(a.feastBest || 0, b.feastBest || 0),
    feastTier: Math.max(a.feastTier || 0, b.feastTier || 0),
    catches: Math.max(a.catches || 0, b.catches || 0),
    updated: Math.max(a.updated || 0, b.updated || 0),
  };
}
export class SaveStore {
  onChange = () => {};
  onSave: (key: string, value: unknown) => void = () => {};
  available = true;
  read<T>(key: string, fallback: T): T {
    try {
      return (
        JSON.parse(localStorage.getItem("trex_" + key) || "null") ?? fallback
      );
    } catch {
      return fallback;
    }
  }
  write(key: string, data: unknown, remote = true) {
    try {
      localStorage.setItem("trex_" + key, JSON.stringify(data));
    } catch {
      this.available = false;
    }
    if (remote) this.onSave(key, data);
    if (key !== "settings") this.onChange();
  }
  get profiles() {
    const raw = this.read<unknown>("profiles", []);
    return Array.isArray(raw)
      ? raw
          .map((p) => validateProfile(p))
          .filter((p): p is Profile => p !== null)
      : [];
  }
  get settings() {
    return this.read<Settings>("settings", { sound: true, lastProfile: null });
  }
  progress(id: string) {
    return validateProgress(
      this.read<unknown>("progress_" + id, blankProgress()),
    );
  }
  add(name: string, avatar: string, pin: string | null) {
    const now = Date.now(),
      p = {
        id: "p" + now + Math.floor(Math.random() * 1e4),
        name,
        avatar,
        pin,
        created: now,
        updated: now,
      };
    this.write("profiles", [...this.profiles, p], false);
    this.onSave("profile_" + p.id, p);
    return p;
  }
  update(p: Profile) {
    p.updated = Date.now();
    this.write(
      "profiles",
      this.profiles.map((x) => (x.id === p.id ? p : x)),
      false,
    );
    this.onSave("profile_" + p.id, p);
  }
  remove(id: string) {
    this.write(
      "deleted",
      [...new Set([...this.read<string[]>("deleted", []), id])],
      false,
    );
    this.onSave("deleted_" + id, { id, at: Date.now() });
    this.write(
      "profiles",
      this.profiles.filter((p) => p.id !== id),
      false,
    );
    try {
      localStorage.removeItem("trex_progress_" + id);
    } catch {}
    const s = this.settings;
    if (s.lastProfile === id)
      this.write("settings", { ...s, lastProfile: null });
  }
  record(id: string, res: Result) {
    const p = this.progress(id);
    p.met = { ...p.met, ...res.met };
    p.catches += res.catches;
    if (res.mode === "feast") {
      p.feastBest = Math.max(p.feastBest, res.score);
      p.feastTier = Math.max(p.feastTier, res.tier);
    } else if (res.win) {
      const old = p.levels[res.levelIdx];
      p.levels[res.levelIdx] = {
        stars: Math.max(old?.stars || 0, res.stars),
        best: Math.max(old?.best || 0, res.score),
      };
    }
    p.updated = Date.now();
    this.write("progress_" + id, p);
    return p;
  }
}
export const unlocked = (p: Progress) =>
  Math.min(19, Math.max(-1, ...Object.keys(p.levels).map(Number)) + 1);
export const totalStars = (p: Progress) =>
  Object.values(p.levels).reduce((n, v) => n + v.stars, 0);
