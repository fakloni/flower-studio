import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'asset-sources'/'flowers'
reviews=[]
for folder in sorted(BASE.iterdir()):
    if not folder.is_dir() or not (folder/'metadata.json').exists(): continue
    meta=json.loads((folder/'metadata.json').read_text(encoding='utf-8'))
    path=folder/'original.blend'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print('INSPECT',meta['name'],flush=True)
    try:
        if path.exists():
            with bpy.data.libraries.load(str(path),link=False) as (source,target):
                target.objects=source.objects
            for obj in target.objects:
                if obj is not None and obj.name not in bpy.context.collection.objects:
                    bpy.context.collection.objects.link(obj)
        elif (folder/'original.glb').exists():
            bpy.ops.import_scene.gltf(filepath=str(folder/'original.glb'))
        else: raise ValueError('No model file')
        bpy.context.view_layer.update()
        meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
        coords=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
        bbox={}
        if coords:
            mins=[min(point[axis] for point in coords) for axis in range(3)]
            maxs=[max(point[axis] for point in coords) for axis in range(3)]
            bbox={'min':mins,'max':maxs,'extent':[maxs[i]-mins[i] for i in range(3)]}
        missing=[]
        for image in bpy.data.images:
            if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists(): missing.append(image.name)
        report={'name':meta['name'],'folder':str(folder.relative_to(ROOT)),'import_ok':True,'mesh_objects':len(meshes),'raw_faces':sum(len(obj.data.polygons) for obj in meshes),'images':len(bpy.data.images),'missing_images':missing,'bbox_source_units':bbox,'objects':[{'name':obj.name,'type':obj.type,'faces':len(obj.data.polygons) if obj.type=='MESH' else 0,'modifiers':[mod.type for mod in obj.modifiers]} for obj in bpy.context.scene.objects], 'status':'imported_pending_stem_extraction_and_visual_review'}
        print('IMPORT_OK',meta['name'],len(meshes),report['raw_faces'],'missing_images',len(missing),flush=True)
    except Exception as error:
        report={'name':meta['name'],'folder':str(folder.relative_to(ROOT)),'import_ok':False,'error':str(error)}
        print('IMPORT_FAILED',meta['name'],str(error),flush=True)
    (folder/'inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    reviews.append(report)
(BASE/'inspection-summary.json').write_text(json.dumps(reviews,ensure_ascii=False,indent=2),encoding='utf-8')
print('FLOWER_INSPECTION_DONE',len(reviews),flush=True)
