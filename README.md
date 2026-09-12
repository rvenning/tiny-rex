# 🦖 Tiny Rex

Hatch tiny in a prehistoric valley. Eat anything smaller than you, keep away
from anything bigger, and grow all the way up to a Mighty Rex.

**Play it:** https://rvenning.github.io/tiny-rex/

## The idea

There is one question in this game and you answer it a hundred times a hunt:
**is that smaller than me?**

- **Smaller than you** — food. It fills your belly bar.
- **The same size as you** — completely safe. You bump noses and carry on.
- **Bigger than you** — it can eat you. That costs a heart.
- **Spiky** — never food, whatever size you are. That is a rule to remember.

Fill the belly bar and you grow a size, and everything you spent the last minute
running away from turns into dinner. That inversion is the whole game.

Aimed at a five-to-six-year-old, so the fairness is designed in rather than
tuned in: same-size is safe on purpose, sizes step by at least 1.3× so they can
be told apart across the arena, and anything close enough to matter gets a red
ring (it can eat you) or a warm glow (you can eat it). Berries and ferns are
edible at every size, so there is always something safe to eat — losing a hunt
is fine, being stuck is not.

## Features

- **20 hunts across four valleys** — Fern Hollow teaches the rule, Bone Gulch
  adds things that hunt you, Spike Ridge adds armour that can never be eaten,
  and Thunder Basin has the biggest animals alive.
- **A named beast at the end of each valley** — it hunts you until you out-grow
  it, then it runs and you have to chase it down. It sprints faster than you and
  has to stop for breath; that is the window.
- **Stars come from hearts, never from the clock**, so a careful, slow player
  can earn all three.
- **The Endless Feast** — the family leaderboard mode. No target and no clock,
  but your belly empties on its own, so you can never stop hunting.
- **The Dino Book** — a card for every creature you have met, with its size and
  a fact. Meeting one is enough; you do not have to eat it.
- Family profiles with PINs, cross-device sync, offline play, installable.

## How it looks

`js/art.js` owns the whole look: the four valleys' palettes, the scenery that
litters them, the foreground planting, and every creature in the game. Two
rules keep it out of the simulation's way:

- **Nothing in there may move a creature or change a number the engine reads.**
  Positions come from `js/game.js`; scenery comes from a positional hash, so
  the valley looks hand-placed and still plays the identical level on every
  device.
- **The static parts are painted once and blitted.** Each world bakes two
  offscreen layers — the valley and ground behind everything, the planting and
  vignette in front of it — rebuilt only when the world changes or the canvas
  resizes. That is what pays for several hundred pieces of scenery costing two
  `drawImage` calls a frame.

Every animal shares one edge treatment (a dark rim and a top highlight) and one
ground shadow, which is most of what makes eighteen procedurally drawn
dinosaurs look like one illustrator did them. Rex gets her own painter rather
than borrowing the generic biped: she is jade with a cream belly because no
green reads against grass, sand, stone AND ash, and she stands in a small pool
of light so a four-year-old can always find herself. A stripe on her back and a
spike on her crest appear with each size she reaches.

Anything that drifts, sways, breathes or pulses multiplies by `Art.motion`,
which is 0 under `prefers-reduced-motion`. The CSS honours the same query.

## Built on gamekit

Profiles, storage + family sync, sounds, screens, effects and PWA install all
come from the shared [gamekit](https://github.com/rvenning/gamekit) library,
vendored into `lib/`. To pull in a newer version:

```
node ../gamekit/tools/sync-to-game.js .
```

Then bump `CACHE` in `sw.js` so devices actually pick it up.

## Local development

No build step — plain `<script>` tags.

```
npx http-server . -p 8125 -c-1
```

## Tests

```
node --test
```

- `tests/content.test.js` lints the valley: beasts sit exactly one rung below
  their level's target, every size you pass through has enough food in reach to
  fill the next bar, nothing alive out-runs the player, sizes step far enough
  apart to be legible, and each world introduces its own idea in order.
- `tests/bot.test.js` plays the whole campaign with four bots over eight seeds.
  The bots differ in the thing the game actually tests — how quickly they notice
  a change, how often they muddle two sizes that sit next to each other, and how
  close they let something get. The assertions are the promises: a careful
  player clears everything, nobody is ever forced into danger, a retry always
  gets a five-year-old through, standing still wins nothing, and the clock is
  never what beats you.
- `tests/storage.test.js` covers the save file and the cross-device merge.
- `node tests/diag.js` prints the per-level table the balance was tuned from.

## Storage

`trex_*` keys in localStorage, `tinyrex` collection in the shared
`wordvoyage-e5a5c` Firestore project. The Firebase key in
`js/firebase-config.js` is a public client config restricted to the Cloud
Firestore API — it is not a secret.

There is no currency and no shop, deliberately: the only way to get better at
Tiny Rex is to get better at reading sizes and watching your back, and an
upgrade would be a way round the one thing the game is for.
