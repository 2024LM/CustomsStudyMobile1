#!/usr/bin/env python3
from pathlib import Path
import math
import struct
import zlib

OUT = Path("android/app/src/main/res")
PURPLE_A = (154, 69, 255, 255)
PURPLE_B = (82, 32, 213, 255)
CAP_TOP = (48, 48, 55, 255)
CAP_BOTTOM = (17, 17, 22, 255)
GOLD = (245, 180, 0, 255)
GOLD_LIGHT = (255, 224, 106, 255)

def blend(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))

def write_png(path, w, h, pix):
    raw = b''.join(b'\x00' + bytes(pix[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data)) + kind + data +
            struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        )
    data = (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) +
        chunk(b'IDAT', zlib.compress(raw, 9)) +
        chunk(b'IEND', b'')
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

def set_px(pix, w, h, x, y, color):
    if 0 <= x < w and 0 <= y < h:
        i = (y*w + x) * 4
        pix[i:i+4] = bytes(color)

def fill_polygon(pix, w, h, pts, color):
    ys = [p[1] for p in pts]
    y0, y1 = max(0, int(min(ys))), min(h - 1, int(max(ys)))
    n = len(pts)
    for y in range(y0, y1 + 1):
        scan_y = y + 0.5
        xs = []
        for i in range(n):
            x1, yy1 = pts[i]
            x2, yy2 = pts[(i + 1) % n]
            if (yy1 <= scan_y < yy2) or (yy2 <= scan_y < yy1):
                if yy2 != yy1:
                    xs.append(x1 + (scan_y - yy1) * (x2 - x1) / (yy2 - yy1))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            xa = max(0, int(math.ceil(xs[k])))
            xb = min(w - 1, int(math.floor(xs[k + 1])))
            for x in range(xa, xb + 1):
                set_px(pix, w, h, x, y, color)

def circle(pix, w, h, cx, cy, r, color):
    x0, x1 = max(0, int(cx-r)), min(w-1, int(cx+r))
    y0, y1 = max(0, int(cy-r)), min(h-1, int(cy+r))
    rr = r*r
    for y in range(y0, y1+1):
        for x in range(x0, x1+1):
            if (x-cx)**2 + (y-cy)**2 <= rr:
                set_px(pix, w, h, x, y, color)

def thick_line(pix, w, h, x0, y0, x1, y1, width, color):
    steps = max(int(abs(x1-x0)), int(abs(y1-y0)), 1)
    r = max(1.0, width / 2)
    for i in range(steps + 1):
        t = i / steps
        circle(pix, w, h, x0 + (x1-x0)*t, y0 + (y1-y0)*t, r, color)

def render(path, size, adaptive_foreground=False):
    w = h = size
    pix = bytearray(w*h*4)

    if adaptive_foreground:
        for i in range(w*h):
            pix[i*4:i*4+4] = bytes((0,0,0,0))
        scale = 0.62
    else:
        # Match the web icon's purple diagonal gradient.
        for y in range(h):
            for x in range(w):
                t = min(1.0, max(0.0, (x + y) / max(1, (w+h-2))))
                set_px(pix, w, h, x, y, blend(PURPLE_A, PURPLE_B, t))
        scale = 0.76

    s = size / 512.0
    def p(x, y):
        return (
            (256 + (x - 256) * scale) * s,
            (256 + (y - 256) * scale) * s,
        )

    # Filled graduation cap, matching public/favicon.svg.
    cap = [p(82,220), p(256,132), p(430,220), p(256,308)]
    fill_polygon(pix, w, h, cap, CAP_TOP)

    # Lower cap/body. Filled, not outlined.
    body = [p(150,270), p(256,324), p(362,270), p(362,340), p(350,365),
            p(322,385), p(287,398), p(256,402), p(225,398), p(190,385),
            p(162,365), p(150,340)]
    fill_polygon(pix, w, h, body, CAP_BOTTOM)

    # Center button.
    cx, cy = p(256,196)
    circle(pix, w, h, cx, cy, max(1.5, 13*s*scale), (36,36,43,255))

    # Gold cord: center -> left -> tassel.
    a = p(256,196)
    b = p(190,216)
    c = p(150,252)
    d = p(134,317)
    width = max(2.0, 10*s*scale)
    thick_line(pix,w,h,*a,*b,width,GOLD_LIGHT)
    thick_line(pix,w,h,*b,*c,width,GOLD)
    thick_line(pix,w,h,*c,*d,width,GOLD)

    tx, ty = p(134,326)
    circle(pix,w,h,tx,ty,max(2.0,14*s*scale),GOLD)
    for dx in (-12, 0, 12):
        x1,y1=p(134,340)
        x2,y2=p(134+dx,386)
        thick_line(pix,w,h,x1,y1,x2,y2,max(1.5,7*s*scale),GOLD)

    write_png(path, w, h, pix)

for folder,size in [
    ("mipmap-mdpi",48),
    ("mipmap-hdpi",72),
    ("mipmap-xhdpi",96),
    ("mipmap-xxhdpi",144),
    ("mipmap-xxxhdpi",192),
]:
    render(OUT/folder/"ic_launcher.png", size, False)
    render(OUT/folder/"ic_launcher_round.png", size, False)
    render(OUT/folder/"ic_launcher_foreground.png", size, True)

(OUT/"values").mkdir(parents=True,exist_ok=True)
(OUT/"values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources><color name="ic_launcher_background">#6C32E3</color></resources>\n'
)

for folder in ("mipmap-anydpi-v26","mipmap-anydpi-v33"):
    d=OUT/folder
    d.mkdir(parents=True,exist_ok=True)
    xml='''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
    (d/"ic_launcher.xml").write_text(xml)
    (d/"ic_launcher_round.xml").write_text(xml)

print("Generated Raje3 Android launcher icons matching the web artwork")
