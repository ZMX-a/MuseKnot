import React, { useState, useEffect, useRef, useMemo } from 'react';
import htm from 'htm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { arrangeForest, demoGraph } from './forest-data.js';
const html = htm.bind(React.createElement);
const colors = ['#49866b','#73a98a','#467b70','#9daf80','#367566'];
const r4TreeLayers = [
  ['01-background-repaired-source-gradient.png', 'tree-r4-layer tree-r4-background'],
  ['04-trunk-main-branches-fixed.png', 'tree-r4-layer'],
  ['05-branch-attachment-fixed.png', 'tree-r4-layer'],
  ['06-ambiguous-residual-fixed.png', 'tree-r4-layer'],
  ['07-local-tree-repair-fixed.png', 'tree-r4-layer'],
  ['08-back-foliage-movable.png', 'tree-r4-layer'],
  ['09-middle-foliage-movable.png', 'tree-r4-layer'],
  ['10-front-foliage-movable.png', 'tree-r4-layer'],
];

// Sculptural graph nodes: size encodes degree, shape encodes note type.
function makeNode(node,i) {
  const group=new THREE.Group();
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
  const mesh=(geo,material,x,y,z)=>{const o=new THREE.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;o.userData.node=node;group.add(o);return o;};
  if(node.type==='oc') {
    mesh(new THREE.OctahedronGeometry(.36),mat('#e8c784',{metalness:.35,roughness:.3,emissive:'#9c6e22',emissiveIntensity:.15}),0,.85,0);
    mesh(new THREE.CylinderGeometry(.05,.07,.55,8),mat('#ad8c53'),0,.3,0);
  } else if(node.insp?.type==='weave') {
    mesh(new THREE.TorusKnotGeometry(.5,.13,80,10,2,3),mat('#e2bd71',{metalness:.45,roughness:.3}),0,1.2,0).rotation.x=.25;
    mesh(new THREE.CylinderGeometry(.38,.55,.14,32),mat('#a99061'),0,.05,0);
  } else {
    mesh(new THREE.CylinderGeometry(.09,.14,1.1,7),mat('#93704e'),0,.5,0);
    const leaf=mat(colors[i%colors.length],{flatShading:true});
    if(node.insp?.kind==='dream') {
      mesh(new THREE.IcosahedronGeometry(.76,1),leaf,0,1.45,0).scale.set(.83,1.32,.83);
      mesh(new THREE.IcosahedronGeometry(.43,1),leaf,-.42,1.1,.05);
    } else for(let j=0;j<3;j++)mesh(new THREE.ConeGeometry(.83-j*.19,1.15-j*.13,7),leaf,0,.98+j*.47,0).rotation.y=j*.32+i*.4;
  }
  mesh(new THREE.CylinderGeometry(.62,.69,.08,32),mat('#98b3a0'),0,-.01,0).castShadow=false;
  group.scale.setScalar(node.scale);group.position.set(node.x,.15,node.z);return group;
}

function R4TreePreview({ onClose }) {
  return html`<aside className="tree-r4-preview" aria-label="R4 树木分层预览">
    <div className="tree-r4-preview-head"><span><i></i>R4 TREE / LAYERED SOURCE</span><button aria-label="隐藏 R4 树木预览" onClick=${onClose}>×</button></div>
    <div className="tree-r4-stage">
      ${r4TreeLayers.map(([file, className]) => html`<img key=${file} className=${className} src=${'./assets/tree-r4/' + file} alt="" />`)}
    </div>
    <div className="tree-r4-preview-foot"><strong>R4 静态分层素材</strong><span>蓝天、树干与前中后枝叶已接入</span><small>当前仅预览素材，未启用正式风动</small></div>
  </aside>`;
}

