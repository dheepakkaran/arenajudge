#!/usr/bin/env python3
"""Make assets/og-image.png (1200x630), the link-preview image for the website.

Text only: the project name and tagline from data/project.json, so it never shows a
number that could go stale. Needs Pillow:  pip install pillow
Run from the repo root:  python scripts/make_og_image.py
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG, SURFACE, TEXT, MUTED, ACCENT, COOL = "#000000", "#111111", "#FFFFFF", "#A3A3A3", "#FFFFFF", "#808080"

FONT_CANDIDATES = {
    "bold": ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "regular": ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"],
}


def font(kind, size):
    for path in FONT_CANDIDATES[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line] if line else lines


def main():
    with open("data/project.json", encoding="utf-8") as fh:
        project = json.load(fh)["project"]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 8], fill=ACCENT)                                   # progress-bar motif
    d.rounded_rectangle([80, 120, 80 + 56, 120 + 56], radius=12, fill=SURFACE)  # the favicon mark
    d.rounded_rectangle([93, 133, 105, 163], radius=3, fill=ACCENT)
    d.rounded_rectangle([111, 145, 123, 163], radius=3, fill=COOL)

    d.text((80, 200), project["name"], font=font("bold", 110), fill=TEXT)
    tag_font = font("regular", 40)
    y = 350
    for line in wrap(d, project["tagline"], tag_font, W - 200):
        d.text((80, y), line, font=tag_font, fill=MUTED)
        y += 54
    d.text((80, 530), f"{project['author']} · with {project['teammate']}", font=font("bold", 30), fill=ACCENT)

    os.makedirs("assets", exist_ok=True)
    img.save("assets/og-image.png", optimize=True)
    print("wrote assets/og-image.png", os.path.getsize("assets/og-image.png"), "bytes")


if __name__ == "__main__":
    main()
