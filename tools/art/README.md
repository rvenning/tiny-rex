# Tiny Rex art pipeline — read this before touching Blender

Approved visual target: the four mockups in `art-reference/` (01-early-fern-hollow.png,
02-mid-riverbend.png, 03-late-ember-basin.png, 04-growth-and-species.png). LOOK AT THEM with
the Read tool before you model anything, and look again after every render. The goal is that
your sprite could be dropped into those scenes without looking like it came from another game.

## Tools
* Blender 4.5.4 (headless):  `C:/Users/rober/Documents/Codex/2026-10-09/b/work/tools/blender-4.5.4/blender-4.5.4-windows-x64/blender.exe -b -P script.py -- args`
  Cycles on a GTX 1070 (CUDA/OptiX, 8 GB shared with other jobs - keep scenes lean). numpy 1.26 is available in Blender's python; PIL is NOT.
* Pillow/numpy/scipy for post-processing: `D:/dev/ComfyUI_windows_portable/python_embeded/python.exe` (use `-I`).
* Put scratch/work in `.scratch/<yourname>/` and build output in `art-build/` (both git-ignored).
* DO NOT edit `tools/art/common.py`, `pack.py`, `render_props.py`, `kit/__init__.py` without telling the lead - you may
  *read and import* them. If you need a change, make it additive, or work around it in your own module.

## Conventions (all in common.py - import it, never re-derive)
* Game space: gx, gy ground coords, gz up, in WORLD UNITS (1 unit ~ 1 m; Tiny Rex is storybook-scaled: hatchling Rex 2.0 u long).
* Blender X = gy, Blender Y = gx (use `b_xy(gx, gy)`), Z up. `proj()` gives the screen pixel offset.
* Camera: orthographic true-isometric (elevation 35.264 deg, azimuth 45), 80 px per unit. `frame_camera(scene, w, h, anchor_frac)`
  puts the game origin (0,0,0) at a known pixel of a fixed-size frame; that pixel is the sprite's *foot anchor*.
* Light: one warm low sun from the upper-left of the screen (shadows fall to lower-right) + blue-warm sky dome, set by
  `setup_lighting`. Do not add your own key lights; a *subtle* camera-side fill / rim is allowed on characters only if you
  keep it in your module. Colour pipeline is "Standard"; make colours rich and saturated - the mockups are vibrant, warm, golden-hour.
* Heading: game heading `phi` (radians, 0 = +gx = screen down-right, pi/2 = +gy = screen down-left). A model built facing
  Blender +Y and rotated `rotation_euler.z = -phi` faces game heading phi. 8 directions = `k * 45 deg`, k = 0..7
  (0 down-right, 1 down, 2 down-left, 3 left, 4 up-left, 5 up, 6 up-right, 7 right) - NOTE game headings run
  gx->gy so k=1 is +gx/+gy = straight DOWN the screen. (Verify with a test render before baking 800 frames!)

## Quality bar (this is why the first attempt was rejected)
Rejected: flat green diamonds, geometric blobs, repetitive primitives, "rounded sausage" dinosaurs, a plain palette match.
Wanted: the richness of the mockups - real silhouettes, layered detail, believable materials, and *variation*.
* Never ship primitives-with-a-colour. Every asset needs: a designed silhouette, subdivision / sculpt-like displacement,
  procedural material with large + medium + micro variation (noise/voronoi/musgrave, edge wear, colour gradients),
  moss/lichen/dirt where it belongs, and translucent backlit leaves (mix Translucent BSDF) for foliage.
* Many variants per prop (different random seeds change proportions, not just rotation). Foliage in particular must not look repeated.
* Keep small texture noise soft/low-contrast where creatures and combat happen: readable silhouettes win over detail.
* Warm highlights, cool-teal shadow tint, strong ambient occlusion in crevices; saturated greens (yellow-green sunlit, blue-green shaded).
* Verify by LOOKING: render a contact sheet (`tools/art/sheet.py`) and Read it. Compare against the mockup crop. Iterate until proud.
  A perfect-lighting-on-bad-modelling render is still bad. Silhouette first, then surface, then colour.

## Budget
* Sprites are trimmed + atlas-packed (`pack.py`) so empty frame area costs nothing, but mind decoded size: creature frames
  should be as small as their silhouette allows (render at PPU, do not supersample then keep). Total active art budget ~96 MiB decoded.
* Cycles samples: 48-96 + OpenImageDenoise is plenty at sprite size. Props <= ~15 s each, creature frames <= ~3 s each.
* Mesh budget per prop: <= ~60k tris after modifiers (it is instanced hundreds of times in the world renderer).

## Prop kit contract (tools/art/kit/<module>.py)
`PROPS = {"name": Prop(build=fn, variants=N, r=..., h=..., kind="solid|soft|deco", frame=(w,h), anchor=(fx,fy), bake=bool, tags=(...))}`
`fn(rng: random.Random) -> list[bpy Object]` builds at the origin (ground contact at z=0, +Z up), mesh objects only, join-safe (see `join_all`).
It must be deterministic from `rng` and must NOT reset the scene or add cameras/lights. Render + contact sheet:
```
blender -b -P tools/art/render_props.py -- --out art-build/props --only fern_large,boulder_m
D:/dev/ComfyUI_windows_portable/python_embeded/python.exe -I tools/art/sheet.py art-build/props/frames.json .scratch/me/sheet.png 6
```
`frames.json` is the manifest `pack.py` consumes; the lead packs everything into atlases. Register props in your own kit module(s) only.
`r` is the ground footprint radius used for collision in the game (0 for walk-through). `h` is real height in units.
`kind="solid"` blocks movement, `soft` is walk-through foliage drawn over the player (fades when covering them), `deco` is scenery with no collision.

## Creature contract (tools/art/creatures/<id>.py or your own driver; outputs go to art-build/creatures/<id>/)
Write `art-build/creatures/<id>/frames.json` = `{"frames":[{"key":"<id>/<pose>/<dir>/<frame>","file":"<pose>_<dir>_<frame>.png","ax":..,"ay":..,"meta":{...}}],"meta":{"id":..,"poses":{"run":{"frames":8,"fps":12,"loop":true},...},"r":0.5,"length":2.0,"height":1.0}}`
Raw frames are fixed-size (all frames of one creature the same W,H) with the foot anchor (game origin) at `ax, ay`
(use `frame_camera`). Poses (per creature type; `dir` 0..7 as above; frames are ordered in time):
* player species / big predators: idle(6,6fps,loop) run(8,12fps,loop) bite(6,18fps) dodge(4,16fps) hurt(3,12fps) skill(6,12fps)
* attackers add: windup(4,10fps, a held crouch/rear-back readable from far away) strike(5,20fps)
* small prey: idle(4,6fps,loop) run(6,14fps,loop) | flyers: hover(6,16fps,loop)
Animation must be identical across directions (rotate the creature, never the camera or sun).
After packing, a quick turntable/animation contact sheet in `.scratch/` is mandatory self-review.
