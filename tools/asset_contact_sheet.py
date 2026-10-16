import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'asset-sources' / 'flowers'
records = json.loads((BASE / 'candidates.json').read_text(encoding='utf-8'))
indexes = [1, 3, 6, 8, 21, 23, 25, 28, 42, 43, 57, 62, 65, 67, 69, 71, 81, 82, 90, 91, 94, 20]
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
canvas = Image.new('RGB', (1200, ((len(indexes)+4)//5)*280), '#eeeae3')
draw = ImageDraw.Draw(canvas)
for position, idx in enumerate(indexes):
    record = records[idx]
    x, y = (position % 5)*240, (position // 5)*280
    path = BASE / 'candidate-previews' / (record['base_id']+'.jpg')
    if path.exists():
        im = ImageOps.contain(Image.open(path).convert('RGB'), (224,224))
        canvas.paste(im, (x+8+(224-im.width)//2, y+8+(224-im.height)//2))
    draw.text((x+8,y+237), f"{idx}  {record['name'][:25]}", font=font, fill='#282a25')
canvas.save(BASE / 'candidate-contact-sheet.jpg', quality=92)
print(BASE / 'candidate-contact-sheet.jpg')
