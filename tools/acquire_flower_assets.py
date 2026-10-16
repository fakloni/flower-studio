"""Acquire publicly available flower assets for local visual evaluation."""
import concurrent.futures as futures
import json
import re
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'asset-sources' / 'flowers'
BASE.mkdir(parents=True, exist_ok=True)
SCENE = str(uuid.uuid4())
TERMS = ['rose', 'carnation', 'tulip', 'peony', 'hydrangea', 'lily', 'dahlia', 'gerbera', 'orchid', 'eucalyptus', 'gypsophila', 'ranunculus', 'anemone', 'chrysanthemum', 'sunflower', 'iris']

def get_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'FlowerStudio-asset-evaluation/0.1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def search(term):
    query = urllib.parse.urlencode({'query': f'{term} asset_type:model is_free:true', 'page_size': 20})
    data = get_json('https://www.blenderkit.com/api/v1/search/?' + query)
    records = []
    for item in data.get('results', []):
        p = item.get('dictParameters', {})
        if not item.get('isFree'):
            continue
        records.append({
            'term': term, 'id': item['id'], 'base_id': item['assetBaseId'],
            'name': item['displayName'], 'description': item.get('description', ''),
            'author': item.get('author', {}).get('fullName'),
            'source_url': f"https://www.blendkit.com/asset-gallery-detail/{item['assetBaseId']}/",
            'thumbnail': item.get('thumbnailMiddleUrl'), 'files': item.get('files', []),
            'quality': item.get('ratingsAverage', {}).get('quality'), 'parameters': p,
        })
    return term, records

def save_url(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'FlowerStudio-asset-evaluation/0.1'})
    with urllib.request.urlopen(request, timeout=120) as response, path.open('wb') as target:
        while chunk := response.read(1024 * 1024):
            target.write(chunk)

def scout():
    records = []
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        for term, found in pool.map(search, TERMS):
            records.extend(found)
            print(term, len(found), flush=True)
    (BASE / 'candidates.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    # Candidate thumbnails are downloaded for this requested local asset collection.
    def thumbnail(record):
        if record['thumbnail']:
            try:
                save_url(record['thumbnail'], BASE / 'candidate-previews' / (record['base_id'] + '.jpg'))
            except Exception as error:
                print('THUMBNAIL_FAILED', record['name'], str(error), flush=True)
    with futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(thumbnail, records))
    print('CANDIDATES', len(records), flush=True)

def acquire(selected):
    records = json.loads((BASE / 'candidates.json').read_text(encoding='utf-8'))
    unique = {record['base_id']: record for record in records}
    def download(base_id):
        record = unique[base_id]
        slug = re.sub(r'[^a-z0-9]+', '-', record['name'].lower()).strip('-')[:65]
        folder = BASE / (slug + '-' + base_id[:8])
        folder.mkdir(parents=True, exist_ok=True)
        downloaded = []
        wanted = [file for file in record['files'] if file['fileType'] in ('blend', 'gltf')]
        for file in wanted:
            extension = '.blend' if file['fileType'] == 'blend' else '.glb'
            path = folder / ('original' + extension)
            if not path.exists():
                try:
                    location = get_json(file['downloadUrl'] + '?scene_uuid=' + SCENE)
                    save_url(location['filePath'], path)
                    if path.read_bytes()[:4] not in (b'BLEN', b'glTF', b'\x28\xb5\x2f\xfd') and path.read_bytes()[:2] != b'\x1f\x8b':
                        raise ValueError('Unexpected file header')
                except Exception as error:
                    print('DOWNLOAD_FAILED', record['name'], file['fileType'], str(error), flush=True)
                    continue
            downloaded.append({'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'type': file['fileType']})
        preview = BASE / 'candidate-previews' / (base_id + '.jpg')
        if preview.exists():
            (folder / 'source-preview.jpg').write_bytes(preview.read_bytes())
        compact = {key: value for key, value in record.items() if key not in ('files', 'thumbnail')}
        compact['downloaded'] = downloaded
        compact['acquired_date'] = '2026-10-12'
        compact['status'] = 'downloaded_pending_blender_review' if downloaded else 'download_failed'
        (folder / 'metadata.json').write_text(json.dumps(compact, ensure_ascii=False, indent=2), encoding='utf-8')
        print('ACQUIRED', record['name'], [(entry['type'], round(entry['bytes'] / 1048576, 1)) for entry in downloaded], flush=True)
        return compact
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        downloaded = list(pool.map(download, selected))
    (BASE / 'collection.json').write_text(json.dumps(downloaded, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'download':
        acquire(json.loads((BASE / 'selection.json').read_text(encoding='utf-8')))
    else:
        scout()
