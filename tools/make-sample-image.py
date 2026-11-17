import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"D:\DSH_WorkSpace\lumen-mark\samples\assets\diagram.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

W, H = 760, 340
img = Image.new("RGB", (W, H), (247, 248, 250))
d = ImageDraw.Draw(img)

# card
d.rounded_rectangle([24, 24, W - 24, H - 24], radius=18, fill=(255, 255, 255), outline=(226, 228, 233), width=2)
d.text((48, 44), "Lumen Mark architecture", fill=(31, 35, 40))

font = None
for cand in [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]:
    if os.path.exists(cand):
        font = ImageFont.truetype(cand, 15)
        break

boxes = [
    (48, 100, 240, 168, "WebView2 (Chromium)", (219, 234, 254), (47, 111, 237)),
    (288, 100, 480, 168, "HTML / CSS / JS", (237, 233, 254), (124, 58, 237)),
    (528, 100, 712, 168, "C# Host (WinForms)", (220, 252, 231), (22, 163, 74)),
]
for x1, y1, x2, y2, label, fill, stroke in boxes:
    d.rounded_rectangle([x1, y1, x2, y2], radius=12, fill=fill, outline=stroke, width=2)
    if font:
        bb = d.textbbox((0, 0), label, font=font)
        d.text(((x1 + x2 - (bb[2] - bb[0])) / 2, (y1 + y2 - (bb[3] - bb[1])) / 2 - 2), label, font=font, fill=(30, 34, 40))
    else:
        d.text((x1 + 12, y1 + 26), label, fill=(30, 34, 40))

for (x1, x2) in [(240, 288), (480, 528)]:
    y = 134
    d.line([x1, y, x2, y], fill=(148, 155, 166), width=2)
    d.polygon([(x2, y), (x2 - 8, y - 5), (x2 - 8, y + 5)], fill=(148, 155, 166))

if font:
    d.text((48, 200), "postMessage bridge  ·  virtual host mapping  ·  local file IO", font=font, fill=(87, 96, 106))
    d.text((48, 236), "≈ 1.7 MB on disk  ·  no installer  ·  starts in well under a second", font=font, fill=(87, 96, 106))

img.save(OUT)
print("saved", OUT, os.path.getsize(OUT))
