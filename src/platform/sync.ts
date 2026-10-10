import { SaveStore, mergeProgress } from "./storage";
import { validateProfile, validateProgress } from "./validation";
import { reconcile } from "./sync-plan";
import { firebaseConfig } from "./firebase-config";
import { mergeAdventure, validateAdventure } from "../adventure/save";
import { validateCharacter } from "../rpg/character";
import type { CharacterStore } from "../rpg/store";
/** Lazy cloud adapter. Local play/saves never wait for connectivity. */
export async function connectSync(
  store: SaveStore,
  status: (s: string) => void,
  characters?: CharacterStore,
) {
  const queued = new Map<string, unknown>();
  let send: ((key: string, data: unknown) => Promise<void>) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<boolean> | undefined;
  let connecting = false;
  const flush = (): Promise<boolean> => {
    clearTimeout(timer);
    timer = undefined;
    if (flushing) return flushing;
    if (!send) return Promise.resolve(false);
    flushing = (async () => {
      for (const [key, data] of [...queued]) {
        try {
          await send!(key, data);
          if (queued.get(key) === data) queued.delete(key);
        } catch {
          status("Offline · saves on this device");
          return false;
        }
      }
      return true;
    })().finally(() => {
      flushing = undefined;
    });
    // Saves queued while this flush was running were not in its snapshot.
    void flushing.then((ok) => {
      if (ok && queued.size) timer = setTimeout(() => void flush(), 3000);
    });
    return flushing;
  };
  store.onSave = (key, data) => {
    // Roster and tombstone lists are local indexes, never whole-roster writes.
    if (key === "settings" || key === "profiles" || key === "deleted") return;
    queued.set(key, data);
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 3000);
  };
  const connect = async () => {
    if (connecting) return;
    connecting = true;
    try {
      const [appApi, authApi, dbApi] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const app =
        appApi.getApps().find((a) => a.name === "tiny-rex-phaser") ??
        appApi.initializeApp(firebaseConfig, "tiny-rex-phaser");
      try {
        await authApi.signInAnonymously(authApi.getAuth(app));
      } catch {
        /* Firestore rules still decide access; local saves remain available. */
      }
      const db = dbApi.getFirestore(app);
      const snapshot = await dbApi.getDocs(dbApi.collection(db, "tinyrex"));
      reconcile(
        store,
        snapshot.docs.map((d) => ({ id: d.id, data: d.data() })),
        queued,
        characters,
      );
      send = async (key, data) => {
        const ref = dbApi.doc(db, "tinyrex", key);
        await dbApi.runTransaction(db, async (tx) => {
          if (key.startsWith("deleted_")) {
            const existing = await tx.get(ref);
            if (existing.exists()) return;
            const id = key.slice(8);
            tx.set(ref, data as Record<string, unknown>);
            tx.delete(dbApi.doc(db, "tinyrex", "profile_" + id));
            tx.delete(dbApi.doc(db, "tinyrex", "progress_" + id));
            tx.delete(dbApi.doc(db, "tinyrex", "adventure_v1_" + id));
            return;
          }
          const id = key.startsWith("adventure_v1_")
            ? key.slice(13)
            : key.startsWith("profile_")
              ? key.slice(8)
              : key.slice(9);
          const [current, tombstone] = await Promise.all([
            tx.get(ref),
            tx.get(dbApi.doc(db, "tinyrex", "deleted_" + id)),
          ]);
          if (tombstone.exists()) return;
          if (key.startsWith("profile_")) {
            const incoming = validateProfile(data, id),
              remote = validateProfile(current.data(), id);
            if (!incoming || (remote && remote.updated >= incoming.updated))
              return;
            tx.set(ref, { ...incoming });
          } else if (key.startsWith("adventure_v1_")) {
            const incoming = validateAdventure(data);
            tx.set(
              ref,
              current.exists()
                ? mergeAdventure(validateAdventure(current.data()), incoming)
                : incoming,
            );
          } else if (key.startsWith("progress_")) {
            const incoming = validateProgress(data);
            tx.set(
              ref,
              current.exists()
                ? mergeProgress(validateProgress(current.data()), incoming)
                : incoming,
            );
          }
        });
      };
      if (await flush()) status("Family sync connected");
      store.onChange();
    } catch {
      status("Offline · saves on this device");
    } finally {
      connecting = false;
    }
  };
  window.addEventListener("online", () => void connect());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flush();
  });
  window.addEventListener("pagehide", () => void flush());
  await connect();
}
