import {
  totalStars,
  type Profile,
  type Progress,
} from "../../platform/storage";
import { esc, type ButtonBuilder } from "../markup";
export function leaderboardMarkup(
  rows: { p: Profile; progress: Progress }[],
  profile: Profile | null,
  button: ButtonBuilder,
  nav: string,
  footer: string,
  heading: string,
) {
  return `<section class="panel">${heading}<div class="leaderboard">${rows.map(({ p, progress }, i) => `<article class="leader-row ${p.id === profile?.id ? "me" : ""}"><span class="rank">${i + 1}</span><span class="avatar">${p.avatar}</span><div><h2>${esc(p.name)}</h2><p>${Object.keys(progress.met).length} discoveries</p></div><strong>${progress.feastBest.toLocaleString()}<small>FEAST BEST</small></strong></article>`).join("") || "<p>No hatchlings yet. Your adventure could be the first.</p>"}</div>${nav}${footer}</section>`;
}
