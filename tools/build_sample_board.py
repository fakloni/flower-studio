import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'public/assets/sample-pack';OUT=ROOT/'artifacts/workbench-design'
assets=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))['assets']
canvas=Image.new('RGB',(1500,1050),'#f3f2ec');draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22);small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
draw.text((24,20),'FlowerStudio · 网页样片素材 / 实际 Blender 渲染',font=font,fill='#263b30')
for i,asset in enumerate(assets):
    for j,view in enumerate(['front','side']):
        x=i*300;y=80+j*470
        draw.rounded_rectangle((x+10,y,x+290,y+450),radius=12,fill='#fbfaf7')
        im=ImageOps.contain(Image.open(BASE/asset['previews'][view]).convert('RGBA'),(260,375))
        canvas.paste(im,(x+(300-im.width)//2,y+10),im)
        draw.text((x+24,y+387),asset['name']+' · '+('正面' if j==0 else '侧面'),font=font,fill='#263b30')
        detail='单支候选' if asset['kind']=='flower' else '花瓶模型'
        draw.text((x+24,y+422),f"{detail} · GLB {asset['model_bytes']/1048576:.2f} MiB",font=small,fill='#66736b')
canvas.save(OUT/'sample-pack.jpg',quality=94)
print(OUT/'sample-pack.jpg')
