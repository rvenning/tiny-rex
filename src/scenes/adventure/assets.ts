import * as Phaser from "phaser";

/** Runtime atlas registry. Art lives in public/art/** (packed by tools/art/pack.py) and is loaded on demand. */
export interface PoseInfo {
  frames: number;
  fps: number;
  loop: boolean;
}
export interface CreatureInfo {
  poses: Record<string, PoseInfo>;
  r?: number;
  length?: number;
  height?: number;
}
const BASE = import.meta.env.BASE_URL + "art/";
const infos = new Map<string, CreatureInfo>();
const pending = new Map<string, Promise<boolean>>();
const missing = new Set<string>();

export const atlasKey = (id: string) => "cr-" + id;
export const creatureInfo = (id: string) => infos.get(id);
export const hasCreature = (scene: Phaser.Scene, id: string) => infos.has(id) && scene.textures.exists(atlasKey(id));

/** Load a creature atlas once; resolves false (never rejects) when the art is not shipped yet. */
export function loadCreature(scene: Phaser.Scene, id: string): Promise<boolean> {
  if (hasCreature(scene, id)) return Promise.resolve(true);
  if (missing.has(id)) return Promise.resolve(false);
  const have = pending.get(id);
  if (have) return have;
  const p = new Promise<boolean>((resolve) => {
    const key = atlasKey(id);
    const url = `${BASE}creatures/${id}.json`;
    const onDone = (file: Phaser.Loader.File) => {
      if (file.key !== key) return;
      scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onDone);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFail);
      // the atlas json was parsed by Phaser; fetch the meta ourselves (poses, fps)
      fetch(url)
        .then((r) => r.json())
        .then((j) => {
          const poses = (j.meta?.poses ?? {}) as Record<string, PoseInfo>;
          infos.set(id, { poses, r: j.meta?.r, length: j.meta?.length, height: j.meta?.height });
          resolve(true);
        })
        .catch(() => resolve(false));
    };
    const onFail = (file: Phaser.Loader.File) => {
      if (file.key !== key) return;
      scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onDone);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFail);
      missing.add(id);
      resolve(false);
    };
    scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, onDone);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFail);
    scene.load.multiatlas(key, url, `${BASE}creatures/`);
    if (!scene.load.isLoading()) scene.load.start();
  });
  pending.set(id, p);
  return p;
}
export function unloadCreature(scene: Phaser.Scene, id: string) {
  const key = atlasKey(id);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  infos.delete(id);
  pending.delete(id);
}

/** Props (foliage, rocks, logs): one shared atlas set. */
export interface PropFrame {
  key: string;
  kind: "solid" | "soft" | "deco";
  h: number;
  r: number;
}
export const PROPS_KEY = "props";
export const propVariants = new Map<string, number>();
export const propMeta = new Map<string, PropFrame>();
export function loadProps(scene: Phaser.Scene): Promise<boolean> {
  return new Promise((resolve) => {
    if (scene.textures.exists(PROPS_KEY)) return resolve(true);
    const done = () => {
      const tex = scene.textures.get(PROPS_KEY);
      propVariants.clear();
      for (const name of tex.getFrameNames()) {
        const [n, v] = name.split("/");
        propVariants.set(n, Math.max(propVariants.get(n) ?? 0, Number(v) + 1));
      }
      fetch(`${BASE}props/props.json`)
        .then((r) => r.json())
        .then((j) => {
          for (const t of j.textures ?? [])
            for (const [name, f] of Object.entries<{ meta?: { kind?: PropFrame["kind"]; h?: number; r?: number } }>(t.frames))
              propMeta.set(name, { key: name, kind: f.meta?.kind ?? "deco", h: f.meta?.h ?? 1, r: f.meta?.r ?? 0 });
          resolve(true);
        })
        .catch(() => resolve(true));
    };
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => resolve(false));
    scene.load.multiatlas(PROPS_KEY, `${BASE}props/props.json`, `${BASE}props/`);
    scene.load.once(`filecomplete-multiatlas-${PROPS_KEY}`, done);
    if (!scene.load.isLoading()) scene.load.start();
  });
}
