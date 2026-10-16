"""Repack the sample GLBs with ordinary 8-bit PNGs instead of float texture exports."""
import io
import json
import struct
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/sample-pack'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
for item in manifest['assets']:
    path=OUT/item['model'];data=path.read_bytes()
    json_length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+json_length]);bin_start=20+json_length+8;binary=data[bin_start:]
    image_views={image['bufferView']:image for image in doc.get('images',[])}
    rebuilt=bytearray();image_report=[]
    for idx,view in enumerate(doc.get('bufferViews',[])):
        start=view.get('byteOffset',0);chunk=binary[start:start+view['byteLength']]
        image=image_views.get(idx)
        if image and image.get('mimeType')=='image/png':
            old=len(chunk);im=Image.open(io.BytesIO(chunk));im.load()
            im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
            target=io.BytesIO();im.save(target,format='PNG',optimize=True,compress_level=9);chunk=target.getvalue()
            image_report.append({'size':list(im.size),'before_bytes':old,'after_bytes':len(chunk),'bit_depth':8})
        rebuilt.extend(b'\0'*((-len(rebuilt))%4))
        view['byteOffset']=len(rebuilt);view['byteLength']=len(chunk);view['buffer']=0;rebuilt.extend(chunk)
    doc['buffers'][0]['byteLength']=len(rebuilt)
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf-8');js+=b' '*((-len(js))%4)
    rebuilt.extend(b'\0'*((-len(rebuilt))%4))
    packed=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(rebuilt))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(rebuilt),b'BIN\0')+rebuilt
    path.write_bytes(packed)
    item['model_bytes']=len(packed);item['texture_repack']=image_report
    print('GLB_REPACK',item['id'],len(data),len(packed),flush=True)
    for preview in item.get('previews',{}).values():
        png=OUT/preview
        Image.open(png).save(png.with_suffix('.webp'),format='WEBP',quality=90,method=6)
    item['web_previews']={view:Path(name).with_suffix('.webp').name for view,name in item.get('previews',{}).items()}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