export function GraphView({graph,onSelect,onOc,onNew,onList,allowDemo=false}) {
  const [demo,setDemo]=useState(allowDemo&&graph.nodes.length===0);
  const [sample,setSample]=useState(null),[failed,setFailed]=useState(false),[spinning,setSpinning]=useState(false),[labels,setLabels]=useState(true),[treePreview,setTreePreview]=useState(true);
  const host=useRef(null),api=useRef(null),labelRefs=useRef(new Map());
  const showingDemo=demo&&allowDemo&&graph.nodes.length===0;
  const shown=showingDemo?demoGraph:graph;
  const layout=useMemo(()=>arrangeForest(shown),[shown]);
  const activate=n=>{if(showingDemo)setSample(n);else if(n.type==='oc')onOc?.(n.label);else onSelect(n.id);};
  const activateRef=useRef(activate);activateRef.current=activate;
  useEffect(()=>{
    const el=host.current;if(!el)return;
    let renderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});}catch{setFailed(true);return;}
    setFailed(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
    renderer.domElement.setAttribute('aria-label','灵感森林，可拖动旋转、滚轮缩放，也可使用视角按钮');el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,1000),radius=layout.radius;
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.09;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI/2.2;
    controls.minDistance=radius*1.2;controls.maxDistance=radius*6;controls.enablePan=false;controls.autoRotateSpeed=.4;
    const reset=()=>{camera.position.set(radius*1.65,radius*1.5,radius*1.9);controls.target.set(0,.4,0);controls.update();};reset();
    const hemi=new THREE.HemisphereLight('#fff6dd','#426d62',3);scene.add(hemi);
    const sun=new THREE.DirectionalLight('#fff0cc',4.5);sun.position.set(-8,15,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-radius*1.4,right:radius*1.4,top:radius*1.4,bottom:-radius*1.4,far:radius*6});sun.shadow.bias=-.001;sun.shadow.normalBias=.025;scene.add(sun);
    const edge=new THREE.DirectionalLight('#9ad6d1',2);edge.position.set(7,6,-8);scene.add(edge);
    const terrainMat=new THREE.MeshStandardMaterial({color:'#779786',roughness:.95});
    const island=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.95,.55,80),terrainMat);island.position.y=-.2;island.receiveShadow=true;island.castShadow=true;scene.add(island);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(radius*.95,radius*.82,.55,80),new THREE.MeshStandardMaterial({color:'#486c61',roughness:1}));lower.position.y=-.73;scene.add(lower);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:'#dae5dc',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.06;floor.receiveShadow=true;scene.add(floor);
    const ringMat=new THREE.MeshBasicMaterial({color:'#d3d6b2',transparent:true,opacity:.36,side:THREE.DoubleSide});
    for(let r=2;r<radius;r+=2){const ring=new THREE.Mesh(new THREE.RingGeometry(r,r+.018,100),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.086;scene.add(ring);}
    const trees=layout.nodes.map(makeNode);trees.forEach(n=>scene.add(n));
    const map=new Map(layout.nodes.map(n=>[n.id,n]));
    const linkMat=new THREE.MeshStandardMaterial({color:'#edca81',emissive:'#cb9d49',emissiveIntensity:.4,metalness:.4,roughness:.4});
    for(const l of shown.links){const a=map.get(l.source),b=map.get(l.target);if(!a||!b)continue;const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x,.26,a.z),new THREE.Vector3((a.x+b.x)/2,.7+Math.hypot(a.x-b.x,a.z-b.z)*.12,(a.z+b.z)/2),new THREE.Vector3(b.x,.26,b.z));scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve,24,.018,5,false),linkMat));}
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
    const locate=e=>{const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(trees,true)[0]?.object.userData.node;};
    const onDown=e=>{down={x:e.clientX,y:e.clientY};};
    const onUp=e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6){const n=locate(e);if(n)activateRef.current(n);}down=null;};
    const onMove=e=>{renderer.domElement.style.cursor=locate(e)?'pointer':'grab';};
    const onLost=e=>{e.preventDefault();setFailed(true);};
    const events={pointerdown:onDown,pointerup:onUp,pointermove:onMove,webglcontextlost:onLost};Object.entries(events).forEach(([k,v])=>renderer.domElement.addEventListener(k,v));
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(el);resize();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const theme=()=>{const dark=document.documentElement.dataset.theme==='dark',bg=dark?'#142d29':'#dae5dc';scene.background=new THREE.Color(bg);scene.fog=new THREE.Fog(bg,radius*4,radius*9);floor.material.color.set(bg);hemi.intensity=dark?1.6:3;sun.intensity=dark?2:4.5;terrainMat.color.set(dark?'#365d4d':'#779786');};theme();
    const observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    api.current={reset,rotate:amount=>{const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),amount);camera.position.copy(controls.target).add(offset);controls.update();},zoom:factor=>{const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();}};
    let frame,last=0;const projected=new THREE.Vector3();
    const render=time=>{frame=requestAnimationFrame(render);if(document.hidden||time-last<32)return;last=time;controls.autoRotate=api.current?.spinning&&!reduced.matches;controls.update();renderer.render(scene,camera);
      for(const n of layout.nodes){const label=labelRefs.current.get(n.id);if(!label)continue;projected.set(n.x,.3,n.z).project(camera);label.style.left=`${(projected.x*.5+.5)*el.clientWidth}px`;label.style.top=`${(-projected.y*.5+.5)*el.clientHeight+14}px`;label.style.visibility=projected.z>1||projected.z< -1?'hidden':'visible';label.style.zIndex=String(Math.round((1-projected.z)*1000));}};frame=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(frame);ro.disconnect();observer.disconnect();controls.dispose();api.current=null;Object.entries(events).forEach(([k,v])=>renderer.domElement.removeEventListener(k,v));const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[layout,shown]);
  useEffect(()=>{if(api.current)api.current.spinning=spinning;},[spinning,layout]);
  const toggleDemo=()=>{setDemo(!showingDemo);setSample(null);};
  return html`<section className="forest-view" aria-label="三维灵感森林">
    <div className="forest-canvas" ref=${host}></div>
    ${treePreview?html`<${R4TreePreview} onClose=${()=>setTreePreview(false)} />`:null}
    <div className="forest-intro"><div className="forest-eyebrow"><span></span>MUSEKNOT / FOREST</div><h1>${showingDemo?'故事，从一念生长。':'我的灵感森林'}</h1><p>${showingDemo?'散落的画面，在这里遇见彼此。':'每一棵树，都是你留下的一个念头。'}</p><div className="forest-status">${showingDemo?html`<span className="demo-badge">示例森林 · 不会存入笔记</span>`:html`<span>${graph.nodes.filter(n=>n.type==='insp').length} 条灵感 · ${graph.links.length} 处连接</span>`}</div></div>
    <div className="forest-tools" aria-label="森林视角"><button aria-label="向左旋转" title="向左旋转" onClick=${()=>api.current?.rotate(-.3)}>↶</button><button aria-label="向右旋转" title="向右旋转" onClick=${()=>api.current?.rotate(.3)}>↷</button><span className="tool-divider"></span><button aria-label="放大" onClick=${()=>api.current?.zoom(.82)}>＋</button><button aria-label="缩小" onClick=${()=>api.current?.zoom(1.22)}>−</button><button className="tool-word" onClick=${()=>api.current?.reset()}>归位</button><button className=${'tool-word'+(spinning?' is-active':'')} aria-pressed=${spinning} onClick=${()=>setSpinning(!spinning)}>${spinning?'暂停':'环游'}</button><button className=${'tool-word'+(treePreview?' is-active':'')} aria-pressed=${treePreview} onClick=${()=>setTreePreview(!treePreview)}>${treePreview?'隐藏树':'R4 树木'}</button></div>
    ${!failed?html`<div className=${'forest-labels'+(!labels?' labels-hidden':'')}>${layout.nodes.map(n=>html`<button key=${n.id} ref=${e=>{if(e)labelRefs.current.set(n.id,e);else labelRefs.current.delete(n.id);}} className=${'forest-label '+(n.type==='oc'?'label-oc':'')} onClick=${()=>activate(n)} title=${n.label}>${n.type==='oc'?'◇ ':n.insp?.type==='weave'?'∞ ':''}${n.label}</button>`)}</div>`:html`<div className="forest-fallback"><p>当前设备暂时无法显示 3D，仍可打开这些灵感。</p>${layout.nodes.map(n=>html`<button className="btn" key=${n.id} onClick=${()=>activate(n)}>${n.label}</button>`)}<button className="btn primary" onClick=${onList}>打开灵感列表</button></div>`}
    ${!shown.nodes.length?html`<div className="forest-empty"><h2>${allowDemo?'从第一个念头开始':'没有匹配的灵感'}</h2><p>${allowDemo?'写下一句话，让它在这里生根。':'换个关键词，或者回到列表继续查找。'}</p><button className="btn primary" onClick=${allowDemo?onNew:onList}>${allowDemo?'＋ 记下灵感':'打开列表'}</button>${allowDemo?html`<button className="btn ghost" onClick=${toggleDemo}>看看示例森林</button>`:null}</div>`:null}
    ${sample&&showingDemo?html`<aside className="forest-sample" aria-live="polite"><button className="sample-close" aria-label="关闭示例详情" onClick=${()=>setSample(null)}>×</button><span className="forest-eyebrow">示例片段</span><h2>${sample.label}</h2><p>${sample.insp?.body||'这是几条灵感共同提到的意象。意象把散落的片段连接起来。'}</p><button className="btn primary sm" onClick=${onNew}>写下我的灵感 ↗</button></aside>`:null}
    <div className="forest-bottom"><div className="forest-legend"><span><i className="legend-tree"></i>灵感</span><span><i className="legend-motif"></i>意象</span><span><i className="legend-link"></i>关联</span><small>树的大小表示连接数量</small></div><div className="forest-bottom-actions"><button aria-pressed=${labels} onClick=${()=>setLabels(!labels)}>${labels?'隐藏标题':'显示标题'}</button>${allowDemo&&graph.nodes.length===0?html`<button onClick=${toggleDemo}>${showingDemo?'回到我的森林':'查看示例'}</button>`:null}</div></div>
    <div className="forest-hint">拖动旋转 · 滚轮 / 双指缩放 · 点击查看灵感</div>
  </section>`;
}
