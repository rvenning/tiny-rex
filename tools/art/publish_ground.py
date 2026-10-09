"""Encode rendered ground for delivery without changing tile positions or source renders."""
import argparse
import json
from pathlib import Path
from PIL import Image
from functools import lru_cache

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("world", type=Path)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--native", type=Path, help="Original rendered PNG directory when re-encoding an existing delivery")
    args = parser.parse_args()
    path = args.world / "world.json"
    meta = json.loads(path.read_text())
    if meta.get("tileGutter") and not args.native:
        raise ValueError("Supply --native to re-encode padded delivery tiles")
    tiles = {(t["tx"], t["ty"]): t for t in meta.get("tiles", [])}
    def source_path(tile):
        return args.native / Path(tile["file"]).with_suffix(".png").name if args.native else args.world / "ground" / tile["file"]
    @lru_cache(maxsize=16)
    def load(tx,ty):
        tile = tiles.get((tx,ty))
        if not tile:
            return None
        with Image.open(source_path(tile)) as image:
            return image.convert("RGB")
    before = after = 0
    for tile in meta.get("tiles", []):
        source = source_path(tile)
        target = args.world / "ground" / Path(tile["file"]).with_suffix(".webp").name
        before += source.stat().st_size
        tx, ty = tile["tx"], tile["ty"]
        core = load(tx,ty)
        w,h = core.size
        image = Image.new("RGB",(w+2,h+2))
        image.paste(core,(1,1))
        for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            neighbour = load(tx+dx,ty+dy)
            neighbour = neighbour if neighbour is not None else core
            nw,nh = neighbour.size
            sx = nw-1 if dx<0 else 0 if dx>0 else 0
            sy = nh-1 if dy<0 else 0 if dy>0 else 0
            if tiles.get((tx+dx,ty+dy)) is None:
                sx = 0 if dx<0 else nw-1 if dx>0 else 0
                sy = 0 if dy<0 else nh-1 if dy>0 else 0
            sw,sh = (1 if dx else w),(1 if dy else h)
            x,y = (0 if dx<0 else w+1 if dx>0 else 1),(0 if dy<0 else h+1 if dy>0 else 1)
            image.paste(neighbour.crop((sx,sy,sx+sw,sy+sh)),(x,y))
        image.save(target, "WEBP", quality=args.quality, method=5)
        after += target.stat().st_size
        tile["file"] = target.name
    meta["tileGutter"] = 1
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(meta, separators=(",", ":")))
    temporary.replace(path)
    print(f"Published {len(meta.get('tiles', []))} ground tiles: {before/2**20:.1f} -> {after/2**20:.1f} MiB")

if __name__ == "__main__":
    main()
