"""
將印章／標章 PNG 外圍黑底改為白底（覆寫原檔）。
與 invoice-stamp-remove-black-bg.py 相同之「黑底」偵測，改為填白色不透明。
需：pip install pillow numpy
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


def black_bg_mask(a: np.ndarray) -> np.ndarray:
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
  return is_blackish | is_near_black


def main() -> None:
  paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else []
  if not paths:
    root = Path(__file__).resolve().parents[1]
    paths = [
      root / "public" / "quotation-stamp.png",
      root / "public" / "owner-scope-company-stamp.png",
      root / "public" / "pricing-stamp.png",
    ]
  for path in paths:
    if not path.is_file():
      print(f"skip missing: {path}", file=sys.stderr)
      continue
    img = Image.open(path).convert("RGBA")
    a = np.array(img)
    mask = black_bg_mask(a)
    a[:, :, 0] = np.where(mask, 255, a[:, :, 0])
    a[:, :, 1] = np.where(mask, 255, a[:, :, 1])
    a[:, :, 2] = np.where(mask, 255, a[:, :, 2])
    a[:, :, 3] = np.where(mask, 255, a[:, :, 3])
    Image.fromarray(a, "RGBA").save(path, optimize=True)
    print(f"OK {path}")


if __name__ == "__main__":
  main()
