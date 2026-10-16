"""Make versioned deformable lab derivatives; never rewrite published source assets.

blender --background --python tools/prepare_insertion_lab.py [-- --render]
The independent deformation joints are driven by a browser centreline solver.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'v3'
OUT = ROOT / ('public/assets/insertion-lab/' + VERSION)
SOURCE = ROOT / ('asset-sources/insertion-lab/' + VERSION)
JOBS = [
    dict(id='rose', source='public/assets/catalog/P052/pilot-model-v2/stem.glb', height=.60, length=.52,
         reference='https://www.deruiter.com/product/proud'),
    dict(id='tulip', source='public/assets/workbench/white-tulip.glb', height=.376, length=.46,
         reference='docs/workbench-sample-pack.md; parameterized tulip category candidate'),
    dict(id='eucalyptus', source='public/assets/catalog/P067/pilot-model-v2/stem.glb', height=.65, length=.58,
         reference='https://plants.ces.ncsu.edu/plants/eucalyptus-cinerea/'),
]
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
records = []
for spec in JOBS:
    destination = OUT / (spec['id'] + '.glb')
    if destination.exists():
        raise RuntimeError(f'{destination} exists; select a new version before rebuilding')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / spec['source']))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    scale = spec['length'] / spec['height']
    # The procedural rose/eucalyptus source uses this documented natural axis warp.
    def axis(z):
        if spec['id'] != 'tulip':
            return Vector((.004*math.sin(math.pi*1.25*z/spec['height']),
                           .002*math.sin(math.pi*1.5*z/spec['height']), z))
        # Measured ring centres of the authored tulip stem, interpolated below.
        t = max(0, min(1, z/spec['height']))
        a = min(len(rings)-2, int(t*(len(rings)-1)))
        local = t*(len(rings)-1)-a
        return Vector((rings[a][0]*(1-local)+rings[a+1][0]*local,
                       rings[a][1]*(1-local)+rings[a+1][1]*local, z))
    if spec['id'] == 'tulip':
        trunk = next(o for o in meshes if o.name == 'white-tulip-stem')
        world = [trunk.matrix_world @ v.co for v in trunk.data.vertices]
        rings = []
        for j in range(61):
            z = j/60*spec['height']
            nearest = sorted(world, key=lambda p: abs(p.z-z))[:24]
            center = sum(nearest, Vector())/len(nearest)
            rings.append((center.x, center.y))
    removed = []
    for obj in meshes[:]:
        world = obj.matrix_world.copy()
        points = [world @ v.co for v in obj.data.vertices]
        # Prepare the insertion segment like a stripped cut stem.
        if spec['id'] == 'tulip' and 'leaf' in obj.name and min(p.z for p in points)*scale < .17:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
            meshes.remove(obj)
            continue
        # Attach the tulip's remaining leaf at its actual trunk instead of its old radial gap.
        shift = Vector()
        if spec['id'] == 'tulip' and 'leaf' in obj.name:
            low = min(p.z for p in points)
            base = [p for p in points if p.z < low+.0005]
            shift = axis(low) - sum(base, Vector())/len(base)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        for vert,p in zip(obj.data.vertices,points):
            p += shift
            center = axis(p.z)
            vert.co = Vector((p.x-center.x,p.y-center.y,p.z))*scale
        obj.data.update()
    for obj in list(bpy.context.scene.objects):
        if obj not in meshes:
            bpy.data.objects.remove(obj,do_unlink=True)
    armature = bpy.data.armatures.new('lab-deformation-joints')
    rig = bpy.data.objects.new('lab-rig',armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for j in range(25):
        bone = armature.edit_bones.new(f'Lab_joint_{j:02}')
        bone.head = (0,0,j/24*spec['length'])
        bone.tail = (0,0,(j+1)/24*spec['length'])
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in meshes:
        obj.parent = rig
        groups = [obj.vertex_groups.new(name=f'Lab_joint_{j:02}') for j in range(25)]
        head = 'petal' in obj.name or 'flower-center' in obj.name
        for v in obj.data.vertices:
            t = 24 if head else max(0,min(24,v.co.z/spec['length']*24))
            j = min(23,int(t)); fraction=t-j
            if 1-fraction > 1e-6: groups[j].add([v.index],1-fraction,'REPLACE')
            if fraction > 1e-6: groups[j+1].add([v.index],fraction,'REPLACE')
        modifier = obj.modifiers.new('lab-centreline-skin','ARMATURE')
        modifier.object = rig
        obj['labKind'] = spec['id']
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',export_skins=True,
                             export_animations=False,export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(spec['id']+'.blend')))
    record = {**spec,'model':'/assets/insertion-lab/'+VERSION+'/'+spec['id']+'.glb',
              'joints':25,'removedLowerLeaves':removed,'physicalDimensionsVerified':False,
              'status':'deformation-prototype-not-botanical-approval',
              'route':'existing-local-Blender-candidate-to-independent-deformation-joints',
              'limitations':['approximate leaf deformation','branch graph is not separately simulated',
                             'no physical petal collision','cultivar and backside not verified'],
              'aiGenerationUsed':False}
    records.append(record)
    print('LAB_ASSET', json.dumps(record,ensure_ascii=False),flush=True)
    # Optional offline appearance reference; browser QA supplies deformation views separately.
    if '--render' in sys.argv:
        scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
        scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
        scene.render.resolution_x=400;scene.render.resolution_y=600
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.render.film_transparent=True
        world=bpy.data.worlds.new('lab-studio');world.use_nodes=True
        world.node_tree.nodes['Background'].inputs[1].default_value=.3;scene.world=world
        for location,power in [((-.4,-.6,.8),30),((.4,.1,.6),24)]:
            bpy.ops.object.light_add(type='AREA',location=location)
            light=bpy.context.object;light.data.energy=power;light.data.size=.5
            light.rotation_euler=(Vector((0,0,.3))-light.location).to_track_quat('-Z','Y').to_euler()
        bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO'
        camera.data.ortho_scale=.72;scene.camera=camera
        for name,angle in [('front',-math.pi/2),('left',0),('back',math.pi/2),('right',math.pi)]:
            camera.location=(math.cos(angle),math.sin(angle),.42)
            camera.rotation_euler=(Vector((0,0,.29))-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(OUT/(spec['id']+'-'+name+'.png'))
            bpy.ops.render.render(write_still=True)
    # Round-trip the GLB and verify deformable geometry and the expected joint set.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    imported=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    if len(imported)!=1 or len(imported[0].data.bones)!=25:
        raise RuntimeError('Rig round-trip validation failed: '+spec['id'])
    bone_shapes = {b.custom_shape for a in imported for b in a.pose.bones if b.custom_shape}
    if any(not any(m.type == 'ARMATURE' for m in o.modifiers)
           for o in bpy.context.scene.objects if o.type == 'MESH' and o not in bone_shapes):
        raise RuntimeError('Unskinned mesh after round-trip: '+spec['id'])
(OUT/'manifest.json').write_text(json.dumps({'version':1,'assets':records},ensure_ascii=False,indent=2),encoding='utf-8')
print('LAB_ASSETS_READY',len(records),flush=True)
