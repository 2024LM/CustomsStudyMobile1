#!/usr/bin/env python3
"""Generate launcher sizes from the approved web artwork; never redraw it."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'android/app/src/main/res'
SOURCE = ROOT / 'public/app-icon.png'
with Image.open(SOURCE) as source:
    source.load()
    if source.width != source.height or source.width < 512:
        raise ValueError('App icon must be square and at least 512 pixels.')
    artwork = source.convert('RGBA')

for folder, size in [('mipmap-mdpi',48), ('mipmap-hdpi',72),
                     ('mipmap-xhdpi',96), ('mipmap-xxhdpi',144),
                     ('mipmap-xxxhdpi',192)]:
    destination = OUT / folder
    destination.mkdir(parents=True, exist_ok=True)
    icon = artwork.resize((size,size), Image.Resampling.LANCZOS)
    for name in ('ic_launcher.png','ic_launcher_round.png'):
        icon.save(destination / name)
    # Adaptive canvas is 108 dp. Keep the cap within the central 66 dp
    # safe area: the artwork's cap occupies approximately 68% of its width.
    adaptive_size = round(size * 108 / 48)
    foreground = Image.new('RGBA', (adaptive_size,adaptive_size))
    artwork_size = round(adaptive_size * .88)
    inset = (adaptive_size-artwork_size)//2
    foreground.alpha_composite(artwork.resize((artwork_size,artwork_size),
                              Image.Resampling.LANCZOS), (inset,inset))
    foreground.save(destination / 'ic_launcher_foreground.png')

(OUT/'values').mkdir(parents=True,exist_ok=True)
(OUT/'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources><color name="ic_launcher_background">#6C32E3</color></resources>\n')
for folder in ('mipmap-anydpi-v26','mipmap-anydpi-v33'):
    destination=OUT/folder
    destination.mkdir(parents=True,exist_ok=True)
    xml='''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
    for name in ('ic_launcher.xml','ic_launcher_round.xml'):
        (destination/name).write_text(xml)
print('Generated Android icons from public/app-icon.png')
