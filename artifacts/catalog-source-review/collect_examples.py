"""Save a small selection of observed source photographs as private candidates."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
import json
import requests
from PIL import Image

ROOT=Path(__file__).parent
pages=json.loads((ROOT/'observed-images.json').read_text(encoding='utf-8'))
selected=[]
choices={
 'anthura-manila':['enphalaenopsis-cut-manila-lilac-100963-1.jpg','enphalaenopsis-cut-manila-lilac-100963-0.jpg'],
 'danziger-xlence':['/XLENCE-SINGLE-1200x1074.jpg.webp','/Xlence-white-background-1097x1200.jpg.webp','/XLENCE.jpg.webp'],
 'danziger-million':['/Million-Stars.jpg.webp','/DGP_3807-Million-Stars-1200x797.jpg.webp'],
 'hilverda-girona':['/2406/','/2407/'],
 'ncsu-cinerea':['/-Eucalyptus_cinerea__2weSiqQsyPPY.jfif'],
 'ncsu-monstera':['/monstera-deliciosa-l_jNLlbqthrVY5.jfif'],
 'deruiter-proud':['Proud1_i39hnz.avif','Proud2_squq7x.avif'],
}
for page in pages:
 seen=set()
 for image in page.get('images',[]):
  url=image.get('src',''); path=urlsplit(url).path
  if url.startswith('https://') and path not in seen and any(part in path for part in choices.get(page['sourceId'],[])):
   seen.add(path)
   selected.append({'productIds':page['productIds'],'sourceId':page['sourceId'],'sourcePage':page['sourcePage'],'imageUrl':url,'sourceAlt':image.get('alt'),'retrievedDate':'2026-10-14','mediaOrigin':'real-photo-candidate','publicationStatus':'private-candidate','mappingScope':'category-or-species-reference','sameSpecimenMultiView':False,'visualReview':'pending'})

def download(item):
 try:
  response=requests.get(item['imageUrl'],timeout=25); response.raise_for_status(); data=response.content
  im=Image.open(BytesIO(data)); im.verify(); im=Image.open(BytesIO(data))
  dest=ROOT/'candidates'/item['productIds'][0]/Path(urlsplit(item['imageUrl']).path).name
  dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() and dest.read_bytes()!=data: raise ValueError('Different candidate already exists; use a new version')
  if not dest.exists(): dest.write_bytes(data)
  item.update(localPath=dest.relative_to(ROOT).as_posix(),width=im.width,height=im.height,bytes=len(data),sha256=sha256(data).hexdigest())
 except Exception as error: item['downloadError']=str(error)
 return item

if __name__=='__main__':
 with ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(download,selected))
 (ROOT/'candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 for item in results: print(json.dumps({k:v for k,v in item.items() if k in ('productIds','localPath','width','height','downloadError')},ensure_ascii=False))
