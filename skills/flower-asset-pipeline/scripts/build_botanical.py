"""Morphology-specific local flower pilots; geometric details remain inferred references."""
import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from finish_asset import finish

TAU=math.tau
GOLDEN=math.pi*(3-math.sqrt(5))

def material(name,color,rough=.58):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.use_backface_culling=False
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.27
    bs.inputs['Subsurface Weight'].default_value=.025
    return m

class Batch:
    def __init__(self,name,mats):self.name=name;self.mats=mats;self.v=[];self.f=[];self.mi=[]
    def geom(self,v,f,mat=0):
        start=len(self.v);self.v.extend(tuple(p) for p in v);self.f.extend(tuple(start+i for i in face) for face in f);self.mi.extend([mat]*len(f))
    def grid(self,fn,rows=12,cols=6,mat=0):
        v=[fn(i/rows,j/cols*2-1) for i in range(rows+1) for j in range(cols+1)]
        f=[]
        for i in range(rows):
            for j in range(cols):a=i*(cols+1)+j;f.append((a,a+cols+1,a+cols+2,a+1))
        self.geom(v,f,mat)
    def sphere(self,center,radii,mat=0,segments=12,rings=7,rotation=None):
        center=Vector(center);rotation=rotation or Vector((0,0,1)).rotation_difference(Vector((0,0,1)))
        v=[]
        for i in range(rings+1):
            phi=math.pi*i/rings
            for j in range(segments):
                theta=TAU*j/segments;v.append(center+rotation@Vector((radii[0]*math.sin(phi)*math.cos(theta),radii[1]*math.sin(phi)*math.sin(theta),radii[2]*math.cos(phi))))
        f=[]
        for i in range(rings):
            for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;f.append((a,a+segments,b+segments,b))
        self.geom(v,f,mat)
    def tube(self,points,radius,mat=0,sides=8):
        pts=[Vector(p) for p in points];v=[]
        for i,p in enumerate(pts):
            direction=pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]
            rot=Vector((0,0,1)).rotation_difference(direction.normalized())
            rr=radius*(1-.30*i/max(1,len(pts)-1))
            for j in range(sides):v.append(p+rot@Vector((rr*math.cos(TAU*j/sides),rr*math.sin(TAU*j/sides),0)))
        f=[tuple(reversed(range(sides))),tuple(range((len(pts)-1)*sides,len(pts)*sides))]
        for i in range(len(pts)-1):
            for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;f.append((a,b,b+sides,a+sides))
        self.geom(v,f,mat)
    def object(self,thickness=None):
        if not self.v:return
        data=bpy.data.meshes.new(self.name);data.from_pydata(self.v,[],self.f);data.update();data.validate()
        obj=bpy.data.objects.new(self.name,data);bpy.context.collection.objects.link(obj)
        for m in self.mats:data.materials.append(m)
        for i,p in enumerate(data.polygons):p.material_index=self.mi[i];p.use_smooth=True
        if thickness:
            mod=obj.modifiers.new('thin-tissue','SOLIDIFY');mod.thickness=thickness;mod.offset=0
        return obj

