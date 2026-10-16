"""Collect attributed source photographs without changing the live catalog."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import json
import re
import time
import requests
from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/catalog-photo-fill'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'pages').mkdir(exist_ok=True)

NC = {
 'P006':'helianthus-annuus', 'P007':'hydrangea-macrophylla',
 'P008':'dypsis-lutescens', 'P011':'gardenia-jasminoides', 'P013':'gomphrena-globosa',
 'P017':'anemone-coronaria', 'P019':'chimonanthus-praecox', 'P020':'convallaria-majalis',
 'P021':'paeonia-herbaceous-types', 'P022':'paeonia-suffruticosa', 'P023':'campanula-medium',
 'P024':'jasminum-sambac', 'P025':'papaver-rhoeas', 'P026':'astilbe', 'P027':'nymphaea',
 'P028':'pieris-japonica', 'P029':'nelumbo-nucifera', 'P031':'strelitzia-reginae',
 'P033':'nandina-domestica', 'P037':'solanum-mammosum', 'P040':'renanthera-coccinea',
 'P041':'hypericum-inodorum', 'P042':'salix-matsudana-tortuosa', 'P043':'smilax-china',
 'P044':'pyracantha-fortuneana', 'P045':'ranunculus-asiaticus', 'P046':'matthiola-incana',
 'P047':'antirrhinum-majus', 'P048':'freesia-refracta', 'P049':'gladiolus',
 'P050':'limonium-sinuatum', 'P051':'monstera-deliciosa', 'P067':'eucalyptus-cinerea',
 'P068':'eucalyptus-pulverulenta-baby-blue', 'P080':'zantedeschia-aethiopica',
 'P088':'echinacea-purpurea', 'P089':'phytolacca-americana', 'P090':'phragmites-australis',
 'P092':'abies-procera', 'P093':'melaleuca-bracteata', 'P094':'anigozanthos',
 'P095':'celastrus-orbiculatus', 'P096':'spiraea-cantoniensis', 'P097':'hyacinthus-orientalis',
 'P098':'craspedia-globosa', 'P100':'malus', 'P102':'crataegus-pinnatifida',
 'P103':'lepidium-virginicum', 'P104':'solanum-integrifolium',
}

def get(url):
    r=requests.get(url, timeout=(8,18)); r.raise_for_status(); return r

def page(url, key):
    path=OUT/'pages'/f'{key}.html'
    if path.exists():
        cached=path.read_text(encoding='utf-8')
        expirations=[int(x) for x in re.findall(r'Expires=(\d+)',cached)]
        if not expirations or min(expirations)>time.time()+90:
            return BeautifulSoup(cached,'html.parser')
    r=get(url); path.write_text(r.text,encoding='utf-8')
    return BeautifulSoup(r.text,'html.parser')

def image_record(url, key, values):
    folder=OUT/'originals'/key; folder.mkdir(parents=True,exist_ok=True)
    filename=Path(urlsplit(url).path).name
    target=folder/filename
    data=target.read_bytes() if target.exists() else get(url).content
    im=Image.open(BytesIO(data)); im.verify(); im=Image.open(BytesIO(data))
    if min(im.size)<150: raise ValueError('Image too small')
    if not target.exists(): target.write_bytes(data)
    return {**values,'imageUrl':url, 'localPath':target.relative_to(ROOT).as_posix(),
            'width':im.width,'height':im.height,'sha256':sha256(data).hexdigest(),
            'mediaOrigin':'real-photo-candidate','reviewStatus':'pending-visual-review',
            'retrievedDate':'2026-10-14','sameSpecimenMultiView':False}

def nc_job(item):
    pid,slug=item; url=f'https://plants.ces.ncsu.edu/plants/{slug}/'
    s=page(url,'nc-'+slug)
    imgs=s.select('figure img.modal_img')
    candidates=[]
    for img in imgs:
        license_soup=BeautifulSoup(img.get('data-license',''),'html.parser')
        license_text=license_soup.get_text(' ',strip=True)
        if ('CC' not in license_text and 'Public Domain' not in license_text) or 'NC' in license_text or 'ND' in license_text: continue
        caption=' '.join([img.get('data-alt',''),img.get('data-caption','')])
        score=10*bool(re.search(r'flower|bloom',caption,re.I))+4*bool(re.search(r'close|fruit|leaf|leaves',caption,re.I))-8*bool(re.search(r'mass|habit|bark|seedling',caption,re.I))
        if pid in {'P008','P011','P067','P068','P093'}: score=12*bool(re.search(r'leaf|leaves|foliage',caption,re.I))
        if pid in {'P029','P033','P037','P041','P043','P044','P089','P095','P100','P102','P104'}: score=12*bool(re.search(r'fruit|berr|pod',caption,re.I))
        candidates.append((score,img,license_text,license_soup.find('a')))
    records=[]
    for score,img,lic,a in sorted(candidates,key=lambda x:x[0],reverse=True)[:2]:
        try:
            records.append(image_record(img['src'],pid,{'productIds':[pid], 'sourcePage':url,'sourceOrganization':'NC State Extension Plant Toolbox','author':img.get('data-attrib') or 'Author unspecified', 'license':lic,'licenseUrl':a.get('href') if a else None,'caption':img.get('data-caption'),'alt':img.get('data-alt'), 'mappingStatus':'species-or-category-reference','selectionScore':score}))
        except Exception as e: print('IMAGE_ERROR',pid,str(e)[:140],flush=True)
    return {'key':pid,'records':records,'availablePhotoCount':len(imgs),'title':s.title.get_text(strip=True) if s.title else ''}

def j_job(code):
    url=f'https://jikebana.com/materials/{code}/'; s=page(url,'j-'+code)
    records=[]
    terms='茉莉 牡丹 络新妇 落新妇 马醉木 柔丽丝 五代果 火焰兰 红豆 龙柳 火棘 香雪兰 千代兰 松虫草 跳舞兰 姜荷花 蓝星 诺贝松 千层金 袋鼠爪 黄金球 六出花 小手球 冬青 绿铃 南瓜 乒乓 菊 洋桔梗 百合 大丽花 郁金香 补血草 九星 贯众 喷泉 天鹅绒 小柿子 南蛇藤 山归来'.split()
    for td in s.select('article figure'):
        img=td.find('img')
        label=td.get_text(' ',strip=True)
        if not img or not label or not img.get('src','').startswith('https://') or not any(t in label for t in terms): continue
        # Each table cell explicitly associates a photograph with a market label.
        try: records.append(image_record(img.get('data-orig-file',img['src']),'j-'+code,{'productIds':[], 'sourcePage':url,'sourceOrganization':'J IKEBANA flower-material index','author':'Unspecified original photographer','license':'Unspecified; source explicitly says images are from the internet. Local reference only.','caption':label,'mappingStatus':'market-label-reference-only'}))
        except Exception as e: print('IMAGE_ERROR',code,label[:25],str(e)[:90],flush=True)
    return {'key':'j-'+code,'records':records}

if __name__=='__main__':
    # Primary institution sources first. A secondary floral index is collected for name comparison,
    # never classified as an institution or as a licensed publication source.
    jobs=[('nc',item) for item in NC.items()]+[('j',code) for code in ['fac','fdg','fhn','foq','frz','lag','lhn','loz']]
    results=[]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures={pool.submit(nc_job,value) if kind=='nc' else pool.submit(j_job,value):(kind,value) for kind,value in jobs}
        for f in as_completed(futures):
            kind,value=futures[f]
            try: result=f.result(); results.append(result); print('COLLECTED',result['key'],len(result['records']),flush=True)
            except Exception as e: results.append({'key':str(value),'error':str(e)}); print('PAGE_ERROR',value,str(e)[:130],flush=True)
            (OUT/'collected.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
