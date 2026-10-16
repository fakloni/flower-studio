"""Render camera-space normals for the same rose used by the 2D workbench."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/texture-trial'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'asset-sources/sample-pack/pink-rose.blend'))
scene = bpy.context.scene
camera = scene.camera
angle = math.radians(-60)
camera.location = (1.1*math.cos(angle), 1.1*math.sin(angle), .68)
camera.rotation_euler = (Vector((0, 0, .48*.52))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .48*1.42
scene.render.resolution_x = 500
scene.render.resolution_y = 680
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.cycles.samples = 8
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.view_settings.view_transform = 'Raw'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1

# Export material color without baked illumination; PNG color is sRGB.
color_materials = {}
for obj in scene.objects:
    if obj.type != 'MESH':
        continue
    for index, original in enumerate(obj.data.materials):
        if original not in color_materials:
            material = original.copy()
            shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
            output_node = next(node for node in material.node_tree.nodes if node.type == 'OUTPUT_MATERIAL')
            emission_node = material.node_tree.nodes.new('ShaderNodeEmission')
            if shader:
                source = shader.inputs['Base Color']
                if source.is_linked:
                    material.node_tree.links.new(source.links[0].from_socket, emission_node.inputs['Color'])
                else:
                    emission_node.inputs['Color'].default_value = source.default_value
            else:
                emission_node.inputs['Color'].default_value = original.diffuse_color
            material.node_tree.links.new(emission_node.outputs['Emission'], output_node.inputs['Surface'])
            color_materials[original] = material
        obj.data.materials[index] = color_materials[original]
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = str(OUT / 'rose-blender-color.png')
bpy.ops.render.render(write_still=True)
scene.view_settings.view_transform = 'Raw'

ao_material = bpy.data.materials.new('trial-occlusion')
ao_material.use_nodes = True
ao_nodes = ao_material.node_tree.nodes
ao_nodes.clear()
ao = ao_nodes.new('ShaderNodeAmbientOcclusion')
ao.inputs['Distance'].default_value = .025
ao.samples = 16
ao_emission = ao_nodes.new('ShaderNodeEmission')
ao_output = ao_nodes.new('ShaderNodeOutputMaterial')
ao_material.node_tree.links.new(ao.outputs['AO'], ao_emission.inputs['Color'])
ao_material.node_tree.links.new(ao_emission.outputs['Emission'], ao_output.inputs['Surface'])
for obj in scene.objects:
    if obj.type == 'MESH':
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = ao_material
scene.cycles.samples = 16
scene.render.filepath = str(OUT / 'rose-blender-ao.png')
bpy.ops.render.render(write_still=True)

normal = bpy.data.materials.new('trial-camera-normals')
normal.use_nodes = True
nodes = normal.node_tree.nodes
nodes.clear()
geometry = nodes.new('ShaderNodeNewGeometry')
transform = nodes.new('ShaderNodeVectorTransform')
transform.vector_type = 'NORMAL'
transform.convert_from = 'WORLD'
transform.convert_to = 'CAMERA'
encode = nodes.new('ShaderNodeVectorMath')
encode.operation = 'MULTIPLY_ADD'
encode.inputs[1].default_value = (.5, .5, .5)
encode.inputs[2].default_value = (.5, .5, .5)
emission = nodes.new('ShaderNodeEmission')
output = nodes.new('ShaderNodeOutputMaterial')
links = normal.node_tree.links
links.new(geometry.outputs['Normal'], transform.inputs['Vector'])
links.new(transform.outputs['Vector'], encode.inputs[0])
links.new(encode.outputs['Vector'], emission.inputs['Color'])
links.new(emission.outputs['Emission'], output.inputs['Surface'])
for obj in scene.objects:
    if obj.type == 'MESH':
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = normal
scene.render.filepath = str(OUT / 'rose-blender-normal.png')
bpy.ops.render.render(write_still=True)
print('TEXTURE_TRIAL_NORMAL_DONE', scene.render.filepath, flush=True)
