"""Supplement institution references and traceable commercial product photographs."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin
import json
from collect_catalog_photos import OUT, nc_job, page, image_record

NC = {
 'P022':'paeonia-woody-types', 'P034':'ornithogalum-thyrsoides',
 'P036':'cucurbita-pepo', 'P038':'ilex-verticillata', 'P041':'hypericum-x-inodorum',
 'P042':'salix-matsudana', 'P056':'eustoma-grandiflorum',
 'P059':'lilium-oriental-hybrids', 'P060':'lilium-asiatic-hybrids',
 'P063':'lilium-longiflorum', 'P068':'eucalyptus-pulverulenta',
 'P075':'tulipa', 'P077':'dahlia', 'P081':'zantedeschia',
 'P084':'vanda', 'P085':'scabiosa-atropurpurea', 'P086':'oncidium',
 'P087':'curcuma-alismatifolia', 'P091':'oxypetalum-coeruleum',
 'P094':'anigozanthos-flavidus', 'P099':'dendrobium',
 'P103':'lepidium', 'P104':'solanum-aethiopicum',
}
PRODUCTS = [
 ('P075','https://www.vanengelen.com/tulip-double-surprise.html','Van Engelen','main product photo'),
 ('P076','https://www.brecks.com/products/apricot-parrot-tulip',"Breck's",'Apricot Parrot Tulip'),
 ('P057','https://www.florensis.com/en/products/cut-flowers/cut-flowers/lisianthus-sp/lisianthus-sp-piccolo','Florensis','Lisianthus grandiflorum Piccolo 2 Pure White'),
 ('P009','https://www.huawa.com/flowers_wood/detail/153725/25416.html','花娃','九星叶'),
]
def commercial(item):
    pid,url,org,match=item; s=page(url,'product-'+pid); result=[]; seen=set()
    for img in s.find_all('img'):
        if match.lower() not in img.get('alt','').lower():continue
        src=img.get('data-src') or img.get('src',''); src=urljoin(url,src)
        if src in seen or not src.startswith('https://'):continue
        seen.add(src)
        try:result.append(image_record(src,pid,{'productIds':[pid],'sourcePage':url,'sourceOrganization':org,'author':org+' / photographer not individually stated','license':'Use conditions not verified; local reference only','caption':img.get('alt'), 'mappingStatus':'named-product-category-reference'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:140],flush=True)
        if len(result)>=2:break
    return {'key':pid,'records':result}
if __name__=='__main__':
    results=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        fs={pool.submit(nc_job,x):x[0] for x in NC.items()}
        fs.update({pool.submit(commercial,x):x[0] for x in PRODUCTS})
        for f in as_completed(fs):
            pid=fs[f]
            try:r=f.result();results.append(r);print('SUPPLEMENT',pid,len(r['records']),flush=True)
            except Exception as e:results.append({'key':pid,'error':str(e)});print('ERROR',pid,str(e)[:110],flush=True)
            (OUT/'supplement.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
