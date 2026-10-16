"""Versioned rigid assets for the local contact/material experiment. No source overwrites.

blender --background --python tools/prepare_contact_assets.py
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/insertion-lab/v6'
SOURCE = ROOT / 'asset-sources/insertion-lab/v6'
JOBS = {
    'rose': 'public/assets/catalog/P052/pilot-model-v2/stem.glb',
    'tulip': 'public/assets/workbench/white-tulip.glb',
    'eucalyptus': 'public/assets/catalog/P067/pilot-model-v2/stem.glb',
}
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
records = []
for kind, path in JOBS.items():
    destination = OUT / (kind + '.glb')
    if destination.exists():
        raise RuntimeError('Use a new version, output already exists: ' + str(destination))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / path))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    fixes = []
    if kind == 'tulip':
        stem = next(o for o in meshes if o.name == 'white-tulip-stem')
        stem_points = [stem.matrix_world @ v.co for v in stem.data.vertices]
        for obj in meshes[:]:
            if 'leaf' not in obj.name:
                continue
            points = [obj.matrix_world @ v.co for v in obj.data.vertices]
            low = min(p.z for p in points)
            if low < .17:
                bpy.data.objects.remove(obj, do_unlink=True)
                meshes.remove(obj)
                fixes.append('lower insertion leaf removed')
                continue
            base = [p for p in points if p.z < low + .0005]
            root = sum(base, Vector()) / len(base)
            nearest = sorted(stem_points, key=lambda p: abs(p.z - low))[:24]
            axis = sum(nearest, Vector()) / len(nearest)
            shift = Vector((axis.x - root.x, axis.y - root.y, 0))
            local_shift = obj.matrix_world.inverted().to_3x3() @ shift
            for vertex in obj.data.vertices:
                vertex.co += local_shift
            obj.data.update()
            # The leaf base is deliberately embedded in the stem, never a floating card.
            fixes.append({'leaf': obj.name, 'rootShiftM': list(shift), 'rootInsideStem': True})
    for obj in meshes:
        data = obj.data
        if not data.uv_layers:
            uv = data.uv_layers.new(name='surface-grain')
            # Object-space millimetres; all source geometry is already in metres.
            for loop in data.loops:
                p = data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = (p.x * 17 + p.y * 11, p.z * 5)
        color = data.color_attributes.new(name='tissue-tint', type='FLOAT_COLOR', domain='CORNER')
        for loop in data.loops:
            p = data.vertices[loop.vertex_index].co
            # Small, deterministic organic variation; no photographic texture claim.
            tint = .975 + .022 * math.sin(p.z * 73 + p.x * 211) * math.cos(p.y * 167)
            color.data[loop.index].color = (tint, tint, tint * .992, 1)
        # Force COLOR_0 export explicitly. Leave the source shader's base colour intact:
        # arbitrary Blender multiply nodes are not a portable glTF material network.
        obj['assetVersion'] = 'contact-v6'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_extras=True,
                             export_animations=False, export_apply=True, export_vertex_color='ACTIVE')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (kind + '.blend')))
    # Round-trip checks catch lost geometry / transforms / vertex colour at the asset boundary.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not imported or any(not len(o.data.polygons) or not len(o.data.color_attributes) for o in imported):
        raise RuntimeError('Invalid exported asset: ' + kind)
    petals = [o for o in imported if 'petal' in o.name]
    head = None
    if petals:
        coords = [o.matrix_world @ v.co for o in petals for v in o.data.vertices]
        lo = Vector([min(p[a] for p in coords) for a in range(3)])
        hi = Vector([max(p[a] for p in coords) for a in range(3)])
        center = (lo + hi) / 2
        # Blender Z-up -> glTF Y-up.
        head = {'center': [center.x, center.z, -center.y],
                'radius': max((p - center).length for p in coords)}
    record = {'kind': kind, 'source': path, 'model': '/assets/insertion-lab/v6/' + kind + '.glb',
              'head': head, 'fixes': fixes, 'meshObjects': len(imported),
              'status': 'local-contact-candidate', 'aiUsed': False,
              'limitations': ['procedural surface grain, not scanned tissue', 'cultivar details unverified',
                              'runtime contact uses bounded local deformation, not petal self-collision']}
    records.append(record)
    print('CONTACT_ASSET', json.dumps(record), flush=True)
(OUT / 'manifest.json').write_text(json.dumps({'assets': records}, indent=2), encoding='utf-8')
print('CONTACT_ASSETS_READY', len(records), flush=True)
