// Generate icons/ — a little rex in silhouette against a warm valley sun, with
// three dots beside it stepping up in size: the whole game in one picture.
// Run: node tools/make-icons.js  (from the tiny-rex folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                 // 1 unit = 1% of the icon

  const NIGHT = "#241a12", EARTH = "#4a3320", SUN = "#ffc44d";
  const LEAF = "#3f7f45", DARK = "#17110b", SKIN = "#57a96e", TRIM = "#8fc3a1";

  // Valley at dusk: dark ground, a low sun behind the ridge.
  cv.fillRect(0, 0, big, big, NIGHT);
  cv.fillCircle(50 * u, 54 * u, 44 * u, EARTH);
  cv.fillCircle(50 * u, 46 * u, 27 * u, SUN);

  // Maskable art keeps to the safe centre (~72%).
  const s = pad ? 0.76 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;

  // The ridge line the valley sits behind.
  cv.fillRect(at(-15), at(74), sz(130), sz(45), LEAF);
  cv.fillRect(at(-15), at(80), sz(130), sz(40), EARTH);

  // The rex, side on. Tail, body, leg, neck, head, jaw, eye.
  cv.fillRect(at(20), at(56), sz(20), sz(5), SKIN);          // tail
  cv.fillRect(at(15), at(52), sz(9), sz(5), SKIN);
  cv.fillCircle(at(48), at(58), sz(13), SKIN);               // body
  cv.fillCircle(at(48), at(61), sz(9), TRIM);                // belly
  cv.fillRect(at(43), at(66), sz(5), sz(14), SKIN);          // back leg
  cv.fillRect(at(52), at(66), sz(5), sz(14), SKIN);          // front leg
  cv.fillRect(at(54), at(44), sz(6), sz(12), SKIN);          // neck
  cv.fillCircle(at(62), at(41), sz(10), SKIN);               // head
  cv.fillRect(at(62), at(41), sz(16), sz(6), SKIN);          // snout
  cv.fillRect(at(64), at(45), sz(13), sz(3), DARK);          // jaw
  cv.fillCircle(at(62), at(37), sz(2.6), DARK);              // eye

  // Three dots stepping up in size — smaller, same, bigger.
  cv.fillCircle(at(16), at(24), sz(3.4), TRIM);
  cv.fillCircle(at(28), at(23), sz(5.2), SUN);
  cv.fillCircle(at(43), at(21), sz(7.6), "#e2503f");

  return downsample(cv.px, big, SS);
}

for (const [name, size, pad] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
]) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, size, paint(size, pad)));
  console.log("wrote icons/" + name);
}
