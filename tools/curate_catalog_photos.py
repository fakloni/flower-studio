"""Prepare explicit per-product selections and visual QA sheets before importing."""
from pathlib import Path
from copy import deepcopy
from collections import Counter
import json
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/catalog-photo-fill'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
catalog=read(ROOT/'data/catalog/catalog.json');pmap={p['id']:p for p in catalog['products']}
selections={}
def select(record,pid=None,note=None):
    r=deepcopy(record);pid=pid or r['productIds'][0];r['productIds']=[pid]
    r['selectionNote']=note or '物种／类别照片参考，非商家实物或完整多角度重建素材。'
    r['nameConfirmedForCatalog']=pmap[pid]['nameStatus'] in {'类别有来源；SKU待核实','品种资料已核实；国内在售未确认'}
    selections[pid]=r
for file in ['collected.json','supplement.json']:
    for page in read(OUT/file):
        records=page.get('records',[])
        if records and not page['key'].startswith('j-'):
            select(records[0])
jmap={'amaranthus.jpg':'P030','astilbe.jpg':'P026','jasminumsambac.jpg':'P024',
      'freesia.jpg':'P048','orchidoncidium.jpg':'P086','curcuma.jpg':'P087','craspedia.jpg':'P098',
      'kangaroopaw.jpg':'P094','tweedia.jpg':'P091','greenbell.jpg':'P103',
      'pumpkintree.jpg':'P104','explosiongrass.jpg':'P016','margarita.jpg':'P015',
      'alstroemeria.jpg':'P101','spraymum.jpg':'P002'}
for page in read(OUT/'collected.json'):
    for r in page.get('records',[]):
        pid=jmap.get(Path(r['localPath']).name)
        if pid and pid not in selections:
            select(r,pid,'花艺索引中的商品名照片；原摄影者及许可未明确，仅作本地待核参考，不能作为物种确认。')
for r in read(OUT/'lily-extracted.json'):
    pid=r['productIds'][0]
    if pid not in selections or pid in {'P059','P060','P063','P064'} and 'vandenbos' not in selections[pid]['localPath']:
        select(r,note='Van den Bos 目录明确标注的品种／杂交组参考：'+r['caption']+'；非本店 SKU。')
if (OUT/'commercial.json').exists():
    for r in read(OUT/'commercial.json'):
        pid=r['productIds'][0]
        if pid not in selections or 'deliflor' not in selections[pid]['sourcePage']:
            select(r,note='育种方／供应方具名商品照片；'+r.get('caption','')+'；作为类别／品种参考。')
for folder in ['catalog-media-audit','catalog-source-review']:
    base=ROOT/'artifacts'/folder
    for r in read(base/'candidates.json'):
        pid=r['productIds'][0]
        if pid in selections and selections[pid].get('sourceOrganization') not in {'NC State Extension Plant Toolbox'}:continue
        record=deepcopy(r);record['localPath']=(base/r['localPath']).relative_to(ROOT).as_posix()
        record['author']=r.get('sourceAuthor') or r.get('sourceOrganization') or {'P018':'Anthura','P052':'De Ruiter','P066':'HilverdaFlorist','P082':'Danziger','P083':'Danziger'}.get(pid,'Source organization')
        record['sourceOrganization']=r.get('sourceOrganization') or record['author']
        record['license']=r.get('sourceLicense') or ('Anthura photo-library attribution: Anthura + variety name' if pid=='P018' else 'Use conditions not verified; local reference only')
        # Prefer the white-background head or branched product photo instead of an inset or crop.
        if pid in selections and folder== 'catalog-source-review' and pid not in {'P051','P067'}:continue
        select(record,note=r.get('visualReviewNotes','具名品种／类别真实照片参考。'))
for pid,source in [('P070','P072'),('P071','P073')]:
    if source in selections:select(selections[source],pid, f"{pmap[source]['name']}作为该类别的具名代表品种，不代表该类别全部商品。")

save={'checkedDate':'2026-10-14','selections':selections,'missing':[{'productId':p['id'],'name':p['name']} for p in catalog['products'] if p['id'] not in selections]}
(OUT/'selections-draft.json').write_text(json.dumps(save,ensure_ascii=False,indent=2),encoding='utf-8')
print('SELECTED',len(selections),'MISSING',save['missing'])
items=sorted(selections.items());font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)
for offset in range(0,len(items),24):
    sheet=Image.new('RGB',(1200,1440),'white');draw=ImageDraw.Draw(sheet)
    for j,(pid,r) in enumerate(items[offset:offset+24]):
        im=Image.open(ROOT/r['localPath']).convert('RGB');im.thumbnail((285,280))
        x=(j%4)*300+(300-im.width)//2;y=(j//4)*240
        im.thumbnail((285,195));sheet.paste(im,((j%4)*300+(300-im.width)//2,y))
        draw.text(((j%4)*300+8,y+198),pid+' '+pmap[pid]['name'][:16],fill='black',font=font)
        draw.text(((j%4)*300+8,y+219),r.get('caption',r.get('sourceAlt',''))[:30],fill='#555555',font=font)
    target=OUT/f'review-sheet-{offset//24+1}.jpg';sheet.save(target,quality=90);print(target)
