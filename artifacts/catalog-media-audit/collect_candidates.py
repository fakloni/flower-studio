"""Save observed product images as private review candidates, not published assets."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import requests
from PIL import Image

ROOT = Path(__file__).parent
pages = json.loads((ROOT / 'source-page-inspection.json').read_text(encoding='utf-8'))
selected = []
for page in pages:
    ids = page['productIds']
    for image in page.get('images', []):
        url = image.get('src', '')
        keep = (
            (ids == ['P014'] and '/uploads/galleries/' in url)
            or (ids == ['P065'] and ('/763/20ce' in url or '/751/0a90' in url))
            or (ids == ['P072'] and '/967/0a90' in url)
            or (ids == ['P073'] and '/2962/0a90' in url)
        )
        if keep:
            selected.append({'productIds': ids, 'sourcePage': page['sourcePage'], 'imageUrl': url,
                'sourceAlt': image.get('alt'), 'sourceOrganization': 'Ball SB' if ids == ['P014'] else 'HilverdaFlorist',
                'retrievedDate': '2026-10-14', 'publicationStatus': 'private-candidate',
                'authorizationStatus': 'not-assessed', 'sameSpecimenMultiView': False,
                'reviewStatus': 'awaiting-visual-review'})

def download(item):
    try:
        response = requests.get(item['imageUrl'], timeout=30)
        response.raise_for_status()
        data = response.content
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
        dest = ROOT / 'candidates' / item['productIds'][0] / Path(item['imageUrl']).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.read_bytes() != data:
            raise ValueError('Existing candidate differs; refusing overwrite')
        if not dest.exists():
            dest.write_bytes(data)
        item.update(localPath=dest.relative_to(ROOT).as_posix(), width=image.width, height=image.height,
            bytes=len(data), sha256=sha256(data).hexdigest())
    except Exception as error:
        item['error'] = str(error)
    return item

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=7) as pool:
        results = list(pool.map(download, selected))
    (ROOT / 'candidates.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    for result in results:
        print(json.dumps({k: v for k, v in result.items() if k in ('productIds','localPath','width','height','error')}, ensure_ascii=False))
