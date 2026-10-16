import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
for prefix in ['roses-in-twisted-glass-vase-','eucalyptus-bouquet-vase-','tulips-in-a-pot-']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    folder=next(p for p in (ROOT/'asset-sources/flowers').iterdir() if p.is_dir() and p.name.startswith(prefix))
    with bpy.data.libraries.load(str(folder/'original.blend'),link=False) as (source,target): target.objects=source.objects
    for obj in target.objects:
        if obj: bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.update()
    print('MODEL',folder.name,flush=True)
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        points=[obj.matrix_world@Vector(corner) for corner in obj.bound_box]
        lo=[min(p[i] for p in points) for i in range(3)]; hi=[max(p[i] for p in points) for i in range(3)]
        # Connected-component sizes help distinguish one stem from material-grouped foliage.
        parent=list(range(len(obj.data.vertices)))
        def find(a):
            while parent[a]!=a: parent[a]=parent[parent[a]];a=parent[a]
            return a
        for e in obj.data.edges:
            a,b=map(find,e.vertices);parent[b]=a
        groups={}
        for v in obj.data.vertices: groups.setdefault(find(v.index),[]).append(v.index)
        sizes=sorted([len(v) for v in groups.values()],reverse=True)
        print(obj.name,'faces',len(obj.data.polygons),'bbox',lo,hi,'materials',[m.name for m in obj.data.materials],'components',len(groups),'largest',sizes[:10],flush=True)
