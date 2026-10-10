import { Adventure, idleInput, type Actor } from "../../src/adventure/sim";
import { activeById } from "../../src/rpg/skills";

export interface DuelResult {
  won: boolean;
  seconds: number;
  hpLeft: number;
  hits: number;
}
/** A deliberately plain combat bot: closes in, attacks when something is in reach, sidesteps a committed telegraph and
 *  uses its first skill off cooldown. It reacts perfectly to tells (a human is slower), so its HP loss is a *floor*. */
export function duel(a: Adventure, foes: Actor[], opts: { dodges?: boolean; maxSeconds?: number; skills?: boolean } = {}): DuelResult {
  const { dodges = true, maxSeconds = 240, skills = true } = opts;
  const p = a.player;
  let hits = 0;
  const hp0 = p.hp;
  a.listeners.push((e) => e.type === "hurt" && hits++);
  let t = 0;
  let dodgeAt = -9;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const alive = foes.filter((f) => f.state !== "dead");
    if (!alive.length) return { won: true, seconds: t, hpLeft: p.hp / a.d.maxHp, hits };
    if (p.hp <= 0) return { won: false, seconds: t, hpLeft: 0, hits };
    const target = alive.reduce((b, f) => (Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? f : b));
    const dx = target.x - p.x,
      dy = target.y - p.y,
      d = Math.hypot(dx, dy);
    const input = idleInput();
    const reach = a.stats.reach * a.d.reachMult + target.spec.r + a.radius;
    // instant attacks (sweeps, slams) land the moment the wind-up ends, so the dodge's i-frames must start just before it
    const threat = alive.find((f) => f.state === "windup" && f.t < (f.atk?.kind === "sweep" || (f.atk?.kind === "slam" && f.atk.id !== "leap") ? 0.14 : 0.3) && Math.hypot(f.x - p.x, f.y - p.y) < (f.atk?.reach ?? 5) + 2.5);
    if (dodges && threat && t - dodgeAt > 0.5 && a.dodgeCds.some((c) => c === 0)) {
      // step across the committed lane (perpendicular to the attack heading); away from slam circles
      const dir = threat.dir;
      const side = Math.sin(dir - Math.atan2(p.y - threat.y, p.x - threat.x)) >= 0 ? 1 : -1;
      const away = threat.atk?.kind === "slam" ? Math.atan2(p.y - (threat.aim?.y ?? threat.y), p.x - (threat.aim?.x ?? threat.x)) : dir + (Math.PI / 2) * side;
      input.move = { x: Math.cos(away), y: Math.sin(away) };
      input.dodge = true;
      dodgeAt = t;
    } else if (d > reach * 0.85) input.move = { x: dx / d, y: dy / d };
    else input.move = { x: dx / d, y: dy / d };
    const striking = alive.some((f) => f.state === "strike" && Math.hypot(f.x - p.x, f.y - p.y) < 7);
    if (d < reach + 0.4 && !input.dodge && !striking) input.bite = true;
    if (skills && d < 5 && a.skillCd[0] === 0 && !input.dodge) {
      const sk = activeById(a.save.loadout[0]!);
      if (sk) input.skillA = true;
    }
    a.update(1 / 60, input);
    for (const e of a.events.splice(0)) void e;
    t += 1 / 60;
  }
  return { won: false, seconds: t, hpLeft: p.hp / a.d.maxHp, hits };
}
