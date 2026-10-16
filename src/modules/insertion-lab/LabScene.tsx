'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { FLOWERS, VESSELS, JOINTS, cloneRod, moveTip, settleRod,supportMetrics,type Kind, type LabDesign, type Point, type Rod } from './rod';
import { PLACEMENT_ASSETS, placementGeometry } from './placement-geometry';
import { modeOf } from './placement';
import {supportedBetween} from './seating';
import { bloomOf, contactsFor, limitBloomMove } from './contact';
import { flowerSurface, glassSurface, surfaceGrain } from './surfaces';
import { prepareTissue, stepTissue, targetTissue, type Tissue } from './tissue';
import { applyStemSweep, prepareStemSweep, type StemSweep } from './stem-sweep';
import {settleSupportedRod,SETTLE_DURATION} from './support';
import {limitStemMove,stemClearance} from './stem-contact';
import {solveArrangementDrag} from './drag-solver';

export type LabView = 'orbit' | 'front' | 'side' | 'top';
type Props = {
  design: LabDesign; selected: string | null; view: LabView; traces: boolean;
  contacts: boolean; detailed: boolean; gentle:boolean; onContact: (count:number)=>void;
  onSelect: (id: string | null) => void; onCommit: (rod: Rod) => void;
  onReady: (error?: string) => void; onFeedback: (message: string) => void;
};
type Plant = { group: THREE.Object3D; bones: { bone: THREE.Bone; bind: THREE.Matrix4; station: number }[]; meshes: THREE.Mesh[]; tissues:Tissue[]; sweeps:StemSweep[]; line: THREE.Line; rod: Rod; source: string };
type Runtime = { sync: () => void; select: () => void; camera: () => void };
const up = new THREE.Vector3(0,1,0);

