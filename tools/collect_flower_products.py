"""Read public breeder product endpoints discovered in their own pages."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
import json
import re
from collect_catalog_photos import OUT, get, page, image_record

def deliflor():
    data=json.loads((OUT/'pages/deliflor-all.json').read_text(encoding='utf-8'))
    choices={'P001':('Alemani',2), 'P002':('Yin Yang®',3), 'P003':('Magnum®',2), 'P004':('Baltica®',5), 'P005':('Yin Yang®',3)}
    result=[]
    for pid,(breed,use) in choices.items():
        matches=[f for f in data['Flowers'] if f['FlowerBreed']==breed and f['FlowerUseId']==use]
        if not matches:print('NO_BREED',pid,breed,flush=True);continue
        f=matches[0]; api=f"https://deliflor.nl/API/Deliflor.WebApi/FlowerCatalog/GetFlowerById?flowerId={f['Id']}"
        detail=get(api).json()
        source=get(f"https://deliflor.nl/API/Deliflor.WebApi/FlowerCatalog/GetFlowerDetailUrl?flowerId={f['Id']}").json()
        for field in ['FlowerImagePath','FlowerBouquetImagePath']:
            try: result.append(image_record(urljoin('https://deliflor.nl',detail[field]),pid,{'productIds':[pid],'sourcePage':urljoin('https://deliflor.nl',source),'sourceOrganization':'Deliflor','author':'Deliflor / photographer not individually stated','license':'Public photo download offered; reuse conditions not verified. Local reference only.','caption':f"{breed}; {detail['FlowerUseDescription']}; {detail['FlowerTypeDescription']}",'mappingStatus':'category-reference-with-named-variety','cultivar':breed,'sourceProductData':detail,'sourceImageField':field}))
            except Exception as e:print('PHOTO_ERROR',pid,str(e)[:100],flush=True)
    return result

def product(pid,url,term,org):
    s=page(url,'extra-'+pid);result=[]
    for img in s.find_all('img'):
        if term.lower() not in (img.get('alt','')+' '+img.get('src','')).lower():continue
        src=urljoin(url,img.get('data-src') or img.get('src',''))
        try: result.append(image_record(src,pid,{'productIds':[pid],'sourcePage':url,'sourceOrganization':org,'author':org+' / photographer not individually stated','license':'Use conditions not verified; local reference only','caption':img.get('alt',''),'mappingStatus':'named-variety-reference' if pid in {'P058','P068'} else 'market-label-reference-only'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:110],flush=True)
        if len(result)>=2:break
    return result

if __name__=='__main__':
    jobs=[
        ('P068','https://www.brookgreen.org/plant-collection/name/eucalyptus-pulverulenta-baby-blue','pulverulenta','Brookgreen Gardens'),
        ('P058','https://sakataornamentals.com/plantname/mariachi/','Mariachi','Sakata Ornamentals'),
        ('P009','https://www.huawa.com/flowers_wood/detail/153725/25416.html','九星','花娃'),
    ]
    result=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        fs={pool.submit(deliflor):'Deliflor'};fs.update({pool.submit(product,*x):x[0] for x in jobs})
        for f in as_completed(fs):
            try:rs=f.result();result.extend(rs);print('PRODUCT',fs[f],len(rs),flush=True)
            except Exception as e:print('PRODUCT_ERROR',fs[f],str(e)[:110],flush=True)
            (OUT/'commercial.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
