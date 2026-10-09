import { REGIONS, PASSAGES, center, type Point } from "../../adventure/content";
import type { AdventureSave } from "../../adventure/save";
import { esc } from "../markup";
export function adventureMap(save: AdventureSave, position: Point) {
  const rects = REGIONS.map((r) => {
    const x = 35 + r.x * 220,
      y = 45 + r.y * 160;
    const known = save.regions.includes(r.id);
    return `<g><rect x="${x}" y="${y}" width="195" height="130" rx="20" fill="${known ? "#355b43" : "#19382d"}" stroke="${known ? "#aac481" : "#48644f"}"/><text x="${x + 16}" y="${y + 39}" fill="#f1e9c9" font-size="17" font-weight="bold">${esc(r.name)}</text><text x="${x + 16}" y="${y + 65}" fill="#c0d5b7" font-size="12">${known ? "Explored" : "Unexplored"}</text><text x="${x + 16}" y="${y + 96}" fill="#edca80" font-size="12">${save.nests.includes(r.id) ? "◉ Refuge discovered" : "◇ Find the refuge"}</text></g>`;
  }).join("");
  const path = PASSAGES.map((p) => {
    const a = REGIONS.find((r) => r.id === p.a)!,
      b = REGIONS.find((r) => r.id === p.b)!;
    const x1 = 132 + a.x * 220,
      y1 = 110 + a.y * 160,
      x2 = 132 + b.x * 220,
      y2 = 110 + b.y * 160;
    return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${save.gates.includes(p.name) ? "#f0d38b" : "#6f816a"}" stroke-width="6" stroke-dasharray="${save.gates.includes(p.name) ? "0" : "6 6"}"/>`;
  }).join("");
  const px = 35 + (position.x / 900) * 220,
    py = 45 + (position.y / 900) * 160;
  return `<svg class="adventure-world-map" viewBox="0 0 705 380" role="img" aria-label="Connected world map. Fern Hollow, Riverbend and Reed Marsh lie north; Echo Caves, Ember Basin and Sunscar dunes lie south.">${path}${rects}<circle cx="${px}" cy="${py}" r="9" fill="#fff1a2" stroke="#17382a" stroke-width="3"/><text x="35" y="364" fill="#d6e0bd" font-size="12">Gold routes are open. Dashed routes need growth or a cleared obstacle.</text></svg>`;
}
