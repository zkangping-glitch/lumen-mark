"""Build src/host/app.ico from a source image.

Usage:
    python tools/make-icon.py                      # uses art/icon.png
    python tools/make-icon.py --source art/icon.png  # converts any square PNG

A source image should be square (1024x1024 or 512x512 works best). The script
writes a multi-resolution .ico (256/128/64/48/32/16) that Windows Explorer,
the taskbar and the title bar all pick from.
"""

import argparse
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "host", "app.ico")
SIZE = 256



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

    source = args.source or os.path.join(ROOT, "art", "icon.png")
    img = load_source(source)
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(args.out, format="ICO", sizes=sizes)
    print("icon written:", args.out, os.path.getsize(args.out), "bytes")


if __name__ == "__main__":
    main()
