import bpy
import math
import argparse
import sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets/workbench';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--only');options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
def volume_only(obj):
    return any(mat and mat.use_nodes and any(node.type=='OUTPUT_MATERIAL' and node.inputs['Volume'].is_linked and not node.inputs['Surface'].is_linked for node in mat.node_tree.nodes) for mat in obj.data.materials)

def web_lily_material(original):
    shader=next(node for node in original.node_tree.nodes if node.type=='BSDF_PRINCIPLED')
    color=tuple(shader.inputs['Base Color'].default_value)
    ramp_name='Color Ramp.001' if original.name=='stem' else 'Color Ramp'
    ramp=original.node_tree.nodes.get(ramp_name)
    if ramp and original.name in ('flowerRed','flowerDarkRed','flowerPollen','stem'):
        colors=[tuple(element.color) for element in ramp.color_ramp.elements]
        color=tuple(sum(item[channel] for item in colors)/len(colors) for channel in range(4))
    material=bpy.data.materials.new(original.name+'-web');material.use_nodes=True
    material.diffuse_color=color
    material.node_tree.nodes.clear();principled=material.node_tree.nodes.new('ShaderNodeBsdfPrincipled');output=material.node_tree.nodes.new('ShaderNodeOutputMaterial');material.node_tree.links.new(principled.outputs['BSDF'],output.inputs['Surface'])
    principled.inputs['Base Color'].default_value=color
    principled.inputs['Roughness'].default_value=max(.45,float(shader.inputs['Roughness'].default_value))
    principled.inputs['Alpha'].default_value=1
    return material

for slug,prefix in [('pink-rose',None),('white-tulip',None),('eucalyptus',None),('red-rose','red-rose-flower-'),('sunflower','flower-sunflower-medium-'),('spider-lily','red-spider-lily-')]:
    if options.only and options.only!=slug:continue
    if prefix:
        folder=next(p for p in (ROOT/'asset-sources/flowers').iterdir() if p.is_dir() and p.name.startswith(prefix));file=folder/'prepared.blend'
    else:file=ROOT/'asset-sources/sample-pack'/(slug+'.blend')
    if slug=='white-tulip' and (ROOT/'asset-sources/workbench/white-tulip.blend').exists():file=ROOT/'asset-sources/workbench/white-tulip.blend'
    bpy.ops.wm.open_mainfile(filepath=str(file));scene=bpy.context.scene
    effects=[obj for obj in scene.objects if obj.type=='MESH' and volume_only(obj)]
    for obj in effects:obj.hide_render=True;obj.hide_set(True)
    objects=[obj for obj in scene.objects if obj.type=='MESH' and not obj.hide_render and obj not in effects]
    if slug=='spider-lily':
        materials={mat:web_lily_material(mat) for mat in {mat for obj in objects for mat in obj.data.materials if mat}}
        for obj in objects:
            for index,mat in enumerate(obj.data.materials):
                if mat:obj.data.materials[index]=materials[mat]
    if prefix:
        for image in bpy.data.images:
            if image.type=='RENDER_RESULT' or image.source not in ('FILE','GENERATED'):continue
            w,h=image.size
            if not w or not h:continue
            _=image.pixels[0]
            if max(w,h)>768:
                scale=768/max(w,h);image.scale(round(w*scale),round(h*scale));image.pack()
        for obj in objects:
            for mod in obj.modifiers:
                if mod.type=='SUBSURF':mod.levels=min(mod.levels,1)
                if mod.type=='DECIMATE':mod.ratio=min(mod.ratio,.65)
        if slug=='spider-lily':
            for obj in objects:
                modifier=obj.modifiers.new('web-reduction','DECIMATE');modifier.ratio=.28
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.export_scene.gltf(filepath=str(OUT/(slug+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_image_format='AUTO')
    # A small actual model render of the upper plant makes an honest catalog thumbnail.
    points=[obj.matrix_world@vertex.co for obj in objects for vertex in obj.data.vertices]
    top=max(p.z for p in points);head=[p for p in points if p.z>top*(.48 if slug=='eucalyptus' else .79)]
    cx=sum(p.x for p in head)/len(head);cy=sum(p.y for p in head)/len(head)
    focus=Vector((cx,cy,sum(p.z for p in head)/len(head)))
    scene.camera.location=focus+Vector((-.8 if slug=='sunflower' else .10,-.8 if slug=='sunflower' else -.9,1.0))
    scene.camera.rotation_euler=(focus-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    extent=max(max(p.x for p in head)-min(p.x for p in head),max(p.y for p in head)-min(p.y for p in head),max(p.z for p in head)-min(p.z for p in head))
    scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=max(.12,extent*1.45)
    scene.render.resolution_x=360;scene.render.resolution_y=380;scene.render.resolution_percentage=100;scene.cycles.samples=20
    scene.render.filepath=str(OUT/(slug+'-thumb.png'));bpy.ops.render.render(write_still=True)
    if slug=='spider-lily':
        source=ROOT/'asset-sources/workbench';source.mkdir(exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(source/'spider-lily.blend'))
    print('MEDIA_DONE',slug,flush=True)
