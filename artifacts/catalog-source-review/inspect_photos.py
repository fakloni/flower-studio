"""Observe source-page image URLs; no published catalog mutations."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import json
import requests

ROOT=Path(__file__).parent
PAGES=[
 ('anthura-manila',['P018'],'https://anthura.nl/en/products/phalaenopsis-cut/manila/'),
 ('danziger-xlence',['P082'],'https://www.danzigeronline.com/catalog/cut_flowers_catalog/xlence/'),
 ('danziger-million',['P083'],'https://www.danzigeronline.com/catalog/cut_flowers_catalog/million-stars/'),
 ('hilverda-girona',['P066'],'https://www.hilverdaflorist.com/en/assortment/cut-flowers/assortment-cut-flowers/carnation-spray-girona'),
 ('ncsu-cinerea',['P067'],'https://plants.ces.ncsu.edu/plants/eucalyptus-cinerea/'),
 ('ncsu-monstera',['P051'],'https://plants.ces.ncsu.edu/plants/monstera-deliciosa/common-name/swiss-cheese-plant/'),
 ('deruiter-proud',['P052'],'https://www.deruiter.com/product/proud'),
 ('sakata-mariachi',['P057','P058'],'https://sakataornamentals.eu/product/mariachi/'),
]

class Images(HTMLParser):
 def __init__(self): super().__init__(); self.images=[]
 def handle_starttag(self,tag,attrs):
  values=dict(attrs)
  if tag=='img': self.images.append({k:v for k,v in values.items() if k in ('src','data-src','alt')})
  if values.get('data-full'): self.images.append({'src':values['data-full'],'alt':'full-size product gallery'})

def inspect(item):
 source_id,ids,url=item
 result={'sourceId':source_id,'productIds':ids,'sourcePage':url,'date':'2026-10-14'}
 try:
  response=requests.get(url,timeout=20); response.raise_for_status(); parser=Images(); parser.feed(response.text)
  for image in parser.images:
   for key in ('src','data-src'):
    if image.get(key): image[key]=urljoin(response.url,image[key])
  result['images']=parser.images
 except Exception as error: result['fetchError']=str(error)
 return result

if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(inspect,PAGES))
 (ROOT/'observed-images.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 for item in results:
  pics=[p for p in item.get('images',[]) if not p.get('src','').endswith('.svg')]
  print(json.dumps({'sourceId':item['sourceId'],'imageTags':len(pics),'error':item.get('fetchError'),'sample':pics[:8]},ensure_ascii=False))
