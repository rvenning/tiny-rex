import { it, expect } from "vitest";
import { blankProgress, mergeProgress } from "../src/platform/storage";

it("preserves both devices' historical best results and future fields", () => {
  const a = { ...blankProgress(), levels: { 0: { stars: 3, best: 200 } }, met: { fern: 1 }, feastBest: 80, catches: 5, future: 17 };
  const b = { ...blankProgress(), levels: { 0: { stars: 1, best: 400 }, 1: { stars: 2, best: 300 } }, met: { rex: 1 }, feastBest: 50, catches: 3 };
  expect(mergeProgress(a, b)).toMatchObject({ levels: { 0: { stars: 3, best: 400 }, 1: { stars: 2, best: 300 } }, met: { fern: 1, rex: 1 }, feastBest: 80, catches: 5, future: 17 });
  expect(mergeProgress(a, blankProgress())).toEqual(a);
});
