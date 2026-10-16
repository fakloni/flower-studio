"""Inspect candidate source pages without changing the published catalog."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import json
import requests

ROOT = Path(__file__).parent
SOURCES = [
    ('P014', 'https://www.ballsb.com/en/variety/208-dianthus-green-ball-en'),
    ('P056', 'https://sakataornamentals.eu/product/piccolo/'),
    ('P057,P058', 'https://lisianthus.eu/product/mariachi/'),
    ('P065', 'https://www.hilverdaflorist.com/en/assortment/cut-flowers/assortment-cut-flowers/carnation-standard-greenshot'),
    ('P072', 'https://www.hilverdaflorist.com/en/assortment/cut-flowers/assortment-cut-flowers/gerbera-standard-atlanta'),
    ('P073', 'https://www.hilverdaflorist.com/en/assortment/cut-flowers/assortment-cut-flowers/gerbera-mini-annecy'),
]

class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'img':
            self.images.append({k: v for k, v in a.items() if k in ('src','data-src','alt','srcset')})
        elif tag == 'meta' and a.get('property') == 'og:image':
            self.images.append({'src': a.get('content'), 'alt': 'og:image'})

def inspect(item):
    ids, url = item
    try:
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        parser = Images()
        parser.feed(response.text)
        for image in parser.images:
            for key in ('src', 'data-src'):
                if image.get(key):
                    image[key] = urljoin(response.url, image[key])
        return {'productIds': ids.split(','), 'sourcePage': url, 'resolvedPage': response.url, 'images': parser.images}
    except Exception as error:
        return {'productIds': ids.split(','), 'sourcePage': url, 'error': str(error)}

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(inspect, SOURCES))
    (ROOT / 'source-page-inspection.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    for result in results:
        print(json.dumps(result, ensure_ascii=False))
