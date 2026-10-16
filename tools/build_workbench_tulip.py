"""Create an editable closed white tulip for the interactive workbench."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/workbench'
SOURCE = ROOT / 'asset-sources/workbench'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, roughness, subsurface=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Subsurface Weight'].default_value = subsurface
    return mat

ivory = material('white-tulip-petal-ivory', (.86, .855, .78), .48, .10)
inner = material('white-tulip-petal-inner', (.92, .91, .84), .48, .13)
green = material('white-tulip-stem-green', (.14, .27, .085), .68, .04)
leaf_mat = material('white-tulip-leaf-green', (.18, .31, .105), .58, .07)

def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    return obj

# The stem bends gently; its flower junction remains inside the petal cup.
curve = bpy.data.curves.new('white-tulip-stem', 'CURVE')
curve.dimensions = '3D'
curve.resolution_u = 16
curve.bevel_depth = .0026
curve.bevel_resolution = 5
spline = curve.splines.new('BEZIER')
spline.bezier_points.add(3)
for point, co in zip(spline.bezier_points, [(0, 0, 0), (.002, -.002, .14), (.009, .004, .27), (.012, .008, .376)]):
    point.co = co
    point.handle_left_type = point.handle_right_type = 'AUTO'
stem = bpy.data.objects.new('white-tulip-stem', curve)
bpy.context.collection.objects.link(stem)
stem.data.materials.append(green)
bpy.context.view_layer.objects.active = stem
stem.select_set(True)
bpy.ops.object.convert(target='MESH')
stem.select_set(False)

for index in range(6):
    angle = index * math.tau / 6
    radial_scale = 1 if index % 2 == 0 else .93
    vertices = []
    rows, columns = 34, 22
    for row in range(rows + 1):
        v = row / rows
        radius = (.003 + .031 * math.sin(math.pi * v * .86)) * radial_scale
        half_angle = .13 + .63 * math.sin(math.pi * v) ** .62
        for col in range(columns + 1):
            u = col / columns * 2 - 1
            theta = angle + u * half_angle
            # Slight ribs and curled side edges give each petal a natural surface.
            r = radius + .00055 * math.cos(u * math.pi * 5) * math.sin(math.pi * v)
            r += .0008 * abs(u) ** 5 * math.sin(math.pi * v)
            z = .371 + .087 * v + .0018 * math.sin(index * 1.8) * v
            z -= .007 * u * u * v ** 3
            vertices.append((.012 + r * math.cos(theta), .008 + r * math.sin(theta), z))
    faces = []
    for row in range(rows):
        for col in range(columns):
            a = row * (columns + 1) + col
            faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    obj = mesh(f'white-tulip-petal-{index}', vertices, faces, ivory if index % 2 == 0 else inner)
    solid = obj.modifiers.new('delicate-petal-thickness', 'SOLIDIFY')
    solid.thickness = .00035
    solid.offset = 0

for index, (height, angle, length, width) in enumerate([(.13, -.9, .205, .019), (.20, 2.35, .165, .014)]):
    vertices = []
    rows, columns = 36, 10
    for row in range(rows + 1):
        t = row / rows
        spread = .014 + .082 * t * t
        z = height + length * t - .022 * t ** 3
        breadth = width * math.sin(math.pi * t) ** .8
        for col in range(columns + 1):
            u = col / columns * 2 - 1
            x = spread * math.cos(angle) - u * breadth * math.sin(angle)
            y = spread * math.sin(angle) + u * breadth * math.cos(angle)
            vertices.append((x, y, z + .004 * u * u * math.sin(math.pi * t)))
    faces = []
    for row in range(rows):
        for col in range(columns):
            a = row * (columns + 1) + col
            faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    obj = mesh(f'white-tulip-leaf-{index}', vertices, faces, leaf_mat)
    solid = obj.modifiers.new('leaf-thickness', 'SOLIDIFY')
    solid.thickness = .00025

plants = list(bpy.context.scene.objects)
bpy.ops.object.select_all(action='DESELECT')
for obj in plants:
    obj.select_set(True)
bpy.context.view_layer.objects.active = plants[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / 'white-tulip.glb'), export_format='GLB', use_selection=True, export_apply=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.new('tulip-studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[1].default_value = .25
scene.world = world

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add(location=(.6, -1.0, .5))
camera = bpy.context.object
camera.data.type = 'ORTHO'
scene.camera = camera
for location, energy, size in [((-.45, -.6, .8), 30, .45), ((.45, .3, .7), 20, .4)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = size
    aim(light, (0, 0, .3))

for view, angle in [('front', -.8), ('side', .8)]:
    camera.location = (math.cos(angle), math.sin(angle), .6)
    camera.data.ortho_scale = .60
    aim(camera, (0, 0, .23))
    scene.render.resolution_x = 500
    scene.render.resolution_y = 680
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(OUT / f'white-tulip-{view}.png')
    bpy.ops.render.render(write_still=True)

camera.location = (.32, -.8, .65)
camera.data.ortho_scale = .16
aim(camera, (.012, .008, .403))
scene.render.resolution_x = 360
scene.render.resolution_y = 380
scene.render.filepath = str(OUT / 'white-tulip-thumb.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'white-tulip.blend'))
print('WORKBENCH_TULIP_DONE', flush=True)
