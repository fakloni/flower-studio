import bpy
import math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'asset-sources/flowers'; OUT=ROOT/'tmp/flower-angles'; OUT.mkdir(parents=True,exist_ok=True)
for slug,prefix in [('sunflower','flower-sunflower-medium-'),('yellow-flower','yellow-flower-')]:
    folder=next(p for p in BASE.iterdir() if p.is_dir() and p.name.startswith(prefix))
    bpy.ops.wm.open_mainfile(filepath=str(folder/'prepared.blend'))
    scene=bpy.context.scene; scene.cycles.samples=8
    scene.render.resolution_x=310;scene.render.resolution_y=390
    for i in range(4):
        angle=math.radians(45+i*90)
        scene.camera.location=(1.1*math.cos(angle),1.1*math.sin(angle),.43)
        scene.camera.rotation_euler=(Vector((0,0,.25))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/f'{slug}-{i}.png')
        bpy.ops.render.render(write_still=True)
        print('ANGLE_DONE',slug,i,flush=True)
