import type { Scene } from "phaser";
import type { Region } from "../adventure/content";
import { Random } from "../game/random";
export function groundTexture(scene: Scene, r: Region) {
  const key = "adv-floor-" + r.id;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 300;
  const c = canvas.getContext("2d")!;
  const random = new Random(580 + r.x * 77 + r.y * 9);
  c.beginPath();
  c.moveTo(256, 0);
  c.lineTo(512, 150);
  c.lineTo(256, 300);
  c.lineTo(0, 150);
  c.closePath();
  c.clip();
  const base = r.color;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const shade = (delta: number) =>
    (Math.min(255, Math.max(0, (base >> 16) + delta)) << 16) |
    (Math.min(255, Math.max(0, ((base >> 8) & 255) + delta)) << 8) |
    Math.min(255, Math.max(0, (base & 255) + delta));
  const gradient = c.createLinearGradient(30, 10, 470, 320);
  gradient.addColorStop(0, hex(shade(20)));
  gradient.addColorStop(0.45, hex(shade(5)));
  gradient.addColorStop(1, hex(shade(-22)));
  c.fillStyle = gradient;
  c.fillRect(0, 0, 512, 300);
  for (let i = 0; i < 2600; i++) {
    const x = random.range(0, 512),
      y = random.range(0, 300);
    c.globalAlpha = random.range(0.02, 0.1);
    c.fillStyle = i % 2 ? "#ecdbb3" : "#173f2d";
    c.beginPath();
    c.ellipse(
      x,
      y,
      random.range(1, 5),
      random.range(0.4, 2),
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  if (!["caves", "ember", "dunes"].includes(r.id))
    for (let i = 0; i < 500; i++) {
      const x = random.range(0, 512),
        y = random.range(0, 300);
      c.globalAlpha = 0.13;
      c.strokeStyle = i % 3 ? "#446537" : "#b8c977";
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(
        x - 2,
        y - 3,
        x + random.range(-4, 4),
        y - random.range(2, 5),
      );
      c.stroke();
    }
  c.globalAlpha = 1;
  scene.textures.addCanvas(key, canvas);
  return key;
}
