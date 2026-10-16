"""Find licensed photographic candidates; taxonomy and morphology require visual review."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import json
import requests
from bs4 import BeautifulSoup
from collect_catalog_photos import OUT, image_record

QUERIES = {
 'P001':'chrysanthemum pompon', 'P002':'chrysanthemum spray flowers',
 'P003':'chrysanthemum disbud flower', 'P004':'chrysanthemum spray flowers',
 'P005':'chrysanthemum santini', 'P009':'Heptapleurum arboricola leaves',
 'P010':'Cyrtomium falcatum frond', 'P012':'anthurium cut flower',
 'P015':'Matricaria chamomilla flowers', 'P016':'Panicum capillare inflorescence',
 'P022':'Paeonia suffruticosa flower', 'P024':'Jasminum sambac flower',
 'P030':'Amaranthus caudatus inflorescence', 'P032':'Diospyros kaki fruits branch',
 'P034':'Ornithogalum thyrsoides flower', 'P035':'Hydrangea macrophylla autumn flowers',
 'P036':'Cucurbita pepo fruit', 'P037':'Solanum mammosum fruit',
 'P038':'Ilex verticillata fruit', 'P039':'Leucospermum cordifolium flower',
 'P040':'Renanthera coccinea flowers', 'P041':'Hypericum inodorum berries',
 'P042':'Salix matsudana tortuosa branches', 'P044':'Pyracantha fortuneana fruit',
 'P048':'Freesia flowers', 'P053':'spray rose flowers',
 'P056':'Eustoma single flowers', 'P057':'Eustoma double flowers',
 'P058':'Eustoma Mariachi', 'P059':'Lilium oriental hybrid flower',
 'P060':'Lilium asiatic hybrid flower', 'P061':'Lilium oriental trumpet hybrid',
 'P062':'Lilium LA hybrid flowers', 'P063':'Lilium longiflorum flower',
 'P064':'Lilium double flowers', 'P068':'Eucalyptus pulverulenta Baby Blue',
 'P074':'Tulipa single flower', 'P075':'Tulipa double flower',
 'P076':'Tulipa parrot flower', 'P077':'Dahlia ball flower',
 'P078':'Dahlia decorative flower', 'P079':'Dahlia cactus flower',
 'P081':'Zantedeschia pink flower', 'P084':'Vanda orchid flower',
 'P085':'Scabiosa atropurpurea flower', 'P086':'Oncidium flowers',
 'P087':'Curcuma alismatifolia flowers', 'P091':'Oxypetalum coeruleum flowers',
 'P093':'Melaleuca bracteata golden leaves', 'P094':'Anigozanthos flavidus flowers',
 'P098':'Craspedia globosa', 'P099':'Dendrobium phalaenopsis flower',
 'P102':'Crataegus pinnatifida fruits', 'P103':'Lepidium virginicum fruits',
 'P104':'Solanum aethiopicum pumpkin on a stick',
}

def collect(item):
    pid,query=item
    cache=OUT/'pages'/f'commons-{pid}.json'
    if cache.exists(): data=json.loads(cache.read_text(encoding='utf-8'))
    else:
        r=requests.get('https://commons.wikimedia.org/w/api.php',params={
            'action':'query','format':'json','generator':'search','gsrsearch':query+' filetype:bitmap',
            'gsrnamespace':6,'gsrlimit':3,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime'},
            headers={'User-Agent':'FlowerStudioReferenceAudit/1.0 (local flower reference library)'},timeout=(8,18))
        r.raise_for_status();data=r.json();cache.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    result=[]
    for p in sorted(data.get('query',{}).get('pages',{}).values(),key=lambda x:x.get('index',99)):
        ii=p.get('imageinfo',[{}])[0];meta=ii.get('extmetadata',{})
        def text(key):return BeautifulSoup(meta.get(key,{}).get('value',''),'html.parser').get_text(' ',strip=True)
        if ii.get('mime') not in {'image/jpeg','image/png'} or ii.get('size',0)>15_000_000:continue
        caption=text('ImageDescription'); license=text('LicenseShortName')
        if not license or any(word in caption.lower() for word in ['illustration','painting','drawing','watercolour']):continue
        try:result.append(image_record(ii['url'],pid,{'productIds':[pid], 'sourcePage':ii['descriptionurl'],'sourceOrganization':'Wikimedia Commons (photographer-contributed)','author':text('Artist') or text('Credit'),'license':license,'licenseUrl':text('LicenseUrl'),'caption':caption,'alt':p['title'],'searchQuery':query,'mappingStatus':'search-candidate-needs-identity-review'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:120],flush=True)
        if len(result)>=2:break
    return {'key':pid,'records':result,'query':query}

if __name__=='__main__':
    results=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(collect,x):x[0] for x in QUERIES.items()}
        for future in as_completed(futures):
            pid=futures[future]
            try: result=future.result();results.append(result);print('COMMONS',pid,len(result['records']),flush=True)
            except Exception as e:results.append({'key':pid,'error':str(e)});print('COMMONS_ERROR',pid,str(e)[:140],flush=True)
            (OUT/'commons-collected.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
