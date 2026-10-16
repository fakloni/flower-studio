import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'asset-sources'/'flowers'; OUT=ROOT/'public'/'assets'/'flowers'
OUT.mkdir(parents=True,exist_ok=True)
SAMPLES=[('red-rose','红玫瑰','red-rose-flower-',None),('spider-lily','红花石蒜','red-spider-lily-',None),('sunflower','向日葵','flower-sunflower-medium-',None),('yellow-flower','黄色花材','yellow-flower-',None),('white-tulip','白郁金香','tulips-in-a-pot-',('flower','leaf')),('pink-roses-pair','粉玫瑰双支','roses-in-twisted-glass-vase-',('rose','rose.001','leaf.001','leaf.002','leaf.003','leaf.004'))]
SAMPLES.append(('eucalyptus-bouquet','尤加利组合','eucalyptus-bouquet-vase-',('Colorg54','Colorg456','Colorg455','Colorg454','Colorg4')))

def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

catalog=[]
if len(sys.argv)>1 and '--only' in sys.argv:
    wanted=sys.argv[sys.argv.index('--only')+1]
    SAMPLES=[sample for sample in SAMPLES if sample[0]==wanted]
    if (OUT/'catalog.json').exists():
        catalog=[item for item in json.loads((OUT/'catalog.json').read_text(encoding='utf-8')) if item['id'] not in (wanted,'eucalyptus-branch')]
for slug,label,prefix,selection in SAMPLES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    folder=next(p for p in BASE.iterdir() if p.is_dir() and p.name.startswith(prefix))
    print('PREPARE',slug,flush=True)
    with bpy.data.libraries.load(str(folder/'original.blend'),link=False) as (source,target): target.objects=source.objects
    for obj in target.objects:
        if obj is not None: bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.update()
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and (selection is None or obj.name in selection)]
    if not meshes: raise ValueError('No selected flower geometry: '+slug)
    for obj in meshes:
        obj.data.validate(clean_customdata=False)
        obj.data.update()
    # Bake each selected object's world transform, preserving the source geometry.
    transforms={obj:obj.matrix_world.copy() for obj in meshes}
    for obj in meshes:
        obj.parent=None; obj.matrix_world=transforms[obj]
    for obj in list(bpy.context.scene.objects):
        if obj not in meshes: bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.view_layer.update()
    points=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
    low=Vector([min(p[a] for p in points) for a in range(3)]); high=Vector([max(p[a] for p in points) for a in range(3)])
    height=high.z-low.z
    scale=.50/height
    offset=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    for obj in meshes:
        obj.location=(obj.location-offset)*scale; obj.scale*=scale
    bpy.context.view_layer.update()
    # Retain known physical geometry. The standardized display height is explicitly a preview convention.
    scene=bpy.context.scene; scene.unit_settings.system='METRIC'
    scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED'; scene.render.threads=4
    scene.render.resolution_x=620; scene.render.resolution_y=780; scene.render.resolution_percentage=100
    scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX'; scene.view_settings.exposure=-.4
    world=bpy.data.worlds.new('studio'); world.use_nodes=True; world.node_tree.nodes['Background'].inputs[1].default_value=.35; scene.world=world
    camera_position={'sunflower':(-.8,-.8,.62),'yellow-flower':(.6,-1.1,.9),'white-tulip':(-.6,-1.1,.72)}.get(slug,(.6,-1.1,.55))
    bpy.ops.object.camera_add(location=camera_position)
    cam=bpy.context.object; aim(cam,(0,0,.25)); cam.data.type='ORTHO'
    width=max(high.x-low.x,high.y-low.y)*scale
    cam.data.ortho_scale=max(.64,width*1.55); scene.camera=cam
    for loc,energy,size in [((-.45,-.55,.75),35,.5),((.4,.3,.7),45,.4),((.2,-.5,.4),9,.3)]:
        bpy.ops.object.light_add(type='AREA',location=loc); obj=bpy.context.object; obj.data.energy=energy; obj.data.size=size; aim(obj,(0,0,.3))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'prepared.blend'))
    scene.render.filepath=str(OUT/(slug+'.png')); bpy.ops.render.render(write_still=True)
    meta=json.loads((folder/'metadata.json').read_text(encoding='utf-8'))
    catalog.append({'id':slug,'name':label,'source_url':meta['source_url'],'source_folder':str(folder.relative_to(ROOT)),'model':'/assets/flowers/'+slug+'.glb','preview':'/assets/flowers/'+slug+'.png','source':'prepared.blend','preview_height_m':.5,'physical_dimensions_verified':False,'logical_stems':None if slug=='eucalyptus-bouquet' else (2 if slug=='pink-roses-pair' else 1),'status':'preview_candidate_needs_botanical_and_web_render_review','selected_objects':[obj.name for obj in meshes]})
    print('FLOWER_PREPARED',slug,flush=True)
(OUT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
print('FLOWER_SAMPLES_DONE',len(catalog),flush=True)
