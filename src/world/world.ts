import { WorldGrid, type GridMeta } from "./grid";
export interface WorldMeta extends GridMeta {
  version: number;
  pois: Record<string, [number, number]>;
  features: { kind: string; x: number; y: number; [k: string]: unknown }[];
  /** [name, variant, x, y, z, scale] sorted by x+y */
  props: [string, number, number, number, number, number][];
  water: [number, number][];
  tileSize?: number;
  tileGutter?: number;
  canvas?: {
    ox: number;
    oy: number;
    ppu: number;
    tile: number;
    w: number;
    h: number;
  };
  tiles?: { tx: number; ty: number; file: string }[];
}
export interface World {
  meta: WorldMeta;
  grid: WorldGrid;
}
export function parseWorld(meta: WorldMeta, raw: Uint8Array): World {
  const expected = meta.nx * meta.ny * 4;
  if (
    !Number.isSafeInteger(expected) ||
    expected <= 0 ||
    raw.length !== expected
  ) {
    throw new Error(
      `World collision grid has ${raw.length} bytes; expected ${expected}`,
    );
  }
  return { meta, grid: new WorldGrid(meta, raw) };
}
/** Browsers already decompress responses served with Content-Encoding: gzip.
 * Static hosts can also serve the same .gz file as opaque bytes, so inspect the body. */
export async function decodeWorldBytes(buf: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([buf])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function loadWorld(
  base = import.meta.env.BASE_URL + "world/",
): Promise<World> {
  const [metaRes, binRes] = await Promise.all([
    fetch(base + "world.json"),
    fetch(base + "world.bin.gz"),
  ]);
  if (!metaRes.ok || !binRes.ok)
    throw new Error(
      `World request failed: metadata ${metaRes.status}, collision grid ${binRes.status}`,
    );
  const meta = (await metaRes.json()) as WorldMeta;
  const raw = await decodeWorldBytes(await binRes.arrayBuffer());
  return parseWorld(meta, raw);
}
