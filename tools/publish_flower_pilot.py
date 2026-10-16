"""Install the ten visually reviewed local model references using new asset versions."""
from hashlib import sha256
from pathlib import Path
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];BATCH=ROOT/'asset-sources/flower-pipeline/pilot-10-20261014'
inventory=json.loads((BATCH/'inventory.json').read_text(encoding='utf-8'))
revised={'P052','P065','P020','P067','P057'}
prepared=[]
for item in inventory:
    version=2 if item['productId'] in revised else 1
    source=Path(item['out']).with_name('v'+str(version))
    manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    assert manifest['checks']['roundTrip'] and manifest['checks']['embeddedTextures']
    assert all((source/f).is_file() for f in manifest['files'])
    prepared.append((item,version,source,manifest))
def put(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.read_bytes()!=data:raise ValueError('Existing version differs; use a new version: '+str(path))
    if not path.exists():path.write_bytes(data)
def webp(source,target,size):
    from io import BytesIO
    im=Image.open(source).convert('RGBA');im.thumbnail(size)
    buffer=BytesIO();im.save(buffer,format='WEBP',quality=90,method=6);put(target,buffer.getvalue())
registry_path=ROOT/'data/catalog/assets.json';registry=json.loads(registry_path.read_text(encoding='utf-8'))
ids={a['id'] for a in registry['assets']};photos=[];models=[];report=[]
for item,version,source,manifest in prepared:
    pid=item['productId'];slug=item['editorId'];model_url=f'/assets/catalog/{pid}/pilot-model-v{version}'
    public=ROOT/'public'/model_url.lstrip('/')
    put(public/'stem.glb',(source/'stem.glb').read_bytes())
    for view in ['front','left','back','right','head-front']:
        webp(source/(view+'.png'),public/(view+'.webp'),(600,900) if view!='head-front' else (480,480))
    photo=item['photo'];photo_url=f'/assets/catalog/{pid}/photo-reference-v1/cover.webp'
    webp(ROOT/photo['localPath'],ROOT/'public'/photo_url.lstrip('/'),(1200,1200))
    photo_id=pid.lower()+'-photo-reference-v1'
    if photo_id not in ids:
        photos.append({'id':photo_id,'version':1,'productId':pid,'variantId':slug+'-photo-reference',
                       'kind':'photo','mappingStatus':'category-or-variety-reference','authorizationStatus':'source-recorded-local-reference',
                       'publicationStatus':'local-reference','coverUrl':photo_url,'sourceUrl':photo['sourcePage'],
                       'author':photo.get('author') or photo.get('sourceAuthor') or photo.get('sourceOrganization'),
                       'license':(photo.get('sourceLicense') or photo.get('license')) if (photo.get('sourceLicense') or photo.get('license','')).startswith('CC') else '使用条件待核对；本地参考',
                       'mediaOrigin':'real-photo','notes':photo.get('selectionNote','类别／品种真实照片参考，非本店实物。')})
    model_id=pid.lower()+f'-pilot-model-v{version}'
    if model_id not in ids:
        models.append({'id':model_id,'version':version,'productId':pid,'variantId':slug,'kind':'model-preview',
                       'mappingStatus':'category-or-variety-reference','authorizationStatus':'local-model-reference',
                       'publicationStatus':'local-reference','coverUrl':model_url+'/head-front.webp','mediaOrigin':'model-render',
                       'notes':'根据真实照片参数化建模的单支试点；背面、精确瓣数及枝叶数量含推测，尺寸未实测。',
                       'sourceUrl':photo['sourcePage'],'physicalDimensionsVerified':False,
                       'editor':{'id':slug,'name':item['name'],'color':item['color'],'role':item['role'],'isPilot':True,
                                 'height':manifest['checks']['boundsM']['max'][2]-manifest['checks']['boundsM']['min'][2],
                                 'model':model_url+'/stem.glb','image':model_url+'/front.webp',
                                 'sideImage':model_url+'/left.webp','thumb':model_url+'/head-front.webp'}})
    report.append({'productId':pid,'editorId':slug,'name':item['name'],'version':version,'modelUrl':model_url+'/stem.glb',
                   'source':str(source),'photoUrl':photo_url,'checks':manifest['checks'],
                   'visualReview':'Reviewed for local website trial; exact cultivar reconstruction not verified'})
# Existing six IDs and their byte references remain unchanged. Photos become catalog covers.
registry['assets']=photos+registry['assets']+models
registry_path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
target=ROOT/'artifacts/flower-pipeline/pilot-10-20261014/website-manifest.json'
target.write_text(json.dumps({'models':report,'modelCount':len(report),'route':'local-blender','tripoCalled':False},ensure_ascii=False,indent=2),encoding='utf-8')
print('Installed',len(models),'new models and',len(photos),'reference photographs; preserved existing IDs.')
print('Model sizes MB',round(sum(x['checks']['bytes'] for x in report)/1_000_000,2))
