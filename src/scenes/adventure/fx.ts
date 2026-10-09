import * as Phaser from "phaser";

/** Procedural vector textures (shadow, glow, icons): drawn once at boot, never per frame. */
export function makeTextures(scene: Phaser.Scene) {
  const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h);
    draw(t!.getContext());
    t!.refresh();
  };
  make("fx-shadow", 128, 64, (c) => {
    const g = c.createRadialGradient(64, 32, 2, 64, 32, 62);
    g.addColorStop(0, "rgba(10,25,14,0.62)");
    g.addColorStop(0.55, "rgba(10,25,14,0.34)");
    g.addColorStop(1, "rgba(10,25,14,0)");
    c.save();
    c.translate(0, 0);
    c.scale(1, 0.5);
    c.fillStyle = g;
    c.beginPath();
    c.arc(64, 64, 62, 0, Math.PI * 2);
    c.fill();
    c.restore();
  });
  make("fx-soft", 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  make("fx-dust", 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(226,196,150,0.75)");
    g.addColorStop(1, "rgba(226,196,150,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  make("fx-leaf", 24, 24, (c) => {
    c.fillStyle = "#8fd24a";
    c.beginPath();
    c.ellipse(12, 12, 10, 5, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#3c7a24";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(3, 18);
    c.lineTo(21, 6);
    c.stroke();
  });
  make("fx-spark", 32, 32, (c) => {
    c.translate(16, 16);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 15);
    g.addColorStop(0, "rgba(255,246,200,1)");
    g.addColorStop(1, "rgba(255,200,90,0)");
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        r = i % 2 ? 4 : 15;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });
  make("fx-ring", 128, 128, (c) => {
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(64, 64, 58, 0, Math.PI * 2);
    c.stroke();
  });
  // icons above heads
  make("icon-warn", 64, 64, (c) => {
    c.fillStyle = "#1b0d0d";
    c.strokeStyle = "#ff7a66";
    c.lineWidth = 5;
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(32, 6);
    c.lineTo(58, 54);
    c.lineTo(6, 54);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ffd9cf";
    c.fillRect(29, 20, 6, 20);
    c.beginPath();
    c.arc(32, 46, 3.6, 0, 7);
    c.fill();
  });
  make("icon-food", 64, 64, (c) => {
    c.fillStyle = "rgba(14,34,24,0.9)";
    c.beginPath();
    c.arc(32, 32, 28, 0, 7);
    c.fill();
    c.strokeStyle = "#f4d98a";
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = "#f4d98a";
    // fork
    for (const x of [22, 28, 34]) c.fillRect(x, 14, 3, 14);
    c.fillRect(21, 26, 16, 4);
    c.fillRect(27, 28, 4, 22);
    // knife
    c.beginPath();
    c.moveTo(44, 14);
    c.quadraticCurveTo(52, 26, 44, 34);
    c.lineTo(44, 50);
    c.lineTo(41, 50);
    c.lineTo(41, 14);
    c.closePath();
    c.fill();
  });
  make("icon-shield", 64, 64, (c) => {
    c.fillStyle = "rgba(14,24,34,0.92)";
    c.strokeStyle = "#a9c6e8";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(32, 6);
    c.lineTo(56, 14);
    c.quadraticCurveTo(56, 46, 32, 58);
    c.quadraticCurveTo(8, 46, 8, 14);
    c.closePath();
    c.fill();
    c.stroke();
  });
  make("icon-find", 64, 64, (c) => {
    c.translate(32, 32);
    c.fillStyle = "rgba(14,34,24,0.9)";
    c.strokeStyle = "#ffe08a";
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(0, -26);
    c.lineTo(26, 0);
    c.lineTo(0, 26);
    c.lineTo(-26, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ffe08a";
    c.beginPath();
    c.arc(0, 0, 6, 0, 7);
    c.fill();
  });
}

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  g: number;
  life: number;
  age: number;
  a0: number;
  s0: number;
  s1: number;
  spin: number;
}
/** A tiny fixed-pool particle layer; 'reduced effects' just lowers the budget. */
export class Fx {
  private pool: Particle[] = [];
  private live: Particle[] = [];
  budget = 160;
  constructor(private scene: Phaser.Scene) {}
  spawn(tex: string, x: number, y: number, o: { vx?: number; vy?: number; g?: number; life?: number; a?: number; s0?: number; s1?: number; spin?: number; tint?: number; depth?: number; blend?: Phaser.BlendModes }) {
    if (this.live.length >= this.budget) return;
    let p = this.pool.pop();
    if (!p) {
      const img = this.scene.add.image(0, 0, tex);
      p = { img, vx: 0, vy: 0, g: 0, life: 1, age: 0, a0: 1, s0: 1, s1: 1, spin: 0 };
    }
    p.img.setTexture(tex).setPosition(x, y).setVisible(true).setActive(true);
    p.img.setDepth(o.depth ?? 1e5).setBlendMode(o.blend ?? Phaser.BlendModes.NORMAL);
    if (o.tint !== undefined) p.img.setTint(o.tint);
    else p.img.clearTint();
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.life = o.life ?? 0.5;
    p.age = 0;
    p.a0 = o.a ?? 1;
    p.s0 = o.s0 ?? 1;
    p.s1 = o.s1 ?? 1;
    p.spin = o.spin ?? 0;
    p.img.setRotation(0);
    this.live.push(p);
  }
  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.img.setVisible(false).setActive(false);
        this.pool.push(p);
        this.live.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.rotation += p.spin * dt;
      p.img.setScale(p.s0 + (p.s1 - p.s0) * t);
      p.img.setAlpha(p.a0 * (1 - t) * (t < 0.1 ? t * 10 : 1));
    }
  }
  get count() {
    return this.live.length;
  }
  destroy() {
    for (const p of [...this.live, ...this.pool]) p.img.destroy();
    this.live = [];
    this.pool = [];
  }
}
