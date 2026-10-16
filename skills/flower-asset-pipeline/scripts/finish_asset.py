"""Shared Blender export, round-trip checks and consistent reference renders."""
import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = [obj.matrix_world @ Vector(corner) for obj in objects
              for corner in obj.evaluated_get(depsgraph).bound_box]
    if not points:
        raise ValueError('No mesh geometry to export')
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return low, high


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def finish(out, spec, samples=12, render=True):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if (out / 'stem.glb').exists() or (out / 'source.blend').exists():
        raise FileExistsError('Use a new asset version directory; refusing overwrite')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError('No meshes in candidate model')
    low, high = bounds(meshes)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(out / 'stem.glb'), export_format='GLB',
                             use_selection=True, export_apply=True, export_yup=True)
    data = (out / 'stem.glb').read_bytes()
    magic, version, length = struct.unpack('<4sII', data[:12])
    chunk_length, chunk_type = struct.unpack('<II', data[12:20])
    document = json.loads(data[20:20 + chunk_length])
    assert magic == b'glTF' and version == 2 and length == len(data)
    assert chunk_type == 0x4E4F534A
    assert document.get('meshes')
    assert all('uri' not in item for item in document.get('buffers', []))
    assert all('uri' not in item or item['uri'].startswith('data:')
               for item in document.get('images', [])), 'GLB has external textures'
    # Import into an isolated scene to verify the file actually round-trips.
    original_scene = bpy.context.scene
    check_scene = bpy.data.scenes.new('export-round-trip')
    bpy.context.window.scene = check_scene
    bpy.ops.import_scene.gltf(filepath=str(out / 'stem.glb'))
    imported = [obj for obj in check_scene.objects if obj.type == 'MESH']
    imported_low, imported_high = bounds(imported)
    triangle_count = sum(len(obj.data.polygons) for obj in imported)
    missing = [im.name for im in bpy.data.images
               if im.source == 'FILE' and not im.packed_file
               and not Path(bpy.path.abspath(im.filepath)).is_file()]
    assert imported and not missing, f'Missing images: {missing}'
    original_dims = sorted(high - low)
    imported_dims = sorted(imported_high - imported_low)
    assert max(abs(a - b) for a, b in zip(original_dims, imported_dims)) < 0.0001
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(check_scene)

    scene = original_scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 6
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('flower-neutral-studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.15
    scene.world = world
    center = (low + high) / 2
    total_height = high.z - low.z
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.camera_add(location=(0, -1.5, center.z))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.clip_start = 0.001
    camera.data.clip_end = 100
    scene.camera = camera
    for location, energy, size in [((-0.5, -0.7, 1.1), 7, 0.6),
                                   ((0.6, 0.2, 0.9), 4, 0.5),
                                   ((0, 0.7, 0.6), 2, 0.5)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = size
        aim(light, center)
    views = []
    if render:
        for name, angle in [('front', -math.pi / 2), ('left', math.pi),
                             ('back', math.pi / 2), ('right', 0)]:
            camera.location = (center.x + 1.5 * math.cos(angle),
                               center.y + 1.5 * math.sin(angle), center.z)
            resolution = spec.get('renderResolution', [600, 900])
            horizontal_extent = max(high.x-low.x, high.y-low.y)
            camera.data.ortho_scale = max(total_height, horizontal_extent*resolution[1]/resolution[0]) * 1.17
            aim(camera, center)
            scene.render.resolution_x, scene.render.resolution_y = spec.get('renderResolution', [600, 900])
            scene.render.resolution_percentage = 100
            scene.render.filepath = str(out / f'{name}.png')
            bpy.ops.render.render(write_still=True)
            views.append(f'{name}.png')
            print('VIEW_READY', name, flush=True)
        # Only an explicit head center is used; never infer it from an arbitrary model.
        if spec.get('headCenter'):
            head = Vector(spec['headCenter'])
            direction = Vector(spec.get('headNormal', [0, -0.72, 0.69])).normalized()
            for name, offset in [('head-front', direction), ('head-back', -direction),
                                  ('head-quarter', Vector([0.6, -0.8, 0.7]).normalized())]:
                camera.location = head + offset * 0.8
                aim(camera, head)
                camera.data.ortho_scale = spec.get('headDiameterM', 0.12) * 1.35
                scene.render.resolution_x = scene.render.resolution_y = spec.get('detailResolution', 720)
                scene.render.filepath = str(out / f'{name}.png')
                bpy.ops.render.render(write_still=True)
                views.append(f'{name}.png')
                print('VIEW_READY', name, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'source.blend'))
    report = {
        'productId': spec.get('productId'), 'route': spec.get('route'),
        'status': 'candidate-needs-visual-review', 'mediaOrigin': 'model-render',
        'physicalDimensionsVerified': False, 'sourceSpec': spec,
        'files': ['stem.glb', 'source.blend', *views],
        'checks': {'glbHeader': True, 'embeddedTextures': True, 'roundTrip': True,
                   'meshCount': len(imported), 'triangles': triangle_count,
                   'bytes': len(data), 'boundsM': {'min': list(low), 'max': list(high)},
                   'missingTextures': missing},
    }
    (out / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('ASSET_READY', str(out), triangle_count, len(data), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--spec', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--samples', type=int, default=12)
    parser.add_argument('--no-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads(Path(args.spec).read_text(encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.model).resolve()))
    finish(args.out, spec, args.samples, not args.no_render)
