'use client';
import { useEffect,useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { flowerMap,vases } from '../catalog/data';
import type { Design,Vector3 } from '../design/model';
import { fitStemToInsertion } from './insertion';

export type View = 'front' | 'side' | 'top';
type Props = { design:Design; selected:string|null; view:View; zoom:number; onSelect:(id:string|null)=>void; onMove:(id:string,position:Vector3)=>void; onStatus:(state:'loading'|'ready'|'error',message?:string)=>void };
type Runtime = { sync:()=>void; updateSelection:()=>void; updateCamera:()=>void; retry:()=>void };

export default function SceneCanvas(props:Props) {
  const host=useRef<HTMLDivElement>(null);const latest=useRef(props);latest.current=props;const runtime=useRef<Runtime|null>(null);
  useEffect(()=>{
    const container=host.current;if(!container)return;
    let stopped=false;let revision=0;let frame=0;
    let renderer:THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'}); }
    catch { latest.current.onStatus('error','当前浏览器暂时无法显示 3D，可切换图片预览。');return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.localClippingEnabled=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;
    renderer.domElement.setAttribute('aria-label','可旋转的插花 3D 画布');container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.01,15);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.enableZoom=false;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.05;
    const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#fffdf5','#b3b7a2',1.5));
    const light=new THREE.DirectionalLight('#fff9ee',2.3);light.position.set(-.55,1.2,.85);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-.65;light.shadow.camera.right=.65;light.shadow.camera.top=.9;light.shadow.camera.bottom=-.25;light.shadow.camera.near=.01;light.shadow.camera.far=4;light.shadow.bias=-.0005;light.shadow.normalBias=.001;scene.add(light);
    const fill=new THREE.DirectionalLight('#eef2ff',1.2);fill.position.set(.6,.7,-.6);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(.17,64),new THREE.ShadowMaterial({opacity:.09}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
    const binding=new THREE.Mesh(new THREE.CylinderGeometry(.022,.019,.014,32),new THREE.MeshStandardMaterial({color:'#a4ae8e',roughness:.9}));binding.position.y=.22;binding.visible=false;scene.add(binding);
    const stemClip=new THREE.Plane(new THREE.Vector3(0,1,0),-.22);
    const objects=new Map<string,THREE.Group>();const offsets=new Map<string,THREE.Vector3>();const anchors=new Map<string,THREE.Vector3>();let vase:THREE.Group|null=null;let currentVase='';let selection:THREE.BoxHelper|null=null;
    const assets=new Map<string,Promise<THREE.Group>>();const originals=new Set<THREE.Group>();const fittedGeometry=new Map<THREE.BufferGeometry,THREE.BufferGeometry>();const loader=new GLTFLoader();
    const load=(url:string)=>{
      if(!assets.has(url))assets.set(url,loader.loadAsync(url).then(gltf=>{if(stopped){dispose(gltf.scene);return gltf.scene;} originals.add(gltf.scene);return gltf.scene;}));
      return assets.get(url)!;
    };
    function dispose(group:THREE.Object3D) {group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material]){for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();material.dispose();}}});}
    function releaseInstance(group:THREE.Object3D){group.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();});}
    function clone(source:THREE.Group,plant=false,flowerId?:string):THREE.Group {
      const result=source.clone(true);
      result.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;const materials=(Array.isArray(object.material)?object.material:[object.material]).map(original=>{const material=original.clone() as THREE.MeshStandardMaterial;material.side=THREE.DoubleSide;if(material.transparent && (material.map || material.alphaMap)){material.alphaTest=.3;material.depthWrite=true;}material.envMapIntensity=.6;if(plant){material.clippingPlanes=latest.current.design.scene==='vase'?[stemClip]:null;material.clipShadows=true;}return material;});object.material=Array.isArray(object.material)?materials:materials[0];}});
      if(plant){
        const pivot=new THREE.Group();pivot.add(result);
        // Normalize the source flower's viewing direction separately from the user's pose.
        if(flowerId==='pink-rose')result.rotation.y=-1.5;
        if(flowerId==='white-tulip')result.rotation.y=-1.3;
        if(flowerId && !anchors.has(flowerId)){
          result.updateMatrixWorld(true);const points:THREE.Vector3[]=[];const point=new THREE.Vector3();const closest=new THREE.Vector3();let nearest=Infinity;
          result.traverse(node=>{
            const name=node.name.toLowerCase();
            if(!(node instanceof THREE.Mesh)||(name.includes('leaf')&&!name.includes('leafless')))return;
            if(flowerId==='eucalyptus'&&!node.name.includes('main-stem'))return;
            const positions=node.geometry.getAttribute('position');
            for(let index=0;index<positions.count;index++){
              point.fromBufferAttribute(positions,index).applyMatrix4(node.matrixWorld);const distance=Math.abs(point.y-.18);
              if(distance<.006)points.push(point.clone());if(distance<nearest){nearest=distance;closest.copy(point);}
            }
          });
          const anchor=points.length ? points.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).divideScalar(points.length) : closest;
          anchors.set(flowerId,anchor);
        }
        // Gather the lower stem sections at the insertion point, preserving the upper silhouette.
        const anchor=flowerId ? anchors.get(flowerId) : undefined;
        if(anchor)result.traverse(node=>{
          if(!(node instanceof THREE.Mesh))return;
          const sourceGeometry=node.geometry;
          node.userData.sourceGeometry=sourceGeometry;
          if(!fittedGeometry.has(sourceGeometry)){
            const geometry=sourceGeometry.clone();const positions=geometry.getAttribute('position');const inverse=node.matrixWorld.clone().invert();const point=new THREE.Vector3();
            for(let index=0;index<positions.count;index++){
              point.fromBufferAttribute(positions,index).applyMatrix4(node.matrixWorld);
              point.fromArray(fitStemToInsertion(point.toArray() as Vector3,anchor.toArray() as Vector3));
              point.applyMatrix4(inverse);positions.setXYZ(index,point.x,point.y,point.z);
            }
            geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();fittedGeometry.set(sourceGeometry,geometry);
          }
          node.geometry=fittedGeometry.get(sourceGeometry)!;
        });
        return pivot;
      }
      return result;
    }
    const updateSelection=()=>{
      if(selection){scene.remove(selection);selection.geometry.dispose();(selection.material as THREE.Material).dispose();selection=null;}
      const chosen=latest.current.selected && objects.get(latest.current.selected);
      if(chosen){selection=new THREE.BoxHelper(chosen,'#6b886f');scene.add(selection);}
    };
    const updateCamera=()=>{
      const {view,zoom}=latest.current;const width=container.clientWidth;const height=container.clientHeight;if(!width||!height)return;
      const aspect=width/height;const bounds=new THREE.Box3();const itemBounds=new THREE.Box3();
      for(const object of objects.values()){object.updateMatrixWorld(true);bounds.union(itemBounds.setFromObject(object));}
      if(vase){vase.updateMatrixWorld(true);bounds.union(itemBounds.setFromObject(vase));}
      const high=bounds.isEmpty()? .58 : Math.max(.58,bounds.max.y);const centerY=high/2;
      const spread=bounds.isEmpty()? .25 : Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z);
      const fittedHeight=Math.max(.63,high+.09,(spread+.08)/aspect);
      const visibleHeight=fittedHeight/(zoom*(window.innerWidth<=1023?1.02:1));camera.left=-visibleHeight*aspect/2;camera.right=visibleHeight*aspect/2;camera.top=visibleHeight/2;camera.bottom=-visibleHeight/2;camera.updateProjectionMatrix();
      controls.target.set(0,centerY,0);
      if(view==='front')camera.position.set(0,centerY+.41,1.4);else if(view==='side')camera.position.set(1.4,centerY+.41,0);else camera.position.set(.001,centerY+1.36,.001);
      camera.lookAt(controls.target);controls.update();renderer.setSize(width,height);
    };
    const sync=async()=>{
      const token=++revision;const {design}=latest.current;latest.current.onStatus('loading');
      try {
        const urls=[...new Set(design.stems.map(stem=>flowerMap[stem.flowerId].model))];const chosenVase=vases.find(item=>item.id===design.vaseId)!;
        const needsVase=design.scene==='vase';
        binding.visible=!needsVase&&design.stems.length>0;
        floor.visible=needsVase;
        stemClip.constant=-(chosenVase.height/100-.008);
        const sources=await Promise.all(urls.map(url=>load(url)));
        const vaseSource=needsVase ? await load(chosenVase.model) : null;
        if(stopped||token!==revision)return;
        const sourceMap=new Map(urls.map((url,index)=>[url,sources[index]]));
        const wanted=new Set(design.stems.map(stem=>stem.id));
        for(const [id,object] of objects)if(!wanted.has(id)){scene.remove(object);releaseInstance(object);objects.delete(id);offsets.delete(id);}
        for(const stem of design.stems){
          let object=objects.get(stem.id);
          if(object && object.userData.flowerId!==stem.flowerId){scene.remove(object);releaseInstance(object);objects.delete(stem.id);object=undefined;}
          if(!object){object=clone(sourceMap.get(flowerMap[stem.flowerId].model)!,true,stem.flowerId);object.userData={stemId:stem.id,flowerId:stem.flowerId};objects.set(stem.id,object);scene.add(object);}
          object.position.fromArray(stem.position);object.rotation.set(...stem.rotation);object.scale.setScalar(stem.scale);
          const localAnchor=(anchors.get(stem.flowerId)??new THREE.Vector3(0,.18,0)).clone().multiplyScalar(stem.scale).applyQuaternion(object.quaternion);
          const insertionY=needsVase ? chosenVase.height/100 : .22;
          object.position.set(stem.position[0]-localAnchor.x,insertionY+stem.position[1]-.06-localAnchor.y,stem.position[2]-localAnchor.z);
          offsets.set(stem.id,object.position.clone().sub(new THREE.Vector3(...stem.position)));
          object.traverse(node=>{if(node instanceof THREE.Mesh){const sourceGeometry=node.userData.sourceGeometry as THREE.BufferGeometry|undefined;if(sourceGeometry)node.geometry=needsVase?fittedGeometry.get(sourceGeometry)!:sourceGeometry;for(const material of Array.isArray(node.material)?node.material:[node.material])material.clippingPlanes=needsVase?[stemClip]:null;}});
        }
        if(vase && (!needsVase||currentVase!==design.vaseId)){scene.remove(vase);releaseInstance(vase);vase=null;}
        if(!vase && vaseSource){vase=clone(vaseSource);scene.add(vase);currentVase=design.vaseId;}
        updateSelection();updateCamera();latest.current.onStatus('ready');
      } catch {if(!stopped&&token===revision)latest.current.onStatus('error','部分素材未加载，请重试或切换图片预览。');}
    };
    const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();const plane=new THREE.Plane();const hitPoint=new THREE.Vector3();
    let drag:{id:string;start:THREE.Vector3;offset:THREE.Vector3;x:number;y:number;moved:boolean}|null=null;
    const setPointer=(event:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);};
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;setPointer(event);
      const intersections=raycaster.intersectObjects([...objects.values()],true);const first=intersections.find(hit=>latest.current.design.scene!=='vase'||stemClip.distanceToPoint(hit.point)>=0);
      if(!first){latest.current.onSelect(null);return;}
      let object:THREE.Object3D|null=first.object;while(object && !object.userData.stemId)object=object.parent;
      if(!object)return;const id=object.userData.stemId as string;latest.current.onSelect(id);
      const normal=camera.getWorldDirection(new THREE.Vector3());plane.setFromNormalAndCoplanarPoint(normal,object.position);
      raycaster.ray.intersectPlane(plane,hitPoint);drag={id,start:object.position.clone(),offset:object.position.clone().sub(hitPoint),x:event.clientX,y:event.clientY,moved:false};
      controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);event.stopImmediatePropagation();
    };
    const move=(event:PointerEvent)=>{if(!drag)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>3)drag.moved=true;setPointer(event);if(raycaster.ray.intersectPlane(plane,hitPoint)){const object=objects.get(drag.id);object?.position.copy(hitPoint).add(drag.offset);selection?.update();}};
    const up=(event:PointerEvent)=>{if(!drag)return;const object=objects.get(drag.id);if(object){if(drag.moved)latest.current.onMove(drag.id,object.position.clone().sub(offsets.get(drag.id)??new THREE.Vector3()).toArray() as Vector3);else object.position.copy(drag.start);}drag=null;controls.enabled=true;if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);};
    const cancel=(event:PointerEvent)=>{if(drag){objects.get(drag.id)?.position.copy(drag.start);drag=null;controls.enabled=true;if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);}};
    renderer.domElement.addEventListener('pointerdown',down,true);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
    const observer=new ResizeObserver(updateCamera);observer.observe(container);updateCamera();
    const animate=()=>{if(stopped)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);};animate();
    runtime.current={sync:()=>void sync(),updateSelection,updateCamera,retry:()=>{assets.clear();void sync();}};void sync();
    return ()=>{stopped=true;++revision;runtime.current=null;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down,true);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);for(const object of objects.values())releaseInstance(object);if(vase)releaseInstance(vase);for(const object of originals)dispose(object);for(const geometry of fittedGeometry.values())geometry.dispose();selection?.geometry.dispose();if(selection)(selection.material as THREE.Material).dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();binding.geometry.dispose();(binding.material as THREE.Material).dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  useEffect(()=>{runtime.current?.sync();},[props.design]);
  useEffect(()=>{runtime.current?.updateSelection();},[props.selected]);
  useEffect(()=>{runtime.current?.updateCamera();},[props.view,props.zoom]);
  return <div ref={host} className="three-scene" data-testid="three-scene"/>;
}
