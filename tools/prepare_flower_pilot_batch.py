"""Version specs for the explicitly requested ten-model website pilot."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'asset-sources/flower-pipeline/pilot-10-20261014';OUT.mkdir(parents=True,exist_ok=True)
selected=json.loads((ROOT/'artifacts/catalog-photo-fill/selections-draft.json').read_text(encoding='utf-8'))['selections']
jobs=[
 ('P072','gerbera-atlanta','非洲菊 Atlanta','橙色','主花','gerbera',.65,.12,[.93,.17,.012]),
 ('P073','gerbera-annecy','非洲菊 Annecy','白色','配花','gerbera',.50,.07,[.88,.86,.78]),
 ('P052','white-rose-proud','白玫瑰 Proud','白色','主花','rose',.60,.075,[.89,.87,.79]),
 ('P065','carnation-green-shot','康乃馨 Green Shot','浅绿','主花','carnation',.57,.07,[.53,.63,.20]),
 ('P059','oriental-lily-colet','东方百合 Colet','粉色','主花','lily',.65,.13,[.63,.25,.40]),
 ('P020','lily-of-valley','铃兰','白色','配花','lily-of-valley',.25,.06,[.91,.91,.84]),
 ('P082','gypsophila-xlence','满天星 Xlence','白色','配花','gypsophila',.62,.011,[.89,.89,.82]),
 ('P067','silver-eucalyptus','银叶桉','灰绿','叶材','eucalyptus',.65,.12,[.75,.75,.68]),
 ('P098','craspedia-yellow','黄金球','黄色','配花','craspedia',.62,.028,[.75,.44,.008]),
 ('P057','lisianthus-piccolo','洋桔梗 Piccolo','白色','配花','lisianthus',.62,.06,[.90,.88,.81]),
]
batch=[];inventory=[]
for pid,slug,name,color,role,archetype,height,diameter,petal in jobs:
    folder=OUT/pid;folder.mkdir(exist_ok=True);record=selected[pid]
    spec={'schemaVersion':1,'productId':pid,'editorId':slug,'name':name,'color':color,'role':role,
          'route':'local-blender','archetype':archetype,'seed':20261014+int(pid[1:]),
          'stemLengthM':height,'headDiameterM':diameter,'petalColor':petal,
          'headNormal':[0,-.76,.65],'logicalStems':1,'physicalDimensionsVerified':False,
          'dimensionBasis':'Breeder/species reference and pilot modeling conventions; not measured SKU dimensions',
          'unverifiedParts':['exact cultivar backside','specimen stem curvature','exact leaf/branch and petal counts'],
          'references':[{'origin':'real-photo','path':str(ROOT/record['localPath']),'sourcePage':record['sourcePage'],
                         'author':record.get('author'),'license':record.get('license'),
                         'mappingScope':record.get('mappingStatus',record.get('mappingScope'))}],
          'renderResolution':[400,600],'detailResolution':480,'visualStatus':'pilot-awaits-review'}
    if pid=='P072':
        spec['petalTexture']=str(ROOT/'asset-sources/flower-pipeline/P072/v1/references/ai-ray-floret-v1.png')
        spec['references'].append({'origin':'ai-image','path':spec['petalTexture'],'use':'RGB petal texture, not botanical evidence'})
    if pid=='P073':
        spec['innerColor']=[.84,.81,.65];spec['diskColors']=[[.55,.31,.022],[.69,.40,.035],[.76,.49,.043]]
    if pid=='P067':spec['leafColor']=[.29,.40,.34];spec['stemColor']=[.24,.25,.13]
    if pid=='P082':spec['flowerDiameterM']=diameter
    (folder/'spec-v1.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf-8')
    out=ROOT/'artifacts/flower-pipeline/pilot-10-20261014'/pid/'v1'
    batch.append({'spec':str(folder/'spec-v1.json'),'out':str(out),'samples':8})
    inventory.append({'productId':pid,'editorId':slug,'name':name,'role':role,'color':color,'archetype':archetype,'out':str(out),'spec':str(folder/'spec-v1.json'),'photo':record})
(OUT/'batch-v1.json').write_text(json.dumps({'jobs':batch},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared',len(batch),'models:',[(x['productId'],x['archetype']) for x in inventory])