def build(spec):
    kind=spec['archetype'];allowed={'rose','carnation','lily','lily-of-valley','gypsophila','eucalyptus','craspedia','lisianthus'}
    if kind not in allowed:raise ValueError('No morphology-specific builder for '+kind)
    if not spec.get('references'):raise ValueError('Real reference photographs are required')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng=random.Random(spec.get('seed',101));height=spec['stemLengthM'];diameter=spec['headDiameterM']
    white=tuple(spec.get('petalColor',[.87,.85,.77]));green=tuple(spec.get('leafColor',[.12,.23,.07]))
    mats=[material('petal-base',white),material('petal-soft-shade',tuple(c*.92 for c in white)),
          material('foliage',green),material('fresh-stem',tuple(spec.get('stemColor',[.14,.25,.06]))),
          material('pollen',[.68,.36,.035]),material('petal-marking',[.34,.035,.09]),
          material('leaf-midvein',tuple(min(.8,c*1.18) for c in green)),material('calyx',[.11,.22,.035])]
    petals=Batch('curved-flower-petals',mats);core=Batch('flower-centers',mats)
    stems=Batch('main-stem-and-branches',mats);leaves=Batch('leaf-surfaces',mats)
    veins=Batch('leaf-veins',mats);stem_nodes=[(0,0,0),(0,0,height*.28),(0,0,height*.56),(0,0,height)]
    stems.tube(stem_nodes,.0017 if kind in {'gypsophila','craspedia','lily-of-valley'} else .0025,3)
    top=Vector(stem_nodes[-1]);normal=Vector(spec.get('headNormal',[0,-.74,.67])).normalized()
    spec['headCenter']=list(top);spec['headNormal']=list(normal)
    def frame(center,direction):
        center=Vector(center);rot=Vector((0,0,1)).rotation_difference(Vector(direction).normalized())
        return lambda x,y,z:center+rot@Vector((x,y,z)),rot
    def leaf(base,angle,length,width,rise=.7,round_shape=False,mat=2,serrated=False,roll=0):
        base=Vector(base);rad=Vector((math.cos(angle),math.sin(angle),0));tangent=Vector((-rad.y,rad.x,0))
        def point(t,u):
            breadth=width*max(0,math.sin(math.pi*t))**(1 if round_shape else .95)
            if serrated:breadth*=1+.035*math.sin(t*math.pi*26)
            along=(.5-.5*math.cos(math.pi*t)) if round_shape else t
            cross=tangent*math.cos(roll)+Vector((0,0,math.sin(roll)))
            return base+rad*(length*along)+cross*(breadth*u)+Vector((0,0,length*rise*along+.006*math.sin(math.pi*t)*(1-u*u)-.014*t**3))
        leaves.grid(point,18,6,mat)
        veins.tube([point(i/10,0)+Vector((0,0,.0001)) for i in range(11)],.00016,6,5)
        return point
    def sepal(center,direction,count=5,radius=.018,length=.035):
        hp,_=frame(center,direction)
        for j in range(count):
            a=TAU*j/count
            def point(t,u,a=a):
                r=.004+length*t;w=radius*.22*math.sin(math.pi*t)
                return hp(r*math.cos(a)-u*w*math.sin(a),r*math.sin(a)+u*w*math.cos(a),-.006-.020*t+.009*t*t)
            leaves.grid(point,10,4,7)
    def cup_flower(center,direction,radius,style='rose'):
        hp,rot=frame(center,direction)
        if style=='rose':
            for layer,(count,radscale) in enumerate([(7,1),(8,.82),(9,.65),(8,.49),(7,.33),(5,.19),(3,.10)]):
                for j in range(count):
                    a=TAU*j/count+layer*GOLDEN+rng.uniform(-.16,.16);rmax=radius*radscale*rng.uniform(.93,1.07)
                    petal_height=radius*(.72+.075*layer)*rng.uniform(.96,1.04)
                    def point(t,u,a=a,rmax=rmax,petal_height=petal_height,layer=layer):
                        span=.36+.33*math.sin(math.pi*t*.74);theta=a+u*span
                        rr=.001+rmax*math.sin(math.pi*t*.52)+.0035*t**7*(1-u*u)
                        z=.0014*layer+petal_height*t-.006*abs(u)**2*t**4-.003*t**8
                        return hp(rr*math.cos(theta),rr*math.sin(theta),z)
                    petals.grid(point,18,10,(j+layer)%2)
            core.sphere(hp(0,0,.039),(radius*.06,radius*.06,radius*.035),0,8,5)
            sepal(center,direction,5,radius*.55,radius*.78)
            core.sphere(hp(0,0,-.004),(radius*.16,radius*.16,radius*.22),7)
            return
        layers=([10,12,13,15,17] if style=='carnation' else [7,9,9,10,6])
        for layer,count in enumerate(layers):
            size=radius*(1-.18*layer);zbase=.003*layer
            for j in range(count):
                a=TAU*j/count+layer*GOLDEN+rng.uniform(-.16,.16);shift=rng.uniform(.91,1.09);phase=rng.uniform(0,TAU)
                def point(t,u,a=a,size=size,zbase=zbase,shift=shift,phase=phase):
                    width=size*.64*math.sin(math.pi*t*.90)**.62
                    rr=(.002+size*math.sin(math.pi*t*.58))*shift
                    if style=='rose':
                        z=zbase+radius*.91*t-.008*t**6+.005*u*u*t**3
                        rr+=.003*t**6*u*u
                    elif style=='carnation':
                        z=zbase+radius*.20*t+.0055*math.sin(u*math.pi*7+phase+t*2)*t**2
                        rr+=.0014*math.sin(u*math.pi*11+phase)*t**5
                        width*=1+.12*math.sin(u*math.pi*7+phase)*t**3
                    else:
                        z=zbase+radius*.46*t+.0035*math.sin(u*math.pi*3+phase)*t**3+.003*u*u*t
                    return hp(rr*math.cos(a)-u*width*math.sin(a),rr*math.sin(a)+u*width*math.cos(a),z)
                petals.grid(point,15,8,(j+layer)%2)
        if style!='carnation':sepal(center,direction,5,radius*.55,radius*.78)
        core.sphere(hp(0,0,-.004),(radius*.16,radius*.16,radius*.22),7)
        core.sphere(hp(0,0,.009),(radius*.13,radius*.13,.006),0,12,7)
    if kind=='rose':
        cup_flower(top,normal,diameter/2)
        for z,a in [(height*.36,2.4),(height*.56,.3)]:
            branchbase=Vector((0,0,z));end=branchbase+Vector((.045*math.cos(a),.045*math.sin(a),.021))
            stems.tube([branchbase,end],.001,3)
            leaf(end,a,.061,.018,.36,serrated=True)
            for side in [-1,1]:
                for t in [.4,.75]:leaf(branchbase.lerp(end,t),a+side*1.2,.045,.013,.35,serrated=True)
    elif kind=='carnation':
        cup_flower(top,normal,diameter/2,'carnation');hp,rot=frame(top,normal)
        core.sphere(hp(0,0,-.013),(.011,.011,.020),7,16,10,rot)
        for z in [.15,.27,.40,.49]:
            for a in [z*12,z*12+math.pi]:leaf((0,0,z),a,.090,.004,.34)
    elif kind=='lisianthus':
        for j,(dx,dy,z,size) in enumerate([(.005,0,height,.030),(-.065,.016,height*.83,.026),(.056,.027,height*.88,.027)]):
            center=Vector((dx,dy,z));start=Vector((0,0,z-.17));stems.tube([start,(dx*.5,dy*.5,z-.09),center],.0013,3)
            direction=Vector((dx*4,-.73,.72)).normalized();cup_flower(center,direction,size,'lisianthus')
        for j in range(3):
            end=Vector(((-1)**j*.065,.01,height*.73+j*.026));start=Vector((0,0,height*.52))
            stems.tube([start,end],.0009,3);core.sphere(end,(.005,.005,.013),7,10,8)
        for z in [.16,.27,.38,.47]:
            for a in [z*13,z*13+math.pi]:leaf((0,0,z),a,.060,.015,.45)
    elif kind=='lily':
        for j,(dx,dy,z) in enumerate([(0,0,height),(-.075,.018,height*.84),(.070,.025,height*.91)]):
            center=Vector((dx,dy,z));start=Vector((0,0,z-.16));stems.tube([start,(dx*.55,dy*.55,z-.055),center],.0018,3)
            hp,rot=frame(center,Vector((dx*3,-.72,.70)).normalized());rad=diameter/2
            for k in range(6):
                a=TAU*k/6
                def point(t,u,a=a,k=k):
                    rr=.003+rad*t;w=rad*.36*math.sin(math.pi*t)**.7*(1 if k%2==0 else .88)
                    z=-.016+.050*math.sin(math.pi*t*.83)-.019*t**5+.004*u*u*math.sin(math.pi*t)
                    return hp(rr*math.cos(a)-u*w*math.sin(a),rr*math.sin(a)+u*w*math.cos(a),z)
                petals.grid(point,20,10,k%2)
                for spot in range(10):
                    t=rng.uniform(.35,.73);u=rng.uniform(-.45,.45);core.sphere(point(t,u)+rot@Vector((0,0,.00024)),(.0007,.0007,.00035),5,6,3)
            for k in range(6):
                a=TAU*k/6;p0=hp(0,0,-.012);p1=hp(.012*math.cos(a),.012*math.sin(a),.030)
                stems.tube([p0,p0.lerp(p1,.6),p1],.00045,6,6)
                core.sphere(p1,(.0014,.003,.0014),4,8,5,rot)
            stems.tube([hp(0,0,-.016),hp(0,0,.041)],.0006,6,6);core.sphere(hp(0,0,.041),(.0014,.0014,.001),7,8,4)
        for j in range(14):leaf((0,0,.12+j*.032),j*GOLDEN,.09,.010,.30)
    elif kind=='lily-of-valley':
        for j in range(9):
            z=height*.56+j*height*.046;x=(-1 if j%2 else 1)*(.018-.001*j);start=Vector((.003,0,z));end=Vector((x,-.01,z+.01))
            stems.tube([start,(x*.65,-.005,z+.018),end],.0005,3,6)
            hp,rot=frame(end,(x*8,-.25,-1));
            def point(t,u):
                a=(u+1)*math.pi;r=.001+(.0031*math.sin(t*math.pi*.60));r+=.00055*math.cos(a*6)*t**7
                return hp(r*math.cos(a),r*math.sin(a),.008*t-.0012*math.cos(a*6)*t**8)
            petals.grid(point,12,24,0);core.sphere(hp(0,0,.004),(.001,.001,.001),4,6,3)
        for a in [2.7,.15]:leaf((0,0,.018),a,.15,.030,1.1)
    elif kind=='gypsophila':
        ends=[]
        for j in range(16):
            a=j*GOLDEN;z=height*(.52+.025*j);base=Vector((0,0,z));end=Vector((.11*math.cos(a),.095*math.sin(a),height*(.82+.01*j)))
            stems.tube([base,base.lerp(end,.48)+Vector((0,0,.015)),end],.00065,3,6)
            for k in range(7):
                aa=a+k*GOLDEN;tip=end+Vector((.022*math.cos(aa),.020*math.sin(aa),rng.uniform(.006,.043)))
                stems.tube([end,tip],.00032,3,5);ends.append(tip)
        for n,center in enumerate(ends):
            if n%8==0:core.sphere(center,(.0016,.0016,.0023),7,8,4);continue
            hp,rot=frame(center,(rng.uniform(-.6,.6),rng.uniform(-1,.2),rng.uniform(.4,1)))
            for layer in range(2):
                for k in range(5):
                    a=TAU*k/5+layer*.6;r=diameter/2*(1-.22*layer)
                    def point(t,u,a=a,r=r,layer=layer):
                        rr=.0004+r*t;w=r*.60*math.sin(math.pi*t)**.6
                        return hp(rr*math.cos(a)-u*w*math.sin(a),rr*math.sin(a)+u*w*math.cos(a),.0005*layer+.0018*math.sin(math.pi*t)+.0004*u*u)
                    petals.grid(point,5,4,k%2)
            core.sphere(center,(.001,.001,.001),7,6,3)
        spec['headCenter']=[0,0,height*.94];spec['headDiameterM']=.25
    elif kind=='eucalyptus':
        for j in range(9):
            z=.19+j*.047;a=j*.52
            for side in [0,math.pi]:
                aa=a+side;base=Vector((.001,0,z));attach=base+Vector((.01*math.cos(aa),.01*math.sin(aa),.002))
                stems.tube([base,attach],.0007,3,6);leaf(attach,aa,.051-j*.0016,.025-j*.0007,.27,True,roll=rng.uniform(.70,1.25)*(-1 if side else 1))
        spec['headCenter']=[0,0,height*.78];spec['headDiameterM']=.18
    elif kind=='craspedia':
        radius=diameter/2;core.sphere(top,(radius*.97,)*3,4,24,14)
        for j in range(580):
            z=1-2*(j+.5)/580;r=math.sqrt(1-z*z);a=j*GOLDEN;direction=Vector((r*math.cos(a),r*math.sin(a),z))
            center=top+direction*radius;rot=Vector((0,0,1)).rotation_difference(direction)
            core.sphere(center,(.00055,.00055,.0011),4 if j%3 else 0,6,4,rot)
    # Warp the complete hierarchy together so petioles stay attached to the stem.
    for batch in [petals,core,stems,leaves,veins]:
        batch.v=[(x+.004*math.sin(math.pi*1.25*z/height),y+.002*math.sin(math.pi*1.5*z/height),z) for x,y,z in batch.v]
    petals.object(.00013);core.object();stems.object();leaves.object(.0002);veins.object()
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj['logicalStems']=1;obj['productId']=spec['productId'];obj['archetype']=kind

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--spec',required=True);p.add_argument('--out',required=True);p.add_argument('--samples',type=int,default=8);p.add_argument('--no-render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);path=Path(args.spec).resolve();spec=json.loads(path.read_text(encoding='utf-8'))
    spec['inputSpecSha256']=sha256(path.read_bytes()).hexdigest();spec['builderSha256']=sha256(Path(__file__).read_bytes()).hexdigest();build(spec);finish(args.out,spec,args.samples,not args.no_render)
