# Tiny Rex painted art

The built-in image generation tool produced new transparent game artwork.
Production assets are `src/art/assets/dinosaurs-storybook.webp`,
`valley-props-storybook.webp` `rex-bite-storybook.webp` and `bugs-storybook.webp`.
WebP quality 92 preserves alpha and reduces the sheets to approximately
691 KB, 655 KB and 226 KB respectively. No remote asset dependency exists.

## Prompt specifications

**Dinosaur sheet:** production family-game atlas, emerald baby Rex with cream
belly, coral feathered raptor, turquoise/gold triceratops, purple/peach stegosaurus,
moss/ochre ankylosaurus and blue diplodocus. Premium dimensional hand-painted
storybook style, dark teal outline, upper-left lighting, expressive eyes.
Transparent background, exact six columns by six rows, six successive right-facing
run poses per row, complete silhouettes, generous padding, no text or borders.
The revised sheet preserves designs from the initial eight-frame concept.

**Bite strip:** use the emerald baby Rex from the first row as reference; three
equal transparent cells, full-body side view facing right. Identical body,
hip/head/tail positions and grounded feet, with only lower-jaw hinge changing:
closed lips, half-open jaw at 25°, wide-open jaw at 45°. Preserve colours,
proportions, painted quality and eyes. No food, props, labels or backgrounds.
The closed and wide-open poses are baked into the unused player atlas cells,
then Phaser plays a closed/open/snap/chew sequence on an actual eat event.

**Valley prop sheet:** four columns by three rows on transparent background,
central 70% silhouettes, generous gaps, premium dimensional storybook style.
First row: magenta berry bush, curled fern, tropical leaf cluster, pale flowering
shrub. Second row: mossy gray boulder, golden sandstone, purple slate, basalt with
amber cracks. Third row: mossy log, arching palm foliage, fern/leaf cluster,
bleached dinosaur ribs. No characters, ground rectangles, text or borders.

## Integration

Generated sheets are not assumed to be perfectly uniform animation frames.
`storybook.ts` uses calibrated row cuts, scans alpha bounds, preserves one scale
per character row and aligns feet. Separate movement, idle and bite states
use Phaser’s native animation scheduler. Boot-only sources and temporary
alignment canvases are released after the native atlases are baked.

`landscape.ts` places painted props around quiet gradient/dappled ground.
Detailed border foliage stays outside the central hunting area. Collectible
bushes and ferns remain saturated; ground decoration is deliberately subdued.
World textures retain the menu valley and current valley only. New world
selection replaces unused background textures. Every creature and plant sprite now uses the new painted artwork.

## Bugs and flyers

The new transparent six-column, three-row sheet matches the dinosaur palette and lighting: copper/teal six-legged beetles, aqua dragonflies with translucent veined wings, and lilac/peach Dimorphodon. Six poses provide tripod walking, wing beats and flapping through native Phaser animations (14, 18 and 10 FPS). Calibrated row cuts prevent wing clipping; per-row alpha bounds preserve a consistent size and baseline. The 606 KB WebP is bundled and precached, and its source texture is released after atlas baking.
