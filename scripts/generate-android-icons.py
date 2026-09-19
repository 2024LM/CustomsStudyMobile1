#!/usr/bin/env python3
from pathlib import Path
import struct, zlib

OUT = Path("android/app/src/main/res")
BG=(91,38,218,255); BLACK=(28,28,34,255); GOLD=(246,181,20,255)

def png(path, size, content_scale=0.72, transparent=False):
    w=h=size
    pix=bytearray(w*h*4)
    base=(0,0,0,0) if transparent else BG
    for i in range(w*h): pix[i*4:i*4+4]=bytes(base)
    def line(x0,y0,x1,y1,width,color=BLACK):
        steps=max(abs(x1-x0),abs(y1-y0),1)
        r=width/2
        for k in range(steps+1):
            t=k/steps; cx=x0+(x1-x0)*t; cy=y0+(y1-y0)*t
            xa=max(0,int(cx-r)); xb=min(w-1,int(cx+r)); ya=max(0,int(cy-r)); yb=min(h-1,int(cy+r))
            rr=r*r
            for y in range(ya,yb+1):
                for x in range(xa,xb+1):
                    if (x-cx)**2+(y-cy)**2<=rr:
                        j=(y*w+x)*4; pix[j:j+4]=bytes(color)
    s=size/512
    def p(x,y): return (int((256+(x-256)*content_scale)*s), int((256+(y-256)*content_scale)*s))
    # Compact black graduation cap kept inside Android adaptive-icon safe zone.
    pts=[p(90,205),p(256,122),p(422,205),p(256,288),p(90,205)]
    for x,y in zip(pts,pts[1:]): line(x[0],x[1],y[0],y[1],max(3,int(34*s*content_scale)),BLACK)
    for x,y in [((150,248),(150,330)),((150,330),(256,390)),((256,390),(362,330)),((362,330),(362,248))]:
        x=p(*x); y=p(*y); line(x[0],x[1],y[0],y[1],max(3,int(30*s*content_scale)),BLACK)
    # Gold cord and tassel.
    x0=p(256,205); x1=p(150,260); x2=p(140,335)
    line(x0[0],x0[1],x1[0],x1[1],max(2,int(10*s*content_scale)),GOLD)
    line(x1[0],x1[1],x2[0],x2[1],max(2,int(10*s*content_scale)),GOLD)
    for dx in (-14,-7,0,7,14):
        a=p(140,338); z=p(140+dx,385)
        line(a[0],a[1],z[0],z[1],max(2,int(7*s*content_scale)),GOLD)
    raw=b''.join(b'\x00'+bytes(pix[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(t,d): return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack(">IIBBBBB",w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)

for folder,size in [("mipmap-mdpi",48),("mipmap-hdpi",72),("mipmap-xhdpi",96),("mipmap-xxhdpi",144),("mipmap-xxxhdpi",192)]:
    png(OUT/folder/"ic_launcher.png",size)
    png(OUT/folder/"ic_launcher_round.png",size)
    png(OUT/folder/"ic_launcher_foreground.png",size,0.72,True)

(OUT/"values").mkdir(parents=True,exist_ok=True)
(OUT/"values/ic_launcher_background.xml").write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#5B3FD6</color></resources>\n')
for folder in ("mipmap-anydpi-v26","mipmap-anydpi-v33"):
    d=OUT/folder; d.mkdir(parents=True,exist_ok=True)
    xml='''<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n'''
    (d/"ic_launcher.xml").write_text(xml); (d/"ic_launcher_round.xml").write_text(xml)
print("Generated Android launcher icons")
