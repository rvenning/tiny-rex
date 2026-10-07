import { WORLDS } from "../../game/content";
import type { Profile, Progress } from "../../platform/storage";
import { esc, type ButtonBuilder } from "../markup";
export function mapMarkup(
  profile: Profile,
  progress: Progress,
  world: number,
  button: ButtonBuilder,
  nav: string,
  footer: string,
) {
  return `<section class="panel map-panel"><header class="page-heading"><div><p class="eyebrow">ENDLESS FEAST</p><h1>${esc(profile.name)}’s feast</h1><p>Personal best <span class="gold">${progress.feastBest.toLocaleString()}</span> · ${Object.keys(progress.met).length} discoveries</p></div>${button("Players", "profiles", undefined, "quiet small")}</header><div class="feast-card"><p class="eyebrow">START SMALL. EAT BIG. KEEP GOING.</p><h2>One more bite.</h2><p>No finish line. Find little snacks, grow into a mighty Rex, and dodge anything bigger. Keep eating as the valley gets wilder.</p>${button("Start Endless Feast →", "feast", undefined, "primary big")}<p class="hint">Three hearts · Increasing waves · No time limit</p></div><h2 class="valley-picker-title">Choose your valley</h2><div class="valleys feast-valleys">${WORLDS.map((w, i) => `<button class="valley valley-${w.id} ${i === world ? "selected" : ""}" data-action="world" data-value="${i}" aria-pressed="${i === world}"><header><span class="world-icon">${w.icon}</span><div><p class="eyebrow">${i === world ? "YOUR NEXT FEAST" : "EXPLORE"}</p><h2>${w.name}</h2></div></header><p>${w.blurb}</p></button>`).join("")}</div><div class="feast-tips"><h2>Follow your appetite</h2><p><b>Gold rings:</b> food. <b>Red rings:</b> trouble. <b>Spikes:</b> keep clear.</p><p>Your belly is your fuel. Fresh food keeps you growing; stop eating and you’ll shrink.</p></div>${nav}${footer}</section>`;
}
