#!/usr/bin/env python3
"""Make the small catalogue-card photos from the approved Home slide photos.

Run by hand, never at app build:  python3 scripts/promo-thumbs.py
Reads  app/src/assets/promo/<key>.jpg   (the full 1200 px slide photos)
Writes app/src/assets/promo-sm/<key>.webp  (400 px wide, 15-25 KB each)

The grid cards show these as a faint grayscale texture (CSS does the grayscale, so the
file stays in colour). The full slide stays for the Home banner and the brand sheet.
Only Pillow is needed; nothing here runs in the browser or the Vite build.
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent  # app/
SRC = ROOT / "src" / "assets" / "promo"
OUT = ROOT / "src" / "assets" / "promo-sm"
WIDTH = 400
LO, HI = 15 * 1024, 25 * 1024  # target 15-25 KB


def encode(img, quality):
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def best(img):
    """Highest quality whose webp is <= HI bytes (so size lands just under 25 KB)."""
    chosen, data = 20, encode(img, 20)
    for q in range(25, 96, 5):
        d = encode(img, q)
        if len(d) <= HI:
            chosen, data = q, d
        else:
            break
    # fine step up from the coarse winner
    for q in range(chosen + 1, chosen + 5):
        d = encode(img, q)
        if len(d) <= HI:
            chosen, data = q, d
        else:
            break
    return chosen, data


def main():
    if not SRC.is_dir():
        sys.exit(f"no source folder: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in (".jpg", ".jpeg"))
    if not files:
        sys.exit(f"no .jpg photos in {SRC}")
    total = 0
    for p in files:
        img = Image.open(p).convert("RGB")
        if img.width > WIDTH:
            h = round(img.height * WIDTH / img.width)
            img = img.resize((WIDTH, h), Image.LANCZOS)
        q, data = best(img)
        dst = OUT / (p.stem + ".webp")
        dst.write_bytes(data)
        kb = len(data) / 1024
        total += len(data)
        flag = "" if LO <= len(data) <= HI else "  <-- out of 15-25 KB"
        print(f"{p.stem:<14} q{q:<3} {kb:6.1f} KB{flag}")
    print(f"\n{len(files)} files, {total / 1024:.0f} KB total, into {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
