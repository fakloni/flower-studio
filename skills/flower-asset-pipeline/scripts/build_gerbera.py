"""Pilot archetype: geometry-based, leafless, single-head semi-double Gerbera."""
import argparse
from hashlib import sha256
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from finish_asset import finish


def build(spec, base):
    if spec.get('archetype') != 'gerbera':
        raise ValueError('This builder only supports gerbera; create a morphology-specific builder')
    rng = random.Random(spec.get('seed', 1))
    height, diameter = float(spec['stemLengthM']), float(spec['headDiameterM'])
    if not (0.1 <= height <= 2 and 0.02 <= diameter <= 0.4):
        raise ValueError('Implausible stem/head dimensions; verify meters')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    normal = Vector(spec.get('headNormal', [0, -0.72, 0.69])).normalized()
    rotation = Vector([0, 0, 1]).rotation_difference(normal)
    center = Vector([0.009, 0.003, height])
    spec['headCenter'] = list(center)
    spec['headNormal'] = list(normal)

    def material(name, color, texture=False):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        mat.use_backface_culling = False
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = 0.62
        shader.inputs['Specular IOR Level'].default_value = 0.25
        # Subsurface scattering improves the Blender preview; exported GLB uses core PBR.
        shader.inputs['Subsurface Weight'].default_value = 0.045
        if texture and spec.get('petalTexture'):
            path = (base / spec['petalTexture']).resolve()
            image = bpy.data.images.load(str(path), check_existing=True)
            image.pack()
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
            # Generated alpha has a soft halo: use RGB inside the ligule, not its alpha silhouette.
        return mat

    orange = material('ray-florets', tuple(spec.get('petalColor', [0.93, 0.17, 0.012])), bool(spec.get('petalTexture')))
    orange_inner = material('short-inner-florets', tuple(spec.get('innerColor', [0.74, 0.115, 0.006])))
    green = material('green-involucre', (0.16, 0.27, 0.045))
    stem_mat = material('leafless-peduncle', (0.22, 0.32, 0.07))
    disk_materials = [material(f'disk-{i}', color) for i, color in enumerate(spec.get('diskColors', [
        (0.21, 0.3, 0.022), (0.28, 0.35, 0.035), (0.36, 0.39, 0.052),
        (0.15, 0.24, 0.018), (0.31, 0.31, 0.016)]))]

    def mesh(name, verts, faces, mat, uv=None, indices=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        mats = mat if isinstance(mat, list) else [mat]
        for item in mats:
            data.materials.append(item)
        for i, polygon in enumerate(data.polygons):
            polygon.use_smooth = True
            if indices:
                polygon.material_index = indices[i]
        if uv:
            layer = data.uv_layers.new(name='petal-reference-uv')
            for polygon in data.polygons:
                for loop_index in polygon.loop_indices:
                    layer.data[loop_index].uv = uv[data.loops[loop_index].vertex_index]
        return obj

    def headpoint(x, y, z):
        return tuple(center + rotation @ Vector([x, y, z]))

    def petal_batch(name, count, radial_start, length, width, level, mat, bract=False):
        verts, faces, uv = [], [], []
        rows, columns = (8, 4)
        for index in range(count):
            angle = math.tau * index / count + rng.uniform(-0.025, 0.025)
            petal_length = length * rng.uniform(0.93, 1.07)
            petal_width = width * rng.uniform(0.90, 1.1)
            twist = rng.uniform(-0.0007, 0.0007)
            offset = len(verts)
            for row in range(rows + 1):
                t = row / rows
                shape = max(0.035, math.sin(math.pi * t * 0.93) ** 0.50)
                breadth = petal_width * shape
                # Longitudinal arch + tip droop + folded margins; each ligule is a curved surface.
                z = level + 0.0055 * math.sin(math.pi * t) - 0.0035 * t ** 3
                if bract:
                    z = level - 0.011 * t
                for column in range(columns + 1):
                    u = column / columns * 2 - 1
                    r = radial_start + petal_length * t - 0.0023 * u * u * t ** 8
                    tangential = breadth * u
                    x = r * math.cos(angle) - tangential * math.sin(angle)
                    y = r * math.sin(angle) + tangential * math.cos(angle)
                    zz = z + 0.0016 * u * u * math.sin(math.pi * t) + twist * u * t
                    zz += 0.00012 * math.cos(u * math.pi * 4) * math.sin(math.pi * t)
                    verts.append(headpoint(x, y, zz))
                    # Stay within the generated petal RGB: exclude transparent halo and backdrop.
                    uv.append((0.5 + u * 0.13 * math.sin(math.pi * t) ** 0.55, 0.08 + t * 0.85))
            for row in range(rows):
                for column in range(columns):
                    a = offset + row * (columns + 1) + column
                    faces.append((a, a + columns + 1, a + columns + 2, a + 1))
        obj = mesh(name, verts, faces, mat, uv)
        thickness = obj.modifiers.new('thin-real-surface', 'SOLIDIFY')
        thickness.thickness = 0.00012 if not bract else 0.00025
        thickness.offset = 0
        return obj

    scale = diameter / 0.12
    petal_batch('outer-ray-row', 38, 0.013 * scale, 0.046 * scale, 0.0056 * scale, -0.002, orange)
    petal_batch('middle-ray-row', 38, 0.013 * scale, 0.041 * scale, 0.0050 * scale, 0.001, orange)
    petal_batch('inner-ray-row', 42, 0.014 * scale, 0.033 * scale, 0.0040 * scale, 0.004, orange)
    petal_batch('short-transitional-florets', 65, 0.010 * scale, 0.016 * scale, 0.0017 * scale, 0.006, orange_inner)
    petal_batch('involucral-bracts', 32, 0.008 * scale, 0.019 * scale, 0.0025 * scale, -0.003, green, True)
    # Receptacle closes the underside and physically connects the peduncle.
    verts, faces = [], []
    for ring, (radius, z) in enumerate([(0.0025, -0.014), (0.007, -0.010), (0.015, -0.003), (0.015, 0)]):
        for index in range(40):
            a = math.tau * index / 40
            verts.append(headpoint(radius * scale * math.cos(a), radius * scale * math.sin(a), z))
    for ring in range(3):
        for index in range(40):
            a = ring * 40 + index
            b = ring * 40 + (index + 1) % 40
            faces.append((a, b, b + 40, a + 40))
    faces += [tuple(reversed(range(40))), tuple(range(120, 160))]
    mesh('receptacle', verts, faces, green)

    # Tiny disk florets share one mesh; phyllotaxis avoids obvious radial rows.
    verts, faces, indices = [], [], []
    disk_radius = 0.0108 * scale
    for index in range(620):
        radius = disk_radius * math.sqrt((index + 0.5) / 620)
        a = index * math.pi * (3 - math.sqrt(5))
        cx, cy = radius * math.cos(a), radius * math.sin(a)
        z = 0.0075 + 0.0020 * (1 - (radius / disk_radius) ** 2)
        offset = len(verts)
        floret_radius = 0.00036 * scale
        for ring in range(2):
            for k in range(6):
                theta = math.tau * k / 6
                rr = floret_radius * (1 if ring == 0 else 0.72)
                verts.append(headpoint(cx + rr * math.cos(theta), cy + rr * math.sin(theta), z + ring * 0.0007))
        color_index = rng.randrange(len(disk_materials))
        for k in range(6):
            faces.append((offset + k, offset + (k + 1) % 6, offset + (k + 1) % 6 + 6, offset + k + 6))
            indices.append(color_index)
        faces.append(tuple(range(offset + 6, offset + 12)))
        indices.append(color_index)
    mesh('green-disk-florets', verts, faces, disk_materials, indices=indices)

    curve = bpy.data.curves.new('peduncle-curve', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 12
    curve.bevel_depth = 0.0026
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(4)
    junction = center - normal * 0.012
    for point, co in zip(spline.bezier_points, [(0, 0, 0), (0.010, 0.002, height * 0.28),
                                              (0.002, 0.004, height * 0.58),
                                              (0.003, 0.006, height * 0.87), tuple(junction)]):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    stem = bpy.data.objects.new('leafless-peduncle', curve)
    bpy.context.collection.objects.link(stem)
    curve.materials.append(stem_mat)
    bpy.ops.object.select_all(action='DESELECT')
    stem.select_set(True)
    bpy.context.view_layer.objects.active = stem
    bpy.ops.object.convert(target='MESH')
    for polygon in stem.data.polygons:
        polygon.use_smooth = True
    stem.select_set(False)
    # Origin convention is the cut insertion point, not the geometric center of the flower.
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj['logicalStems'] = 1
            obj['productId'] = spec['productId']


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--samples', type=int, default=12)
    parser.add_argument('--no-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec_path = Path(args.spec).resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    spec['inputSpecSha256'] = sha256(spec_path.read_bytes()).hexdigest()
    build(spec, spec_path.parent)
    finish(args.out, spec, args.samples, not args.no_render)
