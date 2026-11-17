import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"D:\DSH_WorkSpace\lumen-mark\src\host\app.ico"
SIZE = 256

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

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
for candidate in [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\seguisb.ttf"]:
    if os.path.exists(candidate):
        font = ImageFont.truetype(candidate, 150)
        break
if font is None:
    font = ImageFont.load_default()

text = "M"
bbox = draw.textbbox((0, 0), text, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
draw.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 6), text, font=font, fill=(255, 255, 255, 255))

# small underline mark, like a text cursor
draw.rounded_rectangle([SIZE * 0.30, SIZE * 0.70, SIZE * 0.70, SIZE * 0.70 + 14], radius=7, fill=(255, 255, 255, 235))

sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save(OUT, format="ICO", sizes=sizes)
print("icon written:", OUT, os.path.getsize(OUT), "bytes")