export default function LabScene(props: Props) {
  const host=useRef<HTMLDivElement>(null),latest=useRef(props),runtime=useRef<Runtime|null>(null);
  latest.current=props;
  useEffect(()=> {
    const container=host.current;if(!container)return;
    let stopped=false,frame=0,dirty=true,loaded=false,contactDirty=true,lastTime=0,lastContactCount=-1;
    let renderer: THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
    catch{latest.current.onReady('浏览器未能启动 3D。请检查图形加速后重试。');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.setClearColor('#edf0e8');
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-label','花姿实验三维画布');
    renderer.domElement.style.touchAction='none';container.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.45,.45,.45,-.45,.01,10);
    scene.background=new THREE.Color('#edf0e8');const grain=surfaceGrain();
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.12;controls.enablePan=false;
    controls.minZoom=.65;controls.maxZoom=2.2;controls.maxPolarAngle=Math.PI*.49;
    controls.target.set(0,.33,0);controls.addEventListener('change',()=>{dirty=true;});
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
    const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
    scene.environmentIntensity=.6;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#fff9ee','#a6b3a2',.9));
    const key=new THREE.DirectionalLight('#fff9f0',2);key.position.set(-.5,1.2,.8);
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-.55;key.shadow.camera.right=.55;
    key.shadow.camera.top=.8;key.shadow.camera.bottom=-.4;key.shadow.camera.near=.01;key.shadow.camera.far=4;
    key.shadow.normalBias=.001;scene.add(key);
    const rim=new THREE.DirectionalLight('#fffdf5',1.3);rim.position.set(.5,.8,-.8);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#edf0e8',roughness:1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.002;floor.receiveShadow=true;scene.add(floor);
    const plants=new Map<string,Plant>(),flowerSources=new Map<string,THREE.Group>(),vaseSources=new Map<string,THREE.Group>();
    const originals:THREE.Group[]=[];let vase:THREE.Object3D|null=null,currentVase='';
    const vaseMaterials:THREE.Material[]=[];
    const loader=new GLTFLoader();
    let drag:{id:string;plane:THREE.Plane;offset:THREE.Vector3;start:Rod;rod:Rod;x:number;y:number;moved:boolean;pointerId:number;requested:Point;contactLimited:boolean;advance:boolean;released:number|null}|null=null;
    let settling:{id:string;from:Rod;to:Rod;elapsed:number}|null=null;
    const perf:{solve:number;mesh:number;tissue:number;render:number;frame:number}[]=[];
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
    const tint=()=> {
      for(const [id,plant] of plants) for(const mesh of plant.meshes) {
        for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
          if(mat instanceof THREE.MeshStandardMaterial){mat.emissive.set(id===latest.current.selected?'#75936c':'#000000');mat.emissiveIntensity=id===latest.current.selected ? .035 : 0;}
        }
      }
      dirty=true;
    };
    function applyPose(plant: Plant,rod: Rod) {
      if(rod.placement) {
        const geometry=placementGeometry(rod.kind,FLOWERS[rod.kind].length,rod.placement,rod.mouth,rod.twist,VESSELS[latest.current.design.vessel].height);
        plant.group.position.fromArray(geometry.origin);
        plant.group.quaternion.setFromUnitVectors(up,new THREE.Vector3().fromArray(rod.placement.direction)).multiply(new THREE.Quaternion().setFromAxisAngle(up,rod.twist));
        plant.group.scale.setScalar(geometry.scale);plant.group.updateMatrixWorld(true);
        for(const sweep of plant.sweeps)applyStemSweep(sweep,geometry,rod.placement.bend,rod.placement.insertion,plant.tissues.find(t=>t.mesh===sweep.mesh),rod.placement.seated);
        updateTrace(plant,rod);return;
      }
      const ds=FLOWERS[rod.kind].length/(JOINTS-1),p=new THREE.Vector3(),tangent=new THREE.Vector3();
      const orientation=new THREE.Quaternion(),twist=new THREE.Quaternion(),delta=new THREE.Matrix4();
      const inverse=new THREE.Matrix4(),origin=new THREE.Matrix4(),pose=new THREE.Matrix4();
      plant.group.updateMatrixWorld(true);
      for(const {bone,bind,station} of plant.bones) {
        const i=Math.min(JOINTS-1,station),before=rod.points[Math.max(0,i-1)],after=rod.points[Math.min(JOINTS-1,i+1)];
        p.fromArray(rod.points[i]);tangent.set(after[0]-before[0],after[1]-before[1],after[2]-before[2]).normalize();
        orientation.setFromUnitVectors(up,tangent);twist.setFromAxisAngle(up,rod.twist);orientation.multiply(twist);
        delta.compose(p,orientation,new THREE.Vector3(1,1,1));origin.makeTranslation(0,-i*ds,0);
        pose.copy(delta).multiply(origin).multiply(bind);
        inverse.copy(bone.parent?.matrixWorld??new THREE.Matrix4()).invert();
        bone.matrixAutoUpdate=false;bone.matrix.copy(inverse).multiply(pose);bone.matrixWorldNeedsUpdate=true;
      }
      plant.group.updateMatrixWorld(true);
      for(const mesh of plant.meshes)if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();
      updateTrace(plant,rod);
    }
    function updateTrace(plant:Plant,rod:Rod) {
      const attribute=plant.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      rod.points.forEach((point,i)=>attribute.setXYZ(i,...point));attribute.needsUpdate=true;
      plant.line.geometry.computeBoundingSphere();plant.line.visible=latest.current.traces;
      plant.rod=cloneRod(rod);dirty=true;contactDirty=true;
    }
    const releasePlant=(plant:Plant)=> {
      scene.remove(plant.group,plant.line);plant.line.geometry.dispose();(plant.line.material as THREE.Material).dispose();
      plant.group.traverse(node=>{if(node instanceof THREE.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();});
      plant.sweeps.forEach(s=>s.mesh.geometry.dispose());
    };
    const releaseVase=()=>{if(vase)scene.remove(vase);vaseMaterials.splice(0).forEach(m=>m.dispose());};
    const sync=()=> {
      if(!loaded)return;
      const {design}=latest.current;
      const ids=new Set(design.rods.map(r=>r.id));
      for(const [id,plant]of plants)if(!ids.has(id)){releasePlant(plant);plants.delete(id);}
      if(currentVase!==design.vessel){releaseVase();vase=vaseSources.get(design.vessel)!.clone(true);
        vase.traverse(node=>{if(node instanceof THREE.Mesh){const materials=(Array.isArray(node.material)?node.material:[node.material]).map(m=>design.vessel==='glass'?glassSurface():m.clone());vaseMaterials.push(...materials);node.material=Array.isArray(node.material)?materials:materials[0];node.castShadow=design.vessel!=='glass';}});
        scene.add(vase);currentVase=design.vessel;}
      for(const rod of design.rods) {
        let plant=plants.get(rod.id);
        const asset=`${modeOf(design)}:${rod.kind}`,source=`${asset}:${latest.current.detailed}`;
        if(plant&&plant.source!==source){releasePlant(plant);plants.delete(rod.id);plant=undefined;}
        if(!plant) {
          const group=cloneSkeleton(flowerSources.get(asset)!);scene.add(group);group.updateMatrixWorld(true);
          const bones:Plant['bones']=[],meshes:THREE.Mesh[]=[],tissues:Tissue[]=[],sweeps:StemSweep[]=[];
          group.traverse(node=> {
            if(node instanceof THREE.Bone&&node.name.startsWith('Lab_joint_'))bones.push({bone:node,bind:node.matrixWorld.clone(),station:Number(node.name.slice(-2))});
            if(node instanceof THREE.Mesh) {
              node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;node.userData.stemId=rod.id;
              const material=(Array.isArray(node.material)?node.material:[node.material]).map(original=> {
                return flowerSurface(original,node.name,rod.kind,latest.current.detailed,grain);
              });node.material=Array.isArray(node.material)?material:material[0];
              if(modeOf(design)==='place'){sweeps.push(prepareStemSweep(node,rod.kind,FLOWERS[rod.kind].length));const tissue=prepareTissue(node,rod.kind,false);if(tissue)tissues.push(tissue);}
              meshes.push(node);
            }
          });
          if((modeOf(design)==='bend'&&bones.length!==JOINTS)||!meshes.length)throw new Error('花材数据不完整');
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(JOINTS*3,3));
          const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:FLOWERS[rod.kind].color,depthTest:false,transparent:true,opacity:.9}));
          line.renderOrder=10;scene.add(line);plant={group,bones,meshes,tissues,sweeps,line,rod:cloneRod(rod),source};plants.set(rod.id,plant);
        }
        if(settling?.id===rod.id){
          if(rod===settling.to){const t=Math.min(1,settling.elapsed/SETTLE_DURATION);applyPose(plant,supportedBetween(settling.from,settling.to,t*t*(3-2*t),design.vessel)??settling.from);}
          else{settling=null;applyPose(plant,rod);}
        }else applyPose(plant,rod);
      }
      tint();dirty=true;contactDirty=true;
    };
    const updateCamera=()=> {
      const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;
      // Leave headroom below the mode/view controls on a narrow canvas.
      const aspect=width/height,narrow=width<500,focus=narrow?.36:.32;
      const span=narrow?Math.max(.94,.76/aspect):Math.max(.83,.68/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
      camera.updateProjectionMatrix();renderer.setSize(width,height);
      const v=latest.current.view;
      controls.enableRotate=v==='orbit';controls.target.set(0,focus,0);
      if(v==='orbit')camera.position.set(.65,.64,1.3);
      else if(v==='front')camera.position.set(0,focus+.02,1.5);
      else if(v==='side')camera.position.set(1.5,focus+.02,0);
      else camera.position.set(0,1.7,.001);
      camera.lookAt(controls.target);controls.update();dirty=true;
    };
    const setRay=(event:PointerEvent)=> {
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    };
    // Alpha-aware ray picking. A transparent card must not block a flower behind it.
    const pixels=new Map<THREE.Texture,{data:Uint8ClampedArray;width:number;height:number}|null>();
    const opaque=(intersection:THREE.Intersection)=> {
      const mesh=intersection.object as THREE.Mesh;
      const material=Array.isArray(mesh.material)?mesh.material[intersection.face?.materialIndex??0]:mesh.material;
      if(!(material instanceof THREE.MeshStandardMaterial)||!material.map||!intersection.uv||(!material.alphaTest&&!material.transparent))return true;
      const texture=material.map;
      if(!pixels.has(texture)) {
        try {const img=texture.image as CanvasImageSource&{width:number;height:number};const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0);pixels.set(texture,{data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height});}
        catch{pixels.set(texture,null);}
      }
      const mask=pixels.get(texture);if(!mask)return true;
      const uv=intersection.uv.clone();texture.transformUv(uv);
      const x=Math.max(0,Math.min(mask.width-1,Math.floor(uv.x*mask.width))),y=Math.max(0,Math.min(mask.height-1,Math.floor(uv.y*mask.height)));
      return mask.data[(y*mask.width+x)*4+3]/255>=Math.max(.15,material.alphaTest);
    };
    const pick=()=> {
      for(const plant of plants.values())for(const mesh of plant.meshes)if(mesh instanceof THREE.SkinnedMesh){mesh.computeBoundingSphere();if(mesh.boundingBox)mesh.computeBoundingBox();}
      const vaseHit=vase&&latest.current.design.vessel!=='glass'?raycaster.intersectObject(vase,true)[0]:null;
      const hits=raycaster.intersectObjects([...plants.values()].map(p=>p.group),true).filter(h=>h.object.visible&&opaque(h)&&(!vaseHit||h.distance<vaseHit.distance+.0005));
      const seen=new Set<string>();return hits.filter(h=>{const id=h.object.userData.stemId as string;if(!id||seen.has(id))return false;seen.add(id);return true;});
    };
    const down=(event:PointerEvent)=> {
      if(drag&&drag.released!==null)completeDrag();
      if(event.button!==0||!loaded||drag)return;
      if(settling){const active=plants.get(settling.id);if(active)applyPose(active,settling.to);settling=null;}
      setRay(event);const hits=pick();
      if(!hits.length){latest.current.onSelect(null);return;}
      // Alt-click cycles surfaces under the same ray. Completely hidden strands also have a list entry.
      const index=event.altKey?(hits.findIndex(h=>h.object.userData.stemId===latest.current.selected)+1)%hits.length:0;
      const selectedHit=hits[index],id=selectedHit.object.userData.stemId as string,plant=plants.get(id)!;
      latest.current.onSelect(id);
      const tip=new THREE.Vector3().fromArray(plant.rod.points[JOINTS-1]);
      const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),selectedHit.point);
      raycaster.ray.intersectPlane(plane,hit);
      drag={id,plane,offset:tip.clone().sub(hit),start:cloneRod(plant.rod),rod:cloneRod(plant.rod),x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId,requested:tip.toArray() as Point,contactLimited:false,advance:false,released:null};
      controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);event.stopImmediatePropagation();dirty=true;
    };
    let pending:PointerEvent|null=null;
    const move=(event:PointerEvent)=>{if(drag&&event.pointerId===drag.pointerId)pending=event;};
    const processMove=():{solve:number;mesh:number}|null=> {
      if(!drag)return null;
      if(pending){
        const event=pending;pending=null;
        if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<3&&!drag.moved)return null;
        drag.moved=true;setRay(event);
        if(raycaster.ray.intersectPlane(drag.plane,hit)){drag.requested=hit.clone().add(drag.offset).toArray() as Point;drag.advance=true;}
      }
      if(drag.advance){
        const started=performance.now();
        const placing=modeOf(latest.current.design)==='place',vessel=latest.current.design.vessel;
        const neighbours=[...plants.values()].map(p=>p.rod);
        const before=drag.rod,tip=before.points[24],delta=drag.requested.map((n,i)=>n-tip[i]),remaining=Math.hypot(...delta);
        // Coalesce pointer events and bound each frame's path work. Keep advancing toward
        // the latest target even when no new event arrives, so fast drags still catch up.
        const fraction=Math.min(1,.008/Math.max(1e-9,remaining));
        const target=placing?tip.map((n,i)=>n+delta[i]*fraction) as Point:drag.requested;
        drag.rod=placing?solveArrangementDrag(before,target,neighbours,vessel,latest.current.gentle,latest.current.contacts):moveTip(before,target,vessel);
        const moved=Math.hypot(...drag.rod.points[24].map((n,i)=>n-tip[i]));
        drag.advance=placing&&remaining>.001&&moved>.00015;
        drag.contactLimited=Math.hypot(...drag.requested.map((x,i)=>x-drag!.rod.points[24][i]))>.025;
        const solved=performance.now();
        applyPose(plants.get(drag.id)!,drag.rod);
        return {solve:solved-started,mesh:performance.now()-solved};
      }
      return null;
    };
    const completeDrag=(cancel=false)=> {
      if(!drag)return;
      const current=drag;drag=null;controls.enabled=true;
      if(cancel){applyPose(plants.get(current.id)!,current.start);return;}
      if(current.moved){
        const vessel=latest.current.design.vessel,neighbours=[...plants.values()].map(p=>p.rod);
        let result=settleRod(current.rod);
        if(result.placement?.seated){
          const target=latest.current.gentle?settleSupportedRod(result,vessel):result,bloom=latest.current.contacts?limitBloomMove(result,target,neighbours,vessel):target;
          result=limitStemMove(result,bloom,neighbours,vessel);
          const changed=Math.max(...result.points.map((p,i)=>Math.hypot(...p.map((n,a)=>n-current.rod.points[i][a]))))>1e-7;
          if(changed)settling={id:current.id,from:cloneRod(current.rod),to:result,elapsed:0};
          else applyPose(plants.get(current.id)!,result);
        }else applyPose(plants.get(current.id)!,result);
        latest.current.onCommit(result);
        const tip=result.points[JOINTS-1],residual=Math.hypot(...tip.map((n,i)=>n-current.requested[i]));
        latest.current.onFeedback(current.contactLimited?'碰到邻近花材，继续移动会受阻。':result.placement?.seated?'已保留瓶内支撑，松手后轻微回稳。':modeOf(latest.current.design)==='place'?(residual>.025?'已保留插入深度与瓶口支点；高低请使用单独的插入深度控件调整。':'已调整花姿，插入深度与花茎长度保持不变。'):residual>.025?'已到达花瓶支撑或插入边界，花材停在有效位置。':'已保留新的花姿。');
      }
      dirty=true;
    };
    const finish=(event:PointerEvent,cancel=false)=> {
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!cancel)processMove();pending=null;
      if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
      if(!cancel&&drag?.advance){drag.released=performance.now();return;}
      completeDrag(cancel);
    };
    const upHandler=(event:PointerEvent)=>finish(event),cancelHandler=(event:PointerEvent)=>finish(event,true);
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&drag){const current=drag;drag=null;pending=null;applyPose(plants.get(current.id)!,current.start);controls.enabled=true;if(renderer.domElement.hasPointerCapture(current.pointerId))renderer.domElement.releasePointerCapture(current.pointerId);}};
    renderer.domElement.addEventListener('pointerdown',down,true);renderer.domElement.addEventListener('pointermove',move);
    renderer.domElement.addEventListener('pointerup',upHandler);renderer.domElement.addEventListener('pointercancel',cancelHandler);
    document.addEventListener('keydown',escape);
    const observer=new ResizeObserver(updateCamera);observer.observe(container);updateCamera();
    const animate=(time=0)=> {
      if(stopped)return;const frameStart=performance.now(),moveCost=processMove();
      if(drag?.released!==null&&drag?.released!==undefined&&(!drag.advance||performance.now()-drag.released>=120))completeDrag();
      controls.update();
      const dt=lastTime?Math.min(.05,(time-lastTime)/1000):1/60;lastTime=time;
      if(settling){
        settling.elapsed+=dt;const t=Math.min(1,settling.elapsed/SETTLE_DURATION),plant=plants.get(settling.id);
        if(plant)applyPose(plant,t===1?settling.to:supportedBetween(settling.from,settling.to,t*t*(3-2*t),latest.current.design.vessel)??settling.from);
        if(t===1)settling=null;
      }
      container.dataset.settling=String(!!settling);
      const tissueStart=performance.now();
      if(contactDirty){
        const enabled=latest.current.contacts&&modeOf(latest.current.design)==='place';
        const blooms=[...plants.values()].flatMap(p=>{const b=bloomOf(p.rod,latest.current.design.vessel);return b?[b]:[];});
        const contacts=contactsFor(enabled?blooms:[]);
        const count=[...contacts.values()].reduce((sum,c)=>sum+c.length,0)/2;
        if(count!==lastContactCount){latest.current.onContact(count);lastContactCount=count;}
        container.dataset.contacts=String(count);
        for(const [id,plant]of plants){const bloom=blooms.find(b=>b.id===id)??null;
          for(const tissue of plant.tissues)targetTissue(tissue,bloom,contacts.get(id)??[],enabled?blooms.filter(b=>b.id!==id):[]);}
        contactDirty=false;
      }
      let compression=0;
      for(const plant of plants.values())for(const tissue of plant.tissues){if(tissue.active)dirty=true;compression=Math.max(compression,stepTissue(tissue,dt)*plant.group.scale.x);}
      container.dataset.compression=String(compression);
      const tissueCost=performance.now()-tissueStart;
      let renderCost=0;
      if(dirty){const renderStart=performance.now();renderer.render(scene,camera);renderCost=performance.now()-renderStart;dirty=false;
        // Small observability surface for repeatable UI checks; no production state lives in the DOM.
        const rect=renderer.domElement.getBoundingClientRect();
        container.dataset.heads=JSON.stringify([...plants].map(([id,p])=>{const point=new THREE.Vector3().fromArray(p.rod.points[JOINTS-1]).project(camera);return {id,x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};}));
        container.dataset.rendered='true';
        container.dataset.view=latest.current.view;
        container.dataset.interaction=modeOf(latest.current.design);
        container.dataset.depths=JSON.stringify([...plants].map(([id,p])=>({id,insertion:p.rod.placement?.insertion,mouth:p.rod.mouth,scale:p.group.scale.x})));
        container.dataset.bends=JSON.stringify([...plants].map(([id,p])=>({id,bend:p.rod.placement?.bend??[0,0]})));
        const rods=[...plants.values()].map(p=>p.rod);
        container.dataset.supports=JSON.stringify(rods.map(rod=>({id:rod.id,...supportMetrics(rod,latest.current.design.vessel),root:rod.points[0]})));
        container.dataset.stemGap=String(Math.min(Infinity,...rods.map(rod=>stemClearance(rod,rods))));
      }
      if(moveCost){
        perf.push({...moveCost,tissue:tissueCost,render:renderCost,frame:performance.now()-frameStart});if(perf.length>180)perf.shift();
        container.dataset.performance=JSON.stringify({samples:perf.length,...Object.fromEntries(['solve','mesh','tissue','render','frame'].map(key=>{const values=perf.map(s=>s[key as keyof typeof s]).sort((a,b)=>a-b);return [key,{p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)}];}))});
      }
      frame=requestAnimationFrame(animate);
    };animate();
    runtime.current={sync,select:tint,camera:updateCamera};
    void (async()=> {
      try{
        const entries=[...Object.entries(FLOWERS).map(([id,f])=>({id:`bend:${id}`,url:f.model,flower:true})),...Object.entries(PLACEMENT_ASSETS).map(([id,f])=>({id:`place:${id}`,url:f.model,flower:true})),...Object.entries(VESSELS).map(([id,v])=>({id,url:v.model,flower:false}))];
        const results=await Promise.allSettled(entries.map(async entry=> {
          const gltf=await loader.loadAsync(entry.url);originals.push(gltf.scene);return {entry,group:gltf.scene};
        }));
        if(stopped){disposeOriginals();return;}
        for(const result of results){if(result.status==='rejected')throw result.reason;const {entry,group}=result.value;
          group.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;}});
          if(entry.flower)flowerSources.set(entry.id,group);else vaseSources.set(entry.id,group);
        }
        loaded=true;sync();latest.current.onReady();container.dataset.loaded='true';
      }catch(error){if(!stopped)latest.current.onReady('花材加载失败：'+(error instanceof Error?error.message:'请刷新后重试'));}
    })();
    function disposeOriginals(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();for(const group of originals)group.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());originals.length=0;}
    return ()=> {
      stopped=true;runtime.current=null;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();document.removeEventListener('keydown',escape);
      renderer.domElement.removeEventListener('pointerdown',down,true);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',upHandler);renderer.domElement.removeEventListener('pointercancel',cancelHandler);
      for(const plant of plants.values())releasePlant(plant);releaseVase();disposeOriginals();grain.bump.dispose();grain.rough.dispose();
      floor.geometry.dispose();(floor.material as THREE.Material).dispose();environment.dispose();key.shadow.dispose();pixels.clear();renderer.dispose();renderer.domElement.remove();
    };
  },[]);
  useEffect(()=>{runtime.current?.sync();},[props.design,props.traces,props.contacts,props.detailed]);
  useEffect(()=>{runtime.current?.select();},[props.selected]);
  useEffect(()=>{runtime.current?.camera();},[props.view]);
  return <div ref={host} style={{position:'absolute',inset:0}} data-testid="insertion-scene"/>;
}
