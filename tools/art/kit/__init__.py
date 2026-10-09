"""Prop kit registry. Each module in this package defines PROPS = {name: Prop(...)}."""
from dataclasses import dataclass, field


@dataclass
class Prop:
    build: object  # build(rng: random.Random) -> list[bpy.types.Object]; origin = ground contact, +Z up, units = world units, game-heading-agnostic
    variants: int = 1
    r: float = 0.3  # collision footprint radius (world units); 0 = walk-through
    h: float = 1.0  # height in world units (sets sprite sort/fade logic)
    kind: str = "solid"  # solid: blocks movement | soft: walk-through foliage that fades when it hides the player | deco: pure scenery
    frame: tuple = (360, 400)  # raw render frame in px (must contain the whole prop)
    anchor: tuple = (0.5, 0.80)  # where the ground origin lands in the frame
    bake: bool = False  # True => small enough to also be scattered into baked ground tiles
    tags: tuple = ()  # free-form: biome names etc.
    extra: dict = field(default_factory=dict)
