import bpy
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/sample-pack';SRC=ROOT/'asset-sources/sample-pack'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
for item in manifest['assets']:
    if item['kind']!='flower':continue
    bpy.ops.wm.open_mainfile(filepath=str(SRC/(item['id']+'.blend')))
    sizes=[]
    for image in bpy.data.images:
        if image.type=='RENDER_RESULT' or image.source not in ('FILE','GENERATED'):continue
        w,h=image.size
        if not w or not h:continue
        _=image.pixels[0]
        if max(w,h)>1024:
            ratio=1024/max(w,h);image.scale(max(1,round(w*ratio)),max(1,round(h*ratio)))
            image.pack()
        sizes.append({'name':image.name,'size':list(image.size)})
    objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    model=OUT/item['model']
    item['before_compact_bytes']=model.stat().st_size
    bpy.ops.export_scene.gltf(filepath=str(model),export_format='GLB',use_selection=True,export_apply=True,export_image_format='AUTO',export_jpeg_quality=85)
    item['model_bytes']=model.stat().st_size;item['texture_dimensions']=sizes
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(item['id']+'.blend')))
    print('COMPACT',item['id'],item['before_compact_bytes'],item['model_bytes'],sizes,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
