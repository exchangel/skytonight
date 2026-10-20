#!/usr/bin/env python3
"""
make_icons.py — Uygulama ikonlarını (PNG) üretir: iPhone ana ekranı ve PWA için.

Tasarım icons/favicon.svg ile aynıdır: koyu gece mavisi zemin, halkalı bir gezegen
ve birkaç yıldız. Tüm içerik "maskable" güvenli alanında (merkezden %40 yarıçap)
kalır; böylece Android'in yuvarlak/damla maskeleri de ikonu kesmez.

Kullanım:  python scripts/make_icons.py      (Pillow ve numpy gerekir)
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
SUPERSAMPLE = 4  # kenar yumuşatma için 4 kat büyük çizip küçültüyoruz


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def render(size):
    s = size * SUPERSAMPLE
    y, x = np.mgrid[0:s, 0:s].astype(float) / s  # 0..1 koordinatlar

    # Zemin: sol üstten sağ alta gece mavisi gradyan + gezegen çevresinde hafif parıltı.
    t = np.clip((x + y) / 2, 0, 1)[..., None]
    img = hex_rgb("#1d2856") * (1 - t) + hex_rgb("#070a14") * t
    cx, cy = 0.5, 0.53
    glow = np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / 0.05))[..., None]
    img = img + glow * np.array([40.0, 48.0, 110.0]) * 0.35

    def paint(mask, color, alpha=1.0):
        nonlocal img
        a = (mask.astype(float) * alpha)[..., None]
        img = img * (1 - a) + color * a

    # Yıldızlar
    for sx, sy, r in ((0.2, 0.22, 0.013), (0.8, 0.18, 0.009), (0.82, 0.8, 0.008), (0.17, 0.77, 0.007)):
        paint((x - sx) ** 2 + (y - sy) ** 2 < r * r, hex_rgb("#ffffff"), 0.9)

    # Halka: döndürülmüş elips bandı (−18°). v < 0 olan yarı gezegenin arkasında kalır.
    ang = np.deg2rad(18)
    u = (x - cx) * np.cos(ang) - (y - cy) * np.sin(ang)
    v = (x - cx) * np.sin(ang) + (y - cy) * np.cos(ang)
    d = np.sqrt((u / 0.36) ** 2 + (v / 0.106) ** 2)
    ring = np.abs(d - 1) < 0.075
    ring_color = hex_rgb("#e9dcb0")
    paint(ring & (v < 0), ring_color, 0.95)

    # Gezegen: sol üstten aydınlatılmış küre.
    pr = 0.19
    disk = (x - cx) ** 2 + (y - cy) ** 2 < pr * pr
    shade = np.clip(((x - cx) + (y - cy)) / (2 * pr) + 0.5, 0, 1)[..., None]
    planet = hex_rgb("#cdd5ff") * (1 - shade) + hex_rgb("#5d70ea") * shade
    a = disk.astype(float)[..., None]
    img = img * (1 - a) + planet * a

    paint(ring & (v >= 0), ring_color, 0.95)

    image = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    return image.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    targets = {
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-maskable-512.png": 512,
    }
    for name, size in targets.items():
        render(size).save(OUT / name, optimize=True)
        print(f"icons/{name} ({size}×{size})")


if __name__ == "__main__":
    main()
