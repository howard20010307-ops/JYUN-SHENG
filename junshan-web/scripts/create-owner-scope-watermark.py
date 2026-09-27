"""Extract the gold artwork from a black-background source as a transparent PNG."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
  if len(sys.argv) != 3:
    raise SystemExit("usage: create-owner-scope-watermark.py SOURCE OUTPUT")

  source = Path(sys.argv[1])
  output = Path(sys.argv[2])
  image = Image.open(source).convert("RGBA")
  rgba = np.asarray(image).copy()
  rgb = rgba[:, :, :3].astype(np.float32) / 255
  r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

  # Keep amber/gold pixels while excluding the black background and red markup.
  maxc = np.maximum(np.maximum(r, g), b)
  minc = np.minimum(np.minimum(r, g), b)
  saturation = np.divide(maxc - minc, maxc, out=np.zeros_like(maxc), where=maxc > 0)
  gold = (
    (r > 0.22)
    & (g > 0.12)
    & (r >= g)
    & (g >= b * 1.12)
    & (g / np.maximum(r, 0.001) > 0.40)
    & (saturation > 0.12)
  )

  # The uncircled left slogan is intentionally outside the requested artwork.
  gold[:, :150] = False
  alpha_strength = np.clip((maxc - 0.12) / 0.55, 0, 1)
  # Bake in low opacity so both the browser preview and jsPDF stay readable.
  alpha = np.where(gold, 45 * alpha_strength, 0).astype(np.uint8)
  rgba[:, :, 3] = alpha

  ys, xs = np.nonzero(alpha)
  if len(xs) == 0:
    raise RuntimeError("No gold artwork detected")
  pad = 8
  box = (
    max(0, int(xs.min()) - pad),
    max(0, int(ys.min()) - pad),
    min(image.width, int(xs.max()) + pad + 1),
    min(image.height, int(ys.max()) + pad + 1),
  )
  result = Image.fromarray(rgba, "RGBA").crop(box)
  output.parent.mkdir(parents=True, exist_ok=True)
  result.save(output, optimize=True)
  print(f"OK {output} ({result.width}x{result.height})")


if __name__ == "__main__":
  main()
