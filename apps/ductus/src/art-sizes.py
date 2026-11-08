"""DUCTUS icon and thumb sizes from the masters art.mjs wrote (Pillow):  python3 apps/ductus/src/art-sizes.py"""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(HERE); M = os.path.join(APP, 'marketing', 'masters')
sq = Image.open(os.path.join(M, 'master-square.png')).convert('RGB'); ic = Image.open(os.path.join(M, 'master-icon.png')).convert('RGB')
sq.resize((512, 512), Image.LANCZOS).save(os.path.join(APP, 'marketing', 'thumb-512.png'), optimize=True)
ic.resize((512, 512), Image.LANCZOS).save(os.path.join(APP, 'icon-512.png'), optimize=True)
ic.resize((192, 192), Image.LANCZOS).save(os.path.join(APP, 'icon-192.png'), optimize=True)
ic.resize((180, 180), Image.LANCZOS).save(os.path.join(APP, 'apple-touch-icon.png'), optimize=True)
m = Image.new('RGB', (512, 512), (241, 233, 214)); inner = ic.resize((410, 410), Image.LANCZOS); m.paste(inner, (51, 51)); m.save(os.path.join(APP, 'icon-maskable-512.png'), optimize=True)
Image.open(os.path.join(M, 'master-og.png')).convert('RGB').save(os.path.join(APP, 'marketing', 'og-1200x630.jpg'), quality=86, optimize=True)
for f in ['marketing/thumb-512.png', 'icon-512.png', 'icon-192.png', 'apple-touch-icon.png', 'icon-maskable-512.png', 'marketing/og-1200x630.jpg']:
    print(f, os.path.getsize(os.path.join(APP, f)), Image.open(os.path.join(APP, f)).size)
