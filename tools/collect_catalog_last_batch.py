"""Last source collection pass; preserves explicit unknown mappings."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from pathlib import Path
import json
from collect_catalog_photos import OUT, get, page, image_record
from collect_catalog_supplement import commercial

NC={'P032':'diospyros-kaki','P069':'eucalyptus-cinerea','P074':'tulipa','P077':'dahlia',
    'P078':'dahlia','P079':'dahlia','P081':'zantedeschia','P102':'crataegus-pinnatifida',
    'P007':'hydrangea-macrophylla','P011':'gardenia-jasminoides','P022':'paeonia-woody-types',
    'P033':'nandina-domestica','P038':'ilex-verticillata','P042':'salix-matsudana',
    'P080':'zantedeschia-aethiopica','P088':'echinacea-purpurea','P090':'phragmites-australis',
    'P095':'celastrus-orbiculatus','P096':'spiraea-cantoniensis'}
def gallery(item):
    pid,slug=item;url=f'https://plants.ces.ncsu.edu/plants/{slug}/';s=page(url,'nc-'+slug);rs=[]
    for img in s.select('figure img.modal_img'):
        from bs4 import BeautifulSoup
        lic=BeautifulSoup(img.get('data-license',''),'html.parser');lt=lic.get_text(' ',strip=True)
        if not lt or ('CC' not in lt and 'Public Domain' not in lt):continue
        # Non-commercial images may be local references, never classified as publication-approved.
        link=lic.find('a')
        try:rs.append(image_record(img['src'],pid,{'productIds':[pid],'sourcePage':url,'sourceOrganization':'NC State Extension Plant Toolbox','author':img.get('data-attrib'),'license':lt,'licenseUrl':link.get('href') if link else None,'caption':img.get('data-caption'),'alt':img.get('data-alt'),'mappingStatus':'species-or-category-reference'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:75],flush=True)
    return rs
def j_extra():
    index=json.loads((OUT/'j-index.json').read_text(encoding='utf-8'));rs=[]
    choices={'P012':'anthurium.jpg','P039':'pincushion.jpg','P041':'hypericum.jpg','P069':'eucalyptus.jpg','P074':'tulips.jpg'}
    for pid,name in choices.items():
        record=next(x for x in index if Path(x['imageUrl']).name==name)
        try:rs.append(image_record(record['imageUrl'],pid,{'productIds':[pid],**record,'sourceOrganization':'J IKEBANA flower-material index','author':'Unspecified original photographer','license':'Unspecified; network-sourced index image. Local reference only.','mappingStatus':'market-label-reference-only'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:90],flush=True)
    return rs
def generic(pid,url,org):
    s=page(url,'last-'+pid);rs=[]
    imgs=s.select('img')
    for img in imgs:
        src=img.get('data-src') or img.get('src','');alt=img.get('alt','');full=str(img).lower()
        if not src or any(w in full for w in ['logo','icon','qr','banner','loading','avatar']):continue
        if not any(w in full for w in ['flower','mammos','renanther','bracteat','菲韵','金辉','uploadedfiles','flora']):continue
        try:rs.append(image_record(urljoin(url,src),pid,{'productIds':[pid],'sourcePage':url,'sourceOrganization':org,'author':org+' / photographer pending verification','license':'Use conditions not verified; local reference only','caption':alt,'mappingStatus':'source-labelled-reference-needs-review'}))
        except Exception as e:print('PHOTO_ERROR',pid,str(e)[:90],flush=True)
        if len(rs)>=4:break
    return rs
if __name__=='__main__':
    records=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        fs={pool.submit(gallery,x):x[0] for x in NC.items()};fs[pool.submit(j_extra)]='j-extra'
        for item in [('P037','https://www.nparks.gov.sg/florafaunaweb/flora/2/4/2458','NParks FloraFaunaWeb'),
                     ('P054','https://www.yuejikeng.com/guanmu/5909.html','月季坑 / caption photographer 小小小叶呀'),
                     ('P055','https://m.yunnan.cn/system/2024/08/09/033179840.shtml','云南网 / 金辉供图')]:
            fs[pool.submit(generic,*item)]=item[0]
        for f in as_completed(fs):
            try:rs=f.result();records.extend(rs);print('LAST',fs[f],len(rs),flush=True)
            except Exception as e:print('ERROR',fs[f],str(e)[:90],flush=True)
            (OUT/'last-batch.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
