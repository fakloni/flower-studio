"""Extract one-stem candidates and compact assets for the S0 renderer comparison."""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector, Matrix, kdtree

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'asset-sources/flowers'; OUT=ROOT/'public/assets/sample-pack'; SRC=ROOT/'asset-sources/sample-pack'
OUT.mkdir(parents=True,exist_ok=True);SRC.mkdir(parents=True,exist_ok=True)

def load(prefix):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    folder=next(p for p in BASE.iterdir() if p.is_dir() and p.name.startswith(prefix))
    with bpy.data.libraries.load(str(folder/'original.blend'),link=False) as (source,target):target.objects=source.objects
    for obj in target.objects:
        if obj:bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return folder

def components(obj):
    parent=list(range(len(obj.data.vertices)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for edge in obj.data.edges:
        a,b=map(find,edge.vertices);parent[b]=a
    parts={}
    for v in obj.data.vertices:parts.setdefault(find(v.index),[]).append(v.index)
    return sorted(parts.values(),key=len,reverse=True)

def subset(obj,indexes,name):
    ids=set(indexes);mapids={idx:i for i,idx in enumerate(indexes)}
    verts=[obj.matrix_world@obj.data.vertices[idx].co for idx in indexes]
    polygons=[p for p in obj.data.polygons if all(v in ids for v in p.vertices)]
    mesh=bpy.data.meshes.new(name+'-mesh');mesh.from_pydata(verts,[],[[mapids[v] for v in p.vertices] for p in polygons]);mesh.update()
    result=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(result)
    for mat in obj.data.materials:mesh.materials.append(mat)
    for target,source in zip(mesh.polygons,polygons):target.material_index=source.material_index;target.use_smooth=source.use_smooth
    for uv in obj.data.uv_layers:
        layer=mesh.uv_layers.new(name=uv.name)
        for newpoly,oldpoly in zip(mesh.polygons,polygons):
            for newloop,oldloop in zip(newpoly.loop_indices,oldpoly.loop_indices):layer.data[newloop].uv=uv.data[oldloop].uv
    return result

def base_anchor(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    zmin=min(p.z for p in points); zmax=max(p.z for p in points)
    low=[p for p in points if p.z<zmin+(zmax-zmin)*.018]
    return sum(low,Vector())/len(low)

def reduce_textures():
    for image in bpy.data.images:
        if image.type=='RENDER_RESULT' or image.source not in ('FILE','GENERATED'):continue
        w,h=image.size
        if w==0 or h==0:continue
        # Source textures can be packed but lazily decoded until first access.
        _=image.pixels[0]
        if max(w,h)>1024:
            factor=1024/max(w,h);image.scale(max(1,round(w*factor)),max(1,round(h*factor)))
        try:image.pack()
        except RuntimeError:pass

def clean(objects):
    transforms={obj:obj.matrix_world.copy() for obj in objects}
    for obj in objects:obj.parent=None;obj.matrix_world=transforms[obj]
    for obj in list(bpy.context.scene.objects):
        if obj not in objects:bpy.data.objects.remove(obj,do_unlink=True)
    for obj in objects:
        obj.data.validate(clean_customdata=False);obj.data.update()
        for modifier in obj.modifiers:
            if modifier.type=='SUBSURF':modifier.levels=min(1,modifier.levels);modifier.render_levels=min(1,modifier.render_levels)

def normalize(objects,anchor,height):
    # Preserve the natural silhouette; translate the physical stem base to the origin.
    for obj in objects:
        world=obj.matrix_world.copy()
        for v in obj.data.vertices:v.co=world@v.co-anchor
        obj.matrix_world=Matrix.Identity(4)
    top=max(v.co.z for obj in objects for v in obj.data.vertices)
    scale=height/top
    for obj in objects:
        for v in obj.data.vertices:v.co*=scale
        obj.data.update()
    bpy.context.view_layer.update()

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def stage(height):
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.engine='CYCLES'
    scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=500;scene.render.resolution_y=680;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=-.5
    world=bpy.data.worlds.new('studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.28;scene.world=world
    bpy.ops.object.camera_add(location=(.65,-1.15,height+.2));cam=bpy.context.object;aim(cam,(0,0,height*.52));cam.data.type='ORTHO';cam.data.ortho_scale=height*1.42;scene.camera=cam
    for loc,energy,size in [((-.4,-.5,.8),25,.45),((.4,.25,.7),30,.4),((.3,-.4,.35),8,.3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.size=size;aim(light,(0,0,height*.6))

def export(objects,slug,label,height,source,note):
    clean(objects);reduce_textures();stage(height)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    # JPEG limits texture payload; alpha-bearing textures retain PNG.
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_image_format='AUTO',export_jpeg_quality=85)
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(slug+'.blend')))
    scene=bpy.context.scene
    for view,degrees in [('front',-60),('side',30)]:
        a=math.radians(degrees);scene.camera.location=(1.1*math.cos(a),1.1*math.sin(a),height+.2);aim(scene.camera,(0,0,height*.52))
        scene.render.filepath=str(OUT/(slug+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    return {'id':slug,'name':label,'kind':'flower','unit':'meter','logical_stems':1,'insertion_point':[0,0,0],'stem_axis':[0,0,1],'display_height_cm':round(height*100,1),'physical_dimensions_verified':False,'model':slug+'.glb','previews':{'front':slug+'-front.png','side':slug+'-side.png'},'source':str(source.relative_to(ROOT)),'editable_source':str((SRC/(slug+'.blend')).relative_to(ROOT)),'model_bytes':(OUT/(slug+'.glb')).stat().st_size,'status':'single_stem_sample_candidate','note':note}

manifest=[]
# A source rose object already contains one stem plus its petals; unrelated leaf sprays are excluded.
folder=load('roses-in-twisted-glass-vase-');rose=bpy.data.objects['rose'];anchor=base_anchor(rose);clean([rose]);normalize([rose],anchor,.48)
manifest.append(export([rose],'pink-rose','粉玫瑰',.48,folder/'original.blend','单独提取一支玫瑰；缩小纹理并降低细分。'))
print('PACK_DONE pink-rose',flush=True)

folder=load('tulips-in-a-pot-');flower=bpy.data.objects['flower'];leaf=bpy.data.objects['leaf.004'];anchor=base_anchor(flower)
# Move one source leaf to the flower stem, retaining the actual leaf geometry.
leaf_anchor=base_anchor(leaf);world=leaf.matrix_world.copy()
for v in leaf.data.vertices:v.co=(world@v.co-leaf_anchor)*.48+anchor+Vector((0,0,.065))
leaf.parent=None;leaf.matrix_world=Matrix.Identity(4)
clean([flower,leaf]);normalize([flower,leaf],anchor,.46)
manifest.append(export([flower,leaf],'white-tulip','白郁金香',.46,folder/'original.blend','一支花茎和花头，补入并调整一片来源叶片；叶片连接需在近景复核。'))
print('PACK_DONE white-tulip',flush=True)

folder=load('eucalyptus-bouquet-vase-');stem=bpy.data.objects['Colorg454'];parts=components(stem)
trees=[]
for part in parts:
    tree=kdtree.KDTree(len(part))
    for i,idx in enumerate(part):tree.insert(stem.matrix_world@stem.data.vertices[idx].co,i)
    tree.balance();trees.append(tree)
selected=0;objects=[subset(stem,parts[selected],'eucalyptus-main-stem')];assigned={}
twig=bpy.data.objects['Colorg54'];twig_assignments=[[] for _ in parts]
for component in components(twig):
    vertices=[twig.matrix_world@twig.data.vertices[idx].co for idx in component]
    # Assign by the closest junction vertex, rather than a leaf/branch centroid.
    nearest=min(range(len(trees)),key=lambda i:min(trees[i].find(v)[2] for v in vertices))
    twig_assignments[nearest].extend(component)
if twig_assignments[selected]:objects.append(subset(twig,twig_assignments[selected],'eucalyptus-secondary-branches'))
assigned['Colorg54']=len(twig_assignments[selected])
for i,part in enumerate(parts):
    vertices=[stem.matrix_world@stem.data.vertices[idx].co for idx in part]+[twig.matrix_world@twig.data.vertices[idx].co for idx in twig_assignments[i]]
    tree=kdtree.KDTree(len(vertices))
    for n,v in enumerate(vertices):tree.insert(v,n)
    tree.balance();trees[i]=tree
for name in ['Colorg456','Colorg455','Colorg4']:
    obj=bpy.data.objects[name];keep=[];picked=0
    for component in components(obj):
        vertices=[obj.matrix_world@obj.data.vertices[idx].co for idx in component]
        nearest=min(range(len(trees)),key=lambda i:min(trees[i].find(v)[2] for v in vertices))
        if nearest==selected:keep.extend(component);picked+=1
    if keep:objects.append(subset(obj,keep,'eucalyptus-'+name))
    assigned[name]=picked
anchor=base_anchor(objects[0]);clean(objects);normalize(objects,anchor,.50)
record=export(objects,'eucalyptus','尤加利',.50,folder/'original.blend','从三个主枝连通分量中提取一个，按最近连接顶点归属副枝，再将叶片归属到主枝与副枝；枝叶连接仍需近景与网页复核。')
record['extraction']={'source_main_stem_components':len(parts),'selected_main_stem':selected,'assigned_components':assigned}
manifest.append(record);print('PACK_DONE eucalyptus',flush=True)

# Two hollow ceramic vessels give a narrow-mouth and wide-mouth comparison.
for slug in ['ivory-bud','sage-fluted']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'asset-sources/vases'/(slug+'.blend')))
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    for obj in meshes:
        modifier=obj.modifiers.new('sample-geometry-reduction','DECIMATE');modifier.ratio=.28
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True)
    for view,degrees in [('front',-60),('side',30)]:
        a=math.radians(degrees);scene=bpy.context.scene;scene.camera.location=(.8*math.cos(a),.8*math.sin(a),.45);aim(scene.camera,(0,0,.13));scene.render.resolution_x=500;scene.render.resolution_y=680;scene.render.filepath=str(OUT/(slug+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    source_catalog=json.loads((ROOT/'public/assets/vases/catalog.json').read_text(encoding='utf-8'));spec=next(v for v in source_catalog if v['id']==slug)
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(slug+'.blend')))
    manifest.append({'id':slug,'name':spec['name'],'kind':'vase','unit':'meter','dimensions':spec['dimensions'],'dimensions_type':'constructed_model_dimensions','mouth_center':[0,0,spec['dimensions']['height_cm']/100],'model':slug+'.glb','model_bytes':(OUT/(slug+'.glb')).stat().st_size,'previews':{'front':slug+'-front.png','side':slug+'-side.png'},'editable_source':str((SRC/(slug+'.blend')).relative_to(ROOT)),'status':'decimated_vase_sample'})
    print('PACK_DONE',slug,flush=True)
(OUT/'manifest.json').write_text(json.dumps({'version':1,'created':'2026-10-12','assets':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
print('WORKBENCH_SAMPLE_PACK_DONE',len(manifest),flush=True)
