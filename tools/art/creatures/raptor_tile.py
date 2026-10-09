"""Tile PNGs on a game-ground background for review (run with the ComfyUI python -I).

  python raptor_tile.py out.png cols bg=ground|green file1.png file2.png ...
  python raptor_tile.py out.png cols bg --glob "dir/turn_*.png"
"""
import glob
import sys

from PIL import Image, ImageDraw

out, cols, bg = sys.argv[1], int(sys.argv[2]), sys.argv[3]
files = sys.argv[4:]
if files and files[0] == "--glob":
    files = sorted(glob.glob(files[1]))
ims = [Image.open(f).convert("RGBA") for f in files]
cw = max(i.size[0] for i in ims)
ch = max(i.size[1] for i in ims)
rows = (len(ims) + cols - 1) // cols
col = {"ground": (176, 138, 84, 255), "green": (96, 120, 64, 255), "white": (240, 236, 226, 255)}[bg]
sheet = Image.new("RGBA", (cols * cw, rows * ch), col)
d = ImageDraw.Draw(sheet)
for n, (f, im) in enumerate(zip(files, ims)):
    x, y = (n % cols) * cw, (n // cols) * ch
    sheet.alpha_composite(im, (x, y))
    d.text((x + 3, y + 3), f.replace("\\", "/").split("/")[-1][:-4], fill=(255, 255, 255, 255))
sheet.convert("RGB").save(out)
print(out, sheet.size)
