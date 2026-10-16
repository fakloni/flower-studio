'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './trial.module.css';

const assetRoot = '/assets/texture-trial/';
const modes = [
  { title: '原始图片', note: '保留原图的固定光影', normal: null },
  { title: 'Laigter 光照贴图', note: '从图片估计表面起伏', normal: 'rose-original_n.png' },
  { title: 'Blender 材质贴图', note: '分别输出颜色、表面方向与遮蔽', normal: 'rose-blender-normal.png' },
];

export default function FlowerTextureTrial() {
  const hosts = useRef<Array<HTMLDivElement | null>>([]);
  const runtime = useRef<null | ((angle: number, strength: number, detail: boolean) => void)>(null);
  const settings = useRef({ angle: -55, strength: .7, detail: true });
  const [angle, setAngle] = useState(-55);
  const [strength, setStrength] = useState(.7);
  const [detail, setDetail] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const textures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    async function setup() {
      const loadedTextures = await Promise.all([
        loader.loadAsync(assetRoot + 'rose-original.png'),
        loader.loadAsync(assetRoot + 'rose-original_n.png'),
        loader.loadAsync(assetRoot + 'rose-blender-normal.png'),
        loader.loadAsync(assetRoot + 'rose-blender-color.png'),
        loader.loadAsync(assetRoot + 'rose-blender-ao.png'),
      ]);
      textures.push(...loadedTextures);
      if (cancelled) { textures.forEach(texture => texture.dispose()); return; }
      loadedTextures[0].colorSpace = THREE.SRGBColorSpace;
      loadedTextures[3].colorSpace = THREE.SRGBColorSpace;
      const renderers: Array<(angle: number, strength: number, detail: boolean) => void> = [];
      modes.forEach((mode, index) => {
        const host = hosts.current[index];
        if (!host) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute('aria-label', mode.title + '玫瑰对照');
        host.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 10);
        camera.position.z = 2;
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
          transparent: true,
          uniforms: {
            uColor: { value: loadedTextures[index === 2 ? 3 : 0] },
            uMask: { value: loadedTextures[0] },
            uAO: { value: loadedTextures[4] },
            uMaterial: { value: index === 2 ? 1 : 0 },
            uNormal: { value: loadedTextures[index || 1] },
            uLit: { value: index === 0 ? 0 : 1 },
            uStrength: { value: settings.current.strength },
            uLight: { value: new THREE.Vector3() },
            uBounds: { value: new THREE.Vector4() },
          },
          vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader: `
            uniform sampler2D uColor; uniform sampler2D uNormal; uniform sampler2D uMask; uniform sampler2D uAO;
            uniform float uMaterial;
            uniform float uLit; uniform float uStrength;
            uniform vec3 uLight; uniform vec4 uBounds; varying vec2 vUv;
            void main(){
              vec2 uv=uBounds.xy+vUv*uBounds.zw;
              vec4 color=texture2D(uColor,uv);
              color.a=texture2D(uMask,uv).a;
              if(color.a<.002) discard;
              vec3 n=texture2D(uNormal,uv).xyz*2.0-1.0;
              // Thin petals can show their back face. Orient those visible
              // surface normals towards the fixed camera, as a double-sided material does.
              if(n.z<0.0) n=-n;
              n=normalize(mix(vec3(0.0,0.0,1.0),n,uStrength)+vec3(0.0,0.0,.00001));
              float diffuse=max(dot(n,uLight),0.0);
              float factor=(.60+.55*diffuse)/(.60+.55*max(uLight.z,0.0));
              factor*=mix(1.0,.78+.22*texture2D(uAO,uv).r,uMaterial);
              gl_FragColor=vec4(color.rgb*mix(1.0,factor,uLit),color.a);
              #include <colorspace_fragment>
            }`,
        });
        const flower = new THREE.Mesh(geometry, material);
        scene.add(flower);
        const update = (a: number, s: number, d: boolean) => {
          const radians = a * Math.PI / 180;
          material.uniforms.uLight.value.set(Math.sin(radians), .3, Math.cos(radians)).normalize();
          material.uniforms.uStrength.value = s;
          material.uniforms.uBounds.value.set(...(d ? [260 / 500, 1 - 330 / 680, 225 / 500, 200 / 680] : [0, 0, 1, 1]) as [number, number, number, number]);
          flower.scale.set(d ? 1.12 : .9, d ? 1 : 1.224, 1);
          renderer.render(scene, camera);
        };
        const resize = () => {
          const width = host.clientWidth, height = host.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height);
          const aspect = width / height;
          camera.left = -1.5 * aspect; camera.right = 1.5 * aspect;
          camera.updateProjectionMatrix();
          const current = settings.current;
          update(current.angle, current.strength, current.detail);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
        renderers.push(update);
        cleanups.push(() => { observer.disconnect(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
      });
      runtime.current = (a, s, d) => renderers.forEach(render => render(a, s, d));
      setLoaded(true);
    }
    setup().catch(() => { if (!cancelled) setError('贴图加载或渲染失败，请刷新后重试。'); });
    return () => { cancelled = true; runtime.current = null; cleanups.forEach(cleanup => cleanup()); textures.forEach(texture => texture.dispose()); };
  }, []);

  function change(a: number, s: number, d: boolean) {
    settings.current = { angle: a, strength: s, detail: d };
    runtime.current?.(a, s, d);
    setAngle(a); setStrength(s); setDetail(d);
  }

  return <main className={styles.page}>
    <header className={styles.header}><a href="/">FlowerStudio</a><span>花材贴图试验 · 粉玫瑰</span></header>
    <h1>同一朵花，比较三种光影</h1>
    <p className={styles.intro}>同一朵玫瑰、同一视角。调整侧光，比较原图、图片生成贴图和模型输出贴图。</p>
    <div className={styles.controls}>
      <label>侧光方向 <output>{angle}°</output><input aria-label="侧光方向" type="range" min="-80" max="80" value={angle} onChange={e => change(+e.target.value, strength, detail)} /></label>
      <label>起伏强度 <output>{Math.round(strength * 100)}%</output><input aria-label="起伏强度" type="range" min="0" max="1" step=".05" value={strength} onChange={e => change(angle, +e.target.value, detail)} /></label>
      <button type="button" onClick={() => change(angle, strength, !detail)}>{detail ? '查看完整花枝' : '查看花头细节'}</button>
    </div>
    <div className={styles.status} aria-live="polite">{error || (loaded ? (angle < 0 ? '左侧光' : '右侧光') + ' · ' + (detail ? '花头细节' : '完整花枝') : '正在加载贴图…')}</div>
    <section className={styles.comparison} aria-label="三种光影对照">
      {modes.map((mode, index) => <figure key={mode.title} className={styles.panel}>
        <div className={styles.render} ref={el => { hosts.current[index] = el; }} />
        <figcaption><strong>{mode.title}</strong><span>{mode.note}</span></figcaption>
      </figure>)}
    </section>
    <p className={styles.limit}>原图与 Laigter 组使用已有颜色图片；Blender 组分别输出材质颜色、法线与遮蔽信息。来源纹理仍可能带有明暗。三组共用原图轮廓，均为固定视角图片，没有增加真实厚度或物理碰撞。</p>
    <section className={styles.matting}>
      <div><h2>抠图也要单独验收</h2><p>给已有透明玫瑰添加统一背景，再用 rembg 恢复透明边缘，检查细茎是否丢失。Krita 负责分层文件的合成导出。</p></div>
      <figure><img src="/assets/texture-trial/rose-original.png" alt="原始玫瑰透明边缘" /><figcaption>原始透明素材</figcaption></figure>
      <figure><img src="/assets/texture-trial/rose-rembg.png" alt="rembg 恢复的玫瑰透明边缘" /><figcaption>rembg 抠图结果</figcaption></figure>
    </section>
  </main>;
}
