import {
  SaveStore,
  mergeProgress,
  type Profile,
  type Progress,
} from "./storage";
import { firebaseConfig } from "./firebase-config";
/** Firebase is lazy-loaded; local play never waits for network availability. */
export async function connectSync(
  store: SaveStore,
  status: (s: string) => void,
) {
  const queued = new Map<string, unknown>();
  let send: ((key: string, data: unknown) => Promise<void>) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (!send) return;
    for (const [key, data] of [...queued]) {
      try {
        await send(key, data);
        if (queued.get(key) === data) queued.delete(key);
      } catch {
        status("Offline · saves on this device");
        break;
      }
    }
  };
  store.onSave = (key, data) => {
    if (key === "settings") return;
    if (key === "profiles") {
      for (const p of data as Profile[]) queued.set("profile_" + p.id, p);
    } else if (key === "deleted") {
      for (const id of data as string[])
        queued.set("deleted_" + id, { id, at: Date.now() });
    } else queued.set(key, data);
    clearTimeout(timer);
    timer = setTimeout(flush, 3000);
  };
  const connect = async () => {
    try {
      const [appApi, authApi, dbApi] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const app =
        appApi.getApps().find((a) => a.name === "tiny-rex-phaser") ??
        appApi.initializeApp(firebaseConfig, "tiny-rex-phaser");
      await authApi.signInAnonymously(authApi.getAuth(app));
      const db = dbApi.getFirestore(app);
      const snapshots = await dbApi.getDocs(dbApi.collection(db, "tinyrex"));
      const remoteProfiles: Profile[] = [],
        remoteProgress = new Map<string, Progress>(),
        deleted = new Set(store.read<string[]>("deleted", []));
      for (const d of snapshots.docs) {
        if (d.id.startsWith("deleted_")) deleted.add(d.id.slice(8));
        else if (d.id.startsWith("profile_"))
          remoteProfiles.push(d.data() as Profile);
        else if (d.id.startsWith("progress_"))
          remoteProgress.set(d.id.slice(9), d.data() as Progress);
      }
      const byId = new Map(
        store.profiles.filter((p) => !deleted.has(p.id)).map((p) => [p.id, p]),
      );
      for (const p of remoteProfiles) {
        if (deleted.has(p.id)) continue;
        const old = byId.get(p.id);
        if (!old || p.updated > old.updated) byId.set(p.id, p);
      }
      store.write("deleted", [...deleted], false);
      store.write("profiles", [...byId.values()], false);
      for (const p of byId.values()) {
        queued.set("profile_" + p.id, p);
        const local = store.progress(p.id),
          remote = remoteProgress.get(p.id);
        const merged = remote ? mergeProgress(local, remote) : local;
        store.write("progress_" + p.id, merged, false);
        queued.set("progress_" + p.id, merged);
      }
      for (const id of deleted) {
        try {
          localStorage.removeItem("trex_progress_" + id);
        } catch {}
        queued.delete("profile_" + id);
        queued.delete("progress_" + id);
        queued.set("deleted_" + id, { id, at: Date.now() });
      }
      send = async (key, data) => {
        await dbApi.setDoc(
          dbApi.doc(db, "tinyrex", key),
          data as Record<string, unknown>,
        );
        if (key.startsWith("deleted_")) {
          const id = key.slice(8);
          await dbApi.deleteDoc(dbApi.doc(db, "tinyrex", "profile_" + id));
          await dbApi.deleteDoc(dbApi.doc(db, "tinyrex", "progress_" + id));
        }
      };
      await flush();
      status("Family sync connected");
      store.onChange();
    } catch {
      status("Offline · saves on this device");
    }
  };
  window.addEventListener("online", () => void connect());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flush();
  });
  window.addEventListener("pagehide", () => void flush());
  await connect();
}
