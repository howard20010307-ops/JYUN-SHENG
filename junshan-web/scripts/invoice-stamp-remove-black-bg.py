"""
將統一發票章掃描圖的黑底轉透明（覆寫 public/company-invoice-stamp.png）。
需 Pillow、numpy：pip install pillow numpy
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "public" / "company-invoice-stamp.png"


def main() -> None:
  path = Path(sys.argv[1]) if len(sys.argv) > 1 else PNG
  if not path.is_file():
    print(f"missing: {path}", file=sys.stderr)
    sys.exit(1)
  img = Image.open(path).convert("RGBA")
  a = np.array(img)
  rgb = a[:, :, :3].astype(np.float32)
  r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
  luma = 0.299 * r + 0.587 * g + 0.114 * b
  maxc = np.maximum(np.maximum(r, g), b)
  minc = np.minimum(np.minimum(r, g), b)
  sat = np.zeros_like(maxc)
  nz = maxc > 1e-3
  sat[nz] = (maxc[nz] - minc[nz]) / maxc[nz]
  is_blackish = (luma < 52) & (sat < 0.35) & (maxc < 70)
  is_near_black = (r < 48) & (g < 48) & (b < 58)
  mask = is_blackish | is_near_black
  a[:, :, 3] = np.where(mask, 0, a[:, :, 3]).astype(np.uint8)
  Image.fromarray(a, "RGBA").save(path, optimize=True)
  print(f"OK {path}")


if __name__ == "__main__":
  main()
