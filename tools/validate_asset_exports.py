import bpy
import json
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
checks=[]
for path in sorted((ROOT/'public/assets').glob('*/*.glb')):
    data=path.read_bytes()
    magic,version,length=struct.unpack('<4sII',data[:12])
    chunk_length,chunk_type=struct.unpack('<II',data[12:20])
    document=json.loads(data[20:20+chunk_length])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    missing=[im.name for im in bpy.data.images if im.source=='FILE' and not im.packed_file and not Path(bpy.path.abspath(im.filepath)).exists()]
    report={'file':str(path.relative_to(ROOT)),'bytes':len(data),'header_valid':magic==b'glTF' and version==2 and length==len(data),'mesh_objects':len(meshes),'faces_after_import':sum(len(obj.data.polygons) for obj in meshes),'materials':len(document.get('materials',[])),'missing_images':missing}
    report['passed']=report['header_valid'] and bool(meshes) and not missing
    checks.append(report)
    print('EXPORT_CHECK',path.stem,report['passed'],flush=True)
out=ROOT/'artifacts/asset-library/validation.json'
out.write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
assert all(check['passed'] for check in checks)
print('ALL_EXPORTS_VALID',len(checks),flush=True)
