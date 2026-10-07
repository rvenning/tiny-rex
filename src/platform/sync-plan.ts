import {
  SaveStore,
  mergeProgress,
  type Profile,
  type Progress,
} from "./storage";
import { validateProfile, validateProgress, validId } from "./validation";
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
export function reconcile(
  store: SaveStore,
  docs: { id: string; data: unknown }[],
  queued: Map<string, unknown>,
) {
  const remoteProfiles = new Map<string, Profile>(),
    remoteProgress = new Map<string, Progress>(),
    remoteDeleted = new Set<string>();
  const localDeleted = store.read<unknown>("deleted", []);
  const deleted = new Set(
    Array.isArray(localDeleted) ? localDeleted.filter(validId) : [],
  );
  for (const doc of docs) {
    if (doc.id.startsWith("deleted_") && validId(doc.id.slice(8))) {
      remoteDeleted.add(doc.id.slice(8));
      deleted.add(doc.id.slice(8));
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
    } catch {}
    queued.delete("profile_" + id);
    queued.delete("progress_" + id);
    if (!remoteDeleted.has(id) && !queued.has("deleted_" + id))
      queued.set("deleted_" + id, { id, at: Date.now() });
    else if (remoteDeleted.has(id)) queued.delete("deleted_" + id);
  }
}
