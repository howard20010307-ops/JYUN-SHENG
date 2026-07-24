"""
將債務確認書用印章掃描圖：白底去背、紅色加深，輸出透明 PNG。
需：python -m pip install pillow numpy
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def luma_sat(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
  luma = 0.299 * r + 0.587 * g + 0.114 * b
  maxc = np.maximum(np.maximum(r, g), b)
  minc = np.minimum(np.minimum(r, g), b)
  sat = np.zeros_like(maxc)
  nz = maxc > 1e-3
  sat[nz] = (maxc[nz] - minc[nz]) / maxc[nz]
  return luma, sat


def process_stamp(src: Path, dst: Path) -> None:
  img = Image.open(src).convert("RGBA")
  a = np.array(img).astype(np.float32)
  r, g, b, alpha_in = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
  luma, sat = luma_sat(r, g, b)

  red_dom = (r > 70) & (r > g * 1.08) & (r > b * 1.08)
  ink = red_dom & (sat > 0.06)
  paper = (luma > 168) & (sat < 0.22) & ~ink
  paper = paper | ((luma > 210) & ~ink)

  ink_strength = np.clip((r - np.maximum(g, b)) / 120.0, 0, 1)
  edge = (~paper) & ~ink & (ink_strength > 0.08)
  keep = ink | edge

  r_out = np.where(keep, np.clip(r * 1.42, 0, 235), r)
  g_out = np.where(keep, np.clip(g * 0.42, 0, 120), g)
  b_out = np.where(keep, np.clip(b * 0.42, 0, 120), b)

  alpha = np.zeros_like(r)
  alpha[ink] = 255
  alpha[edge] = np.clip(ink_strength[edge] * 255, 80, 220)
  alpha[paper] = 0
  faint = keep & ~ink & ~edge
  alpha[faint] = np.clip(luma[faint] * -1.2 + 180, 0, 60)

  out = np.stack([r_out, g_out, b_out, alpha], axis=-1).astype(np.uint8)
  result = Image.fromarray(out, "RGBA")

  bbox = result.getbbox()
  if bbox:
    pad = 4
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(result.width, x1 + pad)
    y1 = min(result.height, y1 + pad)
    result = result.crop((x0, y0, x1, y1))

  dst.parent.mkdir(parents=True, exist_ok=True)
  result.save(dst, optimize=True)
  print(f"OK {dst} ({result.width}x{result.height})")


def main() -> None:
  assets = Path(
    r"C:\Users\User\.cursor\projects\c-Users-User-Desktop\assets"
  )
  pairs = [
    (
      assets
      / "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_947f70f40e9bc9610cae61f300cf3ace_images_S__86835228_0-0a88e8d5-a8b8-4c6f-b671-e19c23c9ad02.png",
      PUBLIC / "debt-confirmation-company-stamp.png",
    ),
    (
      assets
      / "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_947f70f40e9bc9610cae61f300cf3ace_images_S__86835229_0-397ccc47-a28f-4cf1-9a51-1179495818d3.png",
      PUBLIC / "debt-confirmation-personal-stamp.png",
    ),
  ]
  if len(sys.argv) >= 3:
    pairs = [(Path(sys.argv[1]), Path(sys.argv[2]))]
  for src, dst in pairs:
    if not src.is_file():
      print(f"missing: {src}", file=sys.stderr)
      sys.exit(1)
    process_stamp(src, dst)


if __name__ == "__main__":
  main()
