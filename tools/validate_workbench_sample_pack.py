import bpy
import json
import struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/sample-pack';manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
report=[]
for item in manifest['assets']:
    path=OUT/item['model'];data=path.read_bytes();magic,version,length=struct.unpack('<4sII',data[:12]);jl=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jl])
    binary_size=len(data)-(20+jl+8)
    valid_views=all(view.get('byteOffset',0)+view['byteLength']<=binary_size for view in doc.get('bufferViews',[]))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    images=[{'name':image.name,'size':list(image.size)} for image in bpy.data.images]
    bad_images=[im['name'] for im in images if not all(im['size'])]
    # File import verifies repacked buffer/image references and useful geometry.
    faces=sum(len(obj.data.polygons) for obj in objects)
    passed=magic==b'glTF' and version==2 and length==len(data) and valid_views and faces>0 and not bad_images
    previews_exist=all((OUT/preview).exists() for preview in item['previews'].values()) and all((OUT/preview).exists() for preview in item.get('web_previews',{}).values())
    record={'id':item['id'],'bytes':len(data),'faces':faces,'mesh_objects':len(objects),'decoded_images':images,'valid_buffer_ranges':valid_views,'previews_exist':previews_exist,'source_exists':(ROOT/item['editable_source']).exists(),'file_validation_passed':passed,'browser_validation':'not_run','visual_validation':'Blender front and side inspected; close-up object connection and browser appearance pending'}
    record['passed']=passed and previews_exist and record['source_exists'];report.append(record)
    item['coordinate_system']={'source':'Blender Z-up','runtime':'glTF Y-up','conversion':'Blender glTF exporter default axis conversion'}
    if item['kind']=='flower':item['runtime_stem_axis']=[0,1,0];item['runtime_insertion_point']=[0,0,0]
    else:item['runtime_mouth_center']=[0,item['mouth_center'][2],0]
    print('SAMPLE_CHECK',item['id'],record['passed'],len(data),faces,flush=True)
manifest['total_model_bytes']=sum(item['model_bytes'] for item in manifest['assets'])
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'artifacts/workbench-design/sample-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert len(report)==5 and all(record['passed'] for record in report)
print('SAMPLE_PACK_CHECKS_PASSED',len(report),manifest['total_model_bytes'],flush=True)
