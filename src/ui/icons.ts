/** Hand-drawn SVG glyphs shared by the HUD and menus. Everything is currentColor so rarity and state tint them from CSS. */
const svg = (body: string, vb = "0 0 64 64") => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const f = (d: string, extra = "") => `<path fill="currentColor" ${extra} d="${d}"/>`;
const s = (d: string, w = 5) => `<path fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;

export const ICONS: Record<string, string> = {
  bite: svg(f("M7 31c4-13 15-21 25-21s21 8 25 21l-5 2-4-6-4 7-4-6-4 7-4-6-4 7-4-6-4 7-4-6-4 7z") + f("M9 38l5 2 4-6 4 7 4-6 4 7 4-6 4 7 4-6 4 7 5-2c-3 11-13 17-24 17S12 49 9 38z")),
  dodge: svg(f("M10 20h22l-6 6H10zM6 32h28l-6 6H6zM14 44h20l-6 6H14z", 'opacity=".6"') + f("M34 14l22 18-22 18v-11H24V25h10z")),
  roar: svg(f("M8 40c0-10 7-18 17-18l12-6 4 8 6 2-6 6 6 12-14-4-8 8-4-8c-9 0-13-4-13-12z") + s("M46 24c4 3 6 6 6 10M52 18c6 5 9 10 9 16", 4)),
  pounce: svg(s("M10 48C20 18 40 12 54 22M54 22l-14-2M54 22l-4 13", 6)),
  charge: svg(f("M6 40c4-12 16-18 30-16l14-10-2 14 8 8-14 2-6 10-6-9-24-3z") + f("M2 30h14v4H2zM0 40h12v4H0z", 'opacity=".6"')),
  sweep: svg(s("M12 40a22 22 0 1 1 30 14", 6) + f("M38 46l10 12 4-16z")),
  stomp: svg(f("M20 10h24v18l8 6H12l8-6z") + s("M10 48h44M16 56h32", 5)),
  frenzy: svg(f("M32 4c4 10 14 14 14 28 0 8-6 14-14 14S18 40 18 32c0-6 4-8 6-14 4 4 4 8 8 8-2-8 0-14 0-22z") + f("M24 50h16v8H24z")),
  flurry: svg(s("M10 52L30 12M26 56L46 16M42 58l12-26", 6)),
  screech: svg(f("M14 24h12l14-10v36L26 40H14z") + s("M48 22c4 6 4 14 0 20M54 16c8 10 8 22 0 32", 4)),
  shadow: svg(f("M32 6c10 8 18 18 14 34-2 8-8 14-14 18-6-4-12-10-14-18C14 24 22 14 32 6z", 'opacity=".5"') + f("M32 20c6 6 10 12 8 22-2 4-4 6-8 8-4-2-6-4-8-8-2-10 2-16 8-22z")),
  brace: svg(f("M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z") + f("M32 16v34", 'stroke="#0008" stroke-width="3"')),
  toss: svg(f("M30 56V28l-8 6-4-6 14-14 14 14-4 6-8-6v28z") + s("M10 20c4-4 8-4 12-2M54 20c-4-4-8-4-12-2", 4)),
  bellow: svg(f("M10 28h12l16-12v32L22 36H10z") + s("M44 24c3 5 3 11 0 16M50 18c6 8 6 20 0 28M56 12c9 11 9 29 0 40", 3.5)),
  lock: svg(f("M16 28h32v26H16z") + s("M22 28v-8a10 10 0 0 1 20 0v8", 6)),
  pause: svg(f("M7 5h4v14H7zM13 5h4v14h-4z"), "0 0 24 24"),
  book: svg(s("M12 6.5C9.8 5 7 4.6 4 5v13c3-.4 5.8.1 8 1.6 2.2-1.5 5-2 8-1.6V5c-3-.4-5.8 0-8 1.5zM12 6.5v13", 2), "0 0 24 24"),
  pack: svg(f("M32 6c8 0 14 6 14 12v4h6c4 0 6 3 6 6v24c0 4-3 6-6 6H12c-3 0-6-2-6-6V28c0-3 2-6 6-6h6v-4C18 12 24 6 32 6zm0 8c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z") + f("M22 38h20v6H22z", 'opacity=".45"')),
  tree: svg(s("M32 56V30M32 30L16 16M32 30l16-14M32 30V10", 5) + `<circle cx="16" cy="14" r="6" fill="currentColor"/><circle cx="48" cy="14" r="6" fill="currentColor"/><circle cx="32" cy="8" r="6" fill="currentColor"/><circle cx="32" cy="56" r="5" fill="currentColor"/>`),
  amber: svg(f("M32 4C22 18 14 28 14 40a18 18 0 0 0 36 0C50 28 42 18 32 4z") + f("M24 38c0-6 4-10 6-14", 'opacity=".5" stroke="#fff" stroke-width="3" fill="none"')),
  leaf: svg(f("M10 54C8 30 24 10 54 8c0 28-14 46-40 48z") + s("M14 52L40 26", 3)),
  // mutation slots
  "slot-jaws": svg(f("M6 28c4-12 14-18 26-18s22 6 26 18l-6 2-4-6-4 7-4-6-4 7-4-6-4 7-4-6-4 7-4-6z") + f("M8 38l6 2 4-6 4 7 4-6 4 7 4-6 4 7 4-6 5 6c-4 10-12 15-24 15S12 48 8 38z")),
  "slot-claws": svg(s("M14 54C14 34 22 16 30 8M30 56C30 36 38 20 46 12M46 56C46 40 52 28 58 20", 6)),
  "slot-horns": svg(f("M10 56c-2-18 6-32 20-42-2 12 2 22 10 32z") + f("M54 56c2-18-6-32-20-42 2 12-2 22-10 32z") + f("M28 56l4-24 4 24z")),
  "slot-hide": svg(f("M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z", 'opacity=".55"') + f("M32 12l6 5-6 5-6-5zM22 24l6 5-6 5-6-5zM42 24l6 5-6 5-6-5zM32 34l6 5-6 5-6-5z")),
  "slot-legs": svg(f("M24 6h16v22l8 10-4 6-12-8-12 8-4-6 8-10z") + f("M14 52h16v6H14zM34 52h16v6H34z")),
  "slot-tail": svg(s("M10 20C28 8 54 24 50 40c-2 8-12 10-22 6", 8) + f("M28 46l-2 12 12-8z")),
  "slot-instinct": svg(`<circle cx="32" cy="32" r="12" fill="currentColor"/>` + s("M6 32C16 18 48 18 58 32 48 46 16 46 6 32z", 4)),
  shock: svg(f("M36 4L12 36h14l-4 24 26-34H34z")),
  bleed: svg(f("M32 4C22 18 14 28 14 40a18 18 0 0 0 36 0C50 28 42 18 32 4z")),
  poison: svg(f("M32 4c10 14 18 24 18 36a18 18 0 0 1-36 0C14 28 22 18 32 4z", 'opacity=".5"') + f("M24 36h16v6H24zM28 28h8v6h-8z")),
  mark: svg(`<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="currentColor"/>`),
  heart: svg(f("M32 56C10 40 6 28 6 20a12 12 0 0 1 26-4 12 12 0 0 1 26 4c0 8-4 20-26 36z")),
  star: svg(f("M32 4l8 18 20 2-15 13 5 20-18-10-18 10 5-20L4 24l20-2z")),
};
export const slotIcon = (slot: string) => ICONS["slot-" + slot] ?? ICONS["slot-instinct"];
