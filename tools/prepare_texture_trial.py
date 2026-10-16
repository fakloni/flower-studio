"""Prepare controlled matting input and a layered source for Krita."""
import io
import json
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'asset-sources/texture-trial'
OUT = ROOT / 'public/assets/texture-trial'
SRC.mkdir(parents=True, exist_ok=True)
rose = Image.open(OUT / 'rose-original.png').convert('RGBA')
background = Image.new('RGBA', rose.size, '#ddd6cb')
composite = Image.alpha_composite(background, rose)
composite.save(SRC / 'rose-on-background.png')

tree = Element('image', {'w': str(rose.width), 'h': str(rose.height), 'name': '玫瑰贴图试验'})
stack = SubElement(tree, 'stack')
SubElement(stack, 'layer', {'name': '玫瑰原素材', 'src': 'data/rose.png', 'opacity': '1.0', 'visibility': 'visible', 'composite-op': 'svg:src-over', 'x': '0', 'y': '0'})
SubElement(stack, 'layer', {'name': '抠图测试背景', 'src': 'data/background.png', 'opacity': '1.0', 'visibility': 'visible', 'composite-op': 'svg:src-over', 'x': '0', 'y': '0'})
with zipfile.ZipFile(SRC / 'rose-matting-test.ora', 'w') as archive:
    archive.writestr('mimetype', 'image/openraster', compress_type=zipfile.ZIP_STORED)
    archive.writestr('stack.xml', tostring(tree, encoding='utf-8'))
    for name, image in [('data/rose.png', rose), ('data/background.png', background), ('mergedimage.png', composite)]:
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        archive.writestr(name, buffer.getvalue())

normal = Image.open(OUT / 'rose-blender-normal.png').convert('RGBA')
a = np.asarray(rose)[:, :, 3] > 128
b = np.asarray(normal)[:, :, 3] > 128
iou = np.count_nonzero(a & b) / max(1, np.count_nonzero(a | b))
# The shaded source has material alpha and denoised edges; the geometry-normal
# render has opaque material. Require aligned silhouettes, then use source alpha.
assert iou > .95, f'Normal-map camera mismatch: {iou}'
print(json.dumps({'normal_silhouette_iou': iou, 'size': rose.size, 'layered_source': str(SRC / 'rose-matting-test.ora')}))
