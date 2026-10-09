import { WorldGrid, type GridMeta } from "./grid";
export interface WorldMeta extends GridMeta {
  version: number;
  pois: Record<string, [number, number]>;
  features: { kind: string; x: number; y: number; [k: string]: unknown }[];
  /** [name, variant, x, y, z, scale] sorted by x+y */
  props: [string, number, number, number, number, number][];
  water: [number, number][];
  tileSize?: number;
  canvas?: { ox: number; oy: number; ppu: number; tile: number; w: number; h: number };
  tiles?: { tx: number; ty: number; file: string }[];
}
export interface World {
  meta: WorldMeta;
  grid: WorldGrid;
}
export function parseWorld(meta: WorldMeta, raw: Uint8Array): World {
  return { meta, grid: new WorldGrid(meta, raw) };
}
async function gunzip(buf: ArrayBuffer) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function loadWorld(base = import.meta.env.BASE_URL + "world/"): Promise<World> {
  const [metaRes, binRes] = await Promise.all([fetch(base + "world.json"), fetch(base + "world.bin.gz")]);
  const meta = (await metaRes.json()) as WorldMeta;
  const raw = await gunzip(await binRes.arrayBuffer());
  return parseWorld(meta, raw);
}
