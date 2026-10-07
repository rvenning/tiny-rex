import type { Profile, Progress } from "./storage";
export const AVATARS = [
  "🦖",
  "🦕",
  "🐊",
  "🦎",
  "🐢",
  "🦅",
  "🐉",
  "🦊",
  "🐻",
  "🦉",
  "🐙",
  "⭐",
];
export const PARENT_PIN = "7777"; // Original family convenience override, not authentication.
export const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const number = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(v, max))
    : 0;
export function validateProfile(
  value: unknown,
  expectedId?: string,
): Profile | null {
  const p = record(value);
  if (
    !validId(p.id) ||
    (expectedId !== undefined && p.id !== expectedId) ||
    typeof p.name !== "string" ||
    !p.name.trim()
  )
    return null;
  return {
    id: p.id,
    name: p.name.trim().slice(0, 24),
    avatar:
      typeof p.avatar === "string" && AVATARS.includes(p.avatar)
        ? p.avatar
        : AVATARS[0],
    pin: typeof p.pin === "string" && /^\d{4}$/.test(p.pin) ? p.pin : null,
    created: number(p.created),
    updated: number(p.updated),
  };
}
export const matchesProfilePin = (profile: Profile, input: string) =>
  input === profile.pin || input === PARENT_PIN;
export function validateProgress(value: unknown): Progress {
  const p = record(value);
  return {
    ...p,
    levels: Object.fromEntries(
      Object.entries(record(p.levels))
        .filter(([id]) => /^\d{1,2}$/.test(id))
        .map(([id, v]) => {
          const level = record(v);
          return [
            id,
            { stars: number(level.stars, 3), best: number(level.best) },
          ];
        }),
    ),
    met: Object.fromEntries(
      Object.entries(record(p.met))
        .filter(([id, v]) => validId(id) && number(v) > 0)
        .map(([id]) => [id, 1]),
    ),
    feastBest: number(p.feastBest),
    feastTier: number(p.feastTier, 7),
    catches: number(p.catches),
    updated: number(p.updated),
  };
}
