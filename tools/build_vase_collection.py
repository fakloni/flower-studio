"""Build hollow, measured vase models with reusable render outputs in Blender."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets' / 'vases'
SOURCE = ROOT / 'asset-sources' / 'vases'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

SPECS = [
    dict(id='ivory-bud', name='Ivory Bud', zh='奶油白细口瓶', height=.23, color=(.83,.77,.65,1), rough=.27, profile=[(0,.034),(.035,.043),(.15,.067),(.32,.075),(.51,.062),(.69,.034),(.84,.022),(1,.025)]),
    dict(id='sage-fluted', name='Sage Fluted', zh='鼠尾草绿竖纹瓶', height=.26, color=(.31,.43,.34,1), rough=.31, flute=28, amplitude=.0015, profile=[(0,.053),(.04,.055),(.23,.061),(.52,.067),(.78,.063),(1,.053)]),
    dict(id='terracotta-amphora', name='Terracotta Amphora', zh='陶土双耳瓶', height=.25, color=(.53,.22,.12,1), rough=.76, handles=True, profile=[(0,.042),(.05,.046),(.22,.072),(.43,.088),(.63,.079),(.78,.046),(.92,.034),(1,.038)]),
    dict(id='cobalt-hourglass', name='Cobalt Hourglass', zh='钴蓝收腰瓶', height=.24, color=(.018,.045,.24,1), rough=.19, profile=[(0,.054),(.06,.06),(.27,.075),(.46,.043),(.57,.038),(.73,.064),(.9,.071),(1,.060)]),
    dict(id='smoke-glass', name='Smoke Glass', zh='烟灰玻璃瓶', height=.27, color=(.48,.56,.52,1), rough=.10, glass=True, thickness=.003, profile=[(0,.052),(.025,.057),(.12,.059),(.45,.060),(.78,.06),(1,.059)]),
    dict(id='cream-compote', name='Cream Compote', zh='奶油白高脚花钵', height=.15, color=(.85,.81,.71,1), rough=.34, profile=[(0,.060),(.06,.063),(.15,.033),(.31,.026),(.44,.047),(.64,.084),(.86,.111),(1,.12)]),
    dict(id='blush-ribbed', name='Blush Ribbed', zh='藕粉圆腹纹理瓶', height=.20, color=(.64,.37,.34,1), rough=.38, flute=24, amplitude=.0023, profile=[(0,.040),(.045,.045),(.2,.068),(.4,.079),(.6,.077),(.78,.051),(.9,.036),(1,.038)]),
    dict(id='charcoal-sculpture', name='Charcoal Sculpture', zh='炭灰雕塑瓶', height=.285, color=(.055,.061,.055,1), rough=.58, profile=[(0,.045),(.045,.051),(.22,.059),(.41,.046),(.62,.067),(.8,.048),(1,.042)]),
]

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for data in list(bpy.data.materials):
        if data.users == 0:
            bpy.data.materials.remove(data)

def radius_at(profile, z):
    # Smooth Hermite interpolation through explicit section dimensions.
    for i in range(len(profile)-1):
        z0,r0 = profile[i]; z1,r1 = profile[i+1]
        if z <= z1:
            t = (z-z0)/(z1-z0)
            prev=profile[max(0,i-1)]; nxt=profile[min(len(profile)-1,i+2)]
            m0=(r1-prev[1])/(z1-prev[0]) if z1 != prev[0] else 0
            m1=(nxt[1]-r0)/(nxt[0]-z0) if nxt[0] != z0 else 0
            return (2*t**3-3*t**2+1)*r0+(t**3-2*t**2+t)*m0*(z1-z0)+(-2*t**3+3*t**2)*r1+(t**3-t**2)*m1*(z1-z0)
    return profile[-1][1]

def material(spec):
    mat=bpy.data.materials.new(spec['id']+'-surface')
    mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=spec['color']
    bs.inputs['Roughness'].default_value=spec['rough']
    bs.inputs['IOR'].default_value=1.46
    if spec.get('glass'):
        bs.inputs['Transmission Weight'].default_value=1
    else:
        bs.inputs['Coat Weight'].default_value=.18 if spec['rough'] < .5 else .04
        bs.inputs['Coat Roughness'].default_value=.24
        noise=mat.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value=1400
        noise.inputs['Detail'].default_value=2
        bump=mat.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value=.12
        bump.inputs['Distance'].default_value=.00013
        mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return mat

def body(spec, mat):
    n=160; rings=120; h=spec['height']; thick=spec.get('thickness',.004)
    section=[]
    # Bottom face and exterior, round mouth, interior and raised interior floor.
    section.extend([(0,0), (radius_at(spec['profile'],0),0)])
    for j in range(1,rings+1):
        z=j/rings
        section.append((radius_at(spec['profile'],z),z*h))
    mouth=radius_at(spec['profile'],1)
    for j in range(1,13):
        a=math.pi*j/12
        section.append((mouth-thick/2+thick/2*math.cos(a),h+thick/2*math.sin(a)))
    # For the compote, stop inner cavity above its supporting pedestal.
    floor=.073 if spec['id']=='cream-compote' else .009
    for j in range(rings-1,-1,-1):
        z=j/rings*h
        if z < floor:
            break
        section.append((max(thick,radius_at(spec['profile'],z/h)-thick),z))
    section.append((0,floor))
    verts=[]
    for r,z in section:
        for k in range(n):
            a=2*math.pi*k/n
            rr=r
            if spec.get('flute') and r>0:
                rr+=spec['amplitude']*math.cos(a*spec['flute'])*math.sin(min(1,z/h)*math.pi*.92)
            verts.append((rr*math.cos(a),rr*math.sin(a),z))
    faces=[]
    for j in range(len(section)-1):
        for k in range(n):
            faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
    mesh=bpy.data.meshes.new(spec['id']+'-mesh'); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(spec['id'],mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth=True
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    # Recalculate shell normals, including the inside wall.
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=.000001); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    objects=[obj]
    if spec.get('handles'):
        for sign in [-1,1]:
            curve=bpy.data.curves.new('amphora-handle','CURVE'); curve.dimensions='3D'; curve.resolution_u=24
            curve.bevel_depth=.006; curve.bevel_resolution=5; curve.use_fill_caps=True
            spline=curve.splines.new('BEZIER'); spline.bezier_points.add(4)
            for point,xyz in zip(spline.bezier_points,[(sign*.038,0,.225),(sign*.088,0,.227),(sign*.114,0,.188),(sign*.105,0,.147),(sign*.08,0,.124)]):
                point.co=xyz; point.handle_left_type='AUTO'; point.handle_right_type='AUTO'
            handle=bpy.data.objects.new('amphora-handle',curve); bpy.context.collection.objects.link(handle); curve.materials.append(mat); objects.append(handle)
    return objects

def aim(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def stage(spec):
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.cycles.max_bounces=8; scene.cycles.transmission_bounces=6
    scene.render.resolution_x=600; scene.render.resolution_y=700; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.film_transparent=True
    scene.render.threads_mode='FIXED'; scene.render.threads=6
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=-.8
    world=bpy.data.worlds.new('studio-world'); world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.82,.85,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.world=world
    h=spec['height']
    bpy.ops.object.camera_add(location=(.43,-.73,.45))
    cam=bpy.context.object; aim(cam,(0,0,h*.49)); cam.data.type='ORTHO'; cam.data.ortho_scale=max(.35,h*1.38); scene.camera=cam
    for name,loc,power,size in [('key',(-.4,-.35,.65),35,.42),('rim',(.4,.2,.55),45,.28),('fill',(.25,-.45,.3),12,.32)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light=bpy.context.object; light.name=name; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; aim(light,(0,0,h*.5))

manifest=[]
for spec in SPECS:
    print('BUILD_VASE',spec['id'],flush=True)
    clear(); mat=material(spec); objects=body(spec,mat); stage(spec)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    # Export only the vase; studio camera and lights stay in its editable source.
    bpy.ops.export_scene.gltf(filepath=str(OUT/(spec['id']+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(spec['id']+'.blend')))
    bpy.context.scene.render.filepath=str(OUT/(spec['id']+'.png'))
    bpy.ops.render.render(write_still=True)
    dimensions={'height_cm':round((spec['height']+spec.get('thickness',.004)/2)*100,1),'mouth_inner_diameter_cm':round((spec['profile'][-1][1]-spec.get('thickness',.004))*200,1),'max_body_diameter_cm':round(max(radius_at(spec['profile'],i/500) for i in range(501))*200,1)}
    manifest.append({'id':spec['id'],'name':spec['zh'],'dimensions':dimensions,'dimensions_type':'constructed_model_dimensions','model':'/assets/vases/'+spec['id']+'.glb','preview':'/assets/vases/'+spec['id']+'.png','source':'asset-sources/vases/'+spec['id']+'.blend','material': 'glass' if spec.get('glass') else 'ceramic','unit':'meter'})
    print('VASE_DONE',spec['id'],flush=True)
(OUT/'catalog.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('VASE_COLLECTION_DONE',len(manifest),flush=True)
