"""Build src/host/app.ico from a source image.

Usage:
    python tools/make-icon.py                      # draws the default "M" mark
    python tools/make-icon.py --source art/icon.png  # converts any square PNG

A source image should be square (1024x1024 or 512x512 works best). The script
writes a multi-resolution .ico (256/128/64/48/32/16) that Windows Explorer,
the taskbar and the title bar all pick from.
"""

import argparse
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "host", "app.ico")
SIZE = 256


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_default():
    top = (59, 130, 246)     # blue
    bottom = (124, 58, 237)  # violet

    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    for y in range(SIZE):
        c = lerp(top, bottom, y / (SIZE - 1))
        for x in range(SIZE):
            px[x, y] = (c[0], c[1], c[2], 255)

    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=58, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)
    font = None
    for candidate in [
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\seguisb.ttf",
    ]:
        if os.path.exists(candidate):
            font = ImageFont.truetype(candidate, 150)
            break
    if font is None:
        font = ImageFont.load_default()

    text = "M"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 6),
              text, font=font, fill=(255, 255, 255, 255))
    draw.rounded_rectangle([SIZE * 0.30, SIZE * 0.70, SIZE * 0.70, SIZE * 0.70 + 14],
                           radius=7, fill=(255, 255, 255, 235))
    return img


def load_source(path):
    img = Image.open(path).convert("RGBA")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side))
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description="Build the Lumen Mark app icon")
    parser.add_argument("--source", help="square PNG to convert into an .ico")
    parser.add_argument("--out", default=OUT, help="output .ico path")
    args = parser.parse_args()

    img = load_source(args.source) if args.source else draw_default()
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(args.out, format="ICO", sizes=sizes)
    print("icon written:", args.out, os.path.getsize(args.out), "bytes")


if __name__ == "__main__":
    main()
