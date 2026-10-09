"""Pack raw rendered frames into trimmed, padded WebP atlas pages + a Phaser JSON.

Run with any Python that has Pillow (the ComfyUI embedded python works):
    D:/dev/ComfyUI_windows_portable/python_embeded/python.exe tools/art/pack.py \
        art-build/props/frames.json  src/art/assets/world/props

frames.json  = {"frames": [{"key": "fern-a/0", "file": "fern-a_0.png", "ax": 240, "ay": 360,
                            "meta": {...optional, copied through...}}, ...]}
  file is relative to frames.json; (ax, ay) is the anchor pixel in the UNTRIMMED frame.
Output: <out>.json (Phaser "multiatlas" hash format, pivot = anchor) + <out>-N.webp pages.
Frame meta is copied to "meta" per frame, so footprints etc. travel with the art.
"""
import json
import os
import sys

from PIL import Image

PAGE = 2048
PAD = 2
ALPHA_CUT = 6


def trim(im):
    a = im.getchannel("A").point(lambda v: 255 if v > ALPHA_CUT else 0)
    box = a.getbbox()
    return box


def pack(manifest_path, out_base, quality=88):
    root = os.path.dirname(manifest_path)
    data = json.load(open(manifest_path))
    items = []
    for f in data["frames"]:
        im = Image.open(os.path.join(root, f["file"])).convert("RGBA")
        box = trim(im)
        if box is None:
            box = (0, 0, 1, 1)
        items.append(
            dict(f=f, im=im.crop(box), box=box, src=im.size)
        )
    items.sort(key=lambda it: -it["im"].size[1])
    pages, cur = [], None

    def new_page():
        return dict(x=0, y=0, rowh=0, frames=[], im=Image.new("RGBA", (PAGE, PAGE), (0, 0, 0, 0)))

    cur = new_page()
    for it in items:
        w, h = it["im"].size
        if w + PAD * 2 > PAGE or h + PAD * 2 > PAGE:
            raise SystemExit(f"frame {it['f']['key']} too big: {w}x{h}")
        if cur["x"] + w + PAD * 2 > PAGE:
            cur["x"], cur["y"], cur["rowh"] = 0, cur["y"] + cur["rowh"], 0
        if cur["y"] + h + PAD * 2 > PAGE:
            pages.append(cur)
            cur = new_page()
        x, y = cur["x"] + PAD, cur["y"] + PAD
        cur["im"].paste(it["im"], (x, y))
        # 1px edge extrusion so bilinear scaling never samples a neighbour
        for (sx, sy, dx, dy, bw, bh) in (
            (0, 0, x - 1, y, 1, h),
            (w - 1, 0, x + w, y, 1, h),
            (0, 0, x, y - 1, w, 1),
            (0, h - 1, x, y + h, w, 1),
        ):
            strip = it["im"].crop((sx, sy, sx + bw, sy + bh))
            cur["im"].paste(strip, (dx, dy))
        cur["frames"].append((it, x, y, w, h))
        cur["x"] += w + PAD * 2
        cur["rowh"] = max(cur["rowh"], h + PAD * 2)
    pages.append(cur)

    os.makedirs(os.path.dirname(out_base) or ".", exist_ok=True)
    textures, total_px = [], 0
    for i, pg in enumerate(pages):
        used_h = max((y + h for _, _, y, _, h in pg["frames"]), default=1) + PAD
        used_h = min(PAGE, 1 << (used_h - 1).bit_length()) if used_h > 1 else 1
        im = pg["im"].crop((0, 0, PAGE, used_h))
        name = f"{os.path.basename(out_base)}-{i}.webp"
        im.save(os.path.join(os.path.dirname(out_base) or ".", name), "WEBP", quality=quality, alpha_quality=100, method=5)
        total_px += PAGE * used_h
        fr = {}
        for it, x, y, w, h in pg["frames"]:
            f = it["f"]
            bx0, by0, _, _ = it["box"]
            ax, ay = f["ax"] - bx0, f["ay"] - by0
            fr[f["key"]] = {
                "frame": {"x": x, "y": y, "w": w, "h": h},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
                "sourceSize": {"w": w, "h": h},
                "pivot": {"x": round(ax / w, 5), "y": round(ay / h, 5)},
                **({"meta": f["meta"]} if "meta" in f else {}),
            }
        textures.append(
            {"image": name, "format": "RGBA8888", "size": {"w": PAGE, "h": used_h}, "scale": 1, "frames": fr}
        )
    out = {"textures": textures, "meta": {**data.get("meta", {}), "decodedBytes": total_px * 4}}
    json.dump(out, open(out_base + ".json", "w"), separators=(",", ":"))
    print(f"packed {len(items)} frames -> {len(pages)} page(s), decoded ~{total_px*4/2**20:.1f} MiB")


if __name__ == "__main__":
    pack(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 88)
