import json
from PIL import Image, ImageDraw
G = json.load(open('poses.json'))
CW, CH = 300, 420
cols = 3
rows = (len(G)+cols-1)//cols
img = Image.new('RGB', (CW*cols, CH*rows), '#F2F1EC')
d = ImageDraw.Draw(img)
S = min(CW/1000.0, CH/1400.0)*0.92
for i, g in enumerate(G):
    ox = (i % cols)*CW + (CW-1000*S)/2
    oy = (i//cols)*CH + (CH-1400*S)/2
    for p in g['polys']:
        pts = [(ox+x*S, oy+y*S) for x, y in p['pts']]
        if len(pts) > 2:
            d.polygon(pts, fill='#14120F')
    d.text(((i%cols)*CW+8, (i//cols)*CH+6), g['label'], fill='#888')
    d.rectangle([(i%cols)*CW, (i//cols)*CH, (i%cols)*CW+CW-1, (i//cols)*CH+CH-1], outline='#ddd')
img.save('poses.png')
print('ok')
