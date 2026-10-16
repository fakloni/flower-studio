import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'asset-library'
OUT.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
title=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',34)

def board(items,filename,heading,cols,cell=(360,420)):
    w,h=cell
    canvas=Image.new('RGB',(cols*w,105+((len(items)+cols-1)//cols)*h),'#eeeae3')
    draw=ImageDraw.Draw(canvas)
    draw.text((28,22),heading,font=title,fill='#29382f')
    for i,item in enumerate(items):
        x=(i%cols)*w;y=105+(i//cols)*h
        draw.rounded_rectangle((x+12,y+8,x+w-12,y+h-12),radius=14,fill='#faf8f4')
        im=Image.open(item['path']).convert('RGBA')
        im=ImageOps.contain(im,(w-44,h-95))
        canvas.paste(im,(x+(w-im.width)//2,y+18+(h-95-im.height)//2),im)
        draw.text((x+24,y+h-68),item['label'],font=font,fill='#29382f')
        draw.text((x+24,y+h-34),item.get('detail',''),font=small,fill='#686d63')
    canvas.save(OUT/filename,quality=94)
    print(OUT/filename)

vases=json.loads((ROOT/'public/assets/vases/catalog.json').read_text(encoding='utf-8'))
board([{'path':ROOT/'public'/v['preview'].lstrip('/'),'label':v['name'],'detail':f"高 {v['dimensions']['height_cm']} cm · 内口径 {v['dimensions']['mouth_inner_diameter_cm']} cm"} for v in vases],'vases-overview.jpg','FlowerStudio · 原创花瓶素材 / 01',4)

flowers=json.loads((ROOT/'asset-sources/flowers/collection.json').read_text(encoding='utf-8'))
labels={'Astilbe White Rose':'落新妇 / 整组','Dahlia flowers':'大丽花 / 整组','Eucalyptus Bouquet Vase':'尤加利 / 整组','Flower Sunflower Medium':'向日葵 / 单支候选','Hydrangea  light yellow':'浅黄绣球 / 整组','Red rose flower':'红玫瑰 / 单支候选','Red Spider Lily':'红花石蒜 / 单支候选','Roses in Twisted Glass Vase':'粉玫瑰 / 双支组合','SJ-Mystic Garden Serenity Fern':'观赏花穗与蕨叶 / 整组','Tulips':'紫橙郁金香 / 整组','Tulips in a pot':'白郁金香 / 整组','Yellow Flower':'黄色花材 / 单支候选'}
board([{'path':ROOT/f['downloaded'][0]['path'].replace('original.blend','source-preview.jpg').replace('original.glb','source-preview.jpg'),'label':labels.get(f['name'],f['name']),'detail':'来源预览 · 模型已下载并通过导入检查'} for f in flowers if f['downloaded']],'flowers-overview.jpg','FlowerStudio · 花材候选库 / 来源预览',4,cell=(360,390))

prepared_path=ROOT/'public/assets/flowers/catalog.json'
if prepared_path.exists():
    prepared=json.loads(prepared_path.read_text(encoding='utf-8'))
    board([{'path':ROOT/'public'/f['preview'].lstrip('/'),'label':f['name'],'detail':'本机 Blender 实际渲染 · 初步处理样本'} for f in prepared],'flowers-prepared.jpg','FlowerStudio · 花材样本 / 实际渲染',3,cell=(400,520))
