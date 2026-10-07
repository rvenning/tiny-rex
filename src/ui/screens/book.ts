import { SPECIES } from "../../game/content";
import type { Progress } from "../../platform/storage";
import { esc, type ButtonBuilder } from "../markup";
export function bookMarkup(
  p: Progress,
  button: ButtonBuilder,
  nav: string,
  footer: string,
  heading: string,
) {
  return `<section class="panel">${heading}<div class="book-grid">${SPECIES.map(
    (s) => {
      const known = !!p.met[s.id];
      return `<article class="dino-card ${known ? "" : "unknown"}"><div class="dino-picture" data-species="${known ? s.id : ""}">${known ? "" : "?"}</div><div><p class="eyebrow">${known ? (s.kind === "plant" ? "ALWAYS EDIBLE" : s.spiky ? "ARMOURED · NEVER FOOD" : "SIZE " + (s.tier! + 1) + " / 7") : "NOT MET YET"}</p><h2>${known ? s.name : "A new discovery awaits"}</h2><p>${known ? s.fact : "Take another hunt. There’s a whole valley to meet."}</p></div></article>`;
    },
  ).join("")}</div>${nav}${footer}</section>`;
}
