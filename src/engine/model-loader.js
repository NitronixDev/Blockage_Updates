import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';
import { MODEL_MIMES, resourceName } from './model-formats.js';
const decode=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
export async function loadModel(asset){
  const manager=new THREE.LoadingManager(),resources=new Map((asset.resources||[]).map(r=>[r.name.toLowerCase(),r]));
  let active=0;const errors=[];const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager);manager.itemStart=url=>{active++;start(url);};manager.itemEnd=url=>{active--;end(url);};manager.onError=url=>errors.push(url);
  manager.setURLModifier(url=>{if(/^(data:|blob:)/.test(url))return url;if(/^[a-z][a-z0-9+.-]*:/i.test(url)&&! /^[A-Za-z]:[\\/]/.test(url))throw new Error('Use embedded model resources.');let name;try{name=resourceName(url).toLowerCase();}catch{if(!asset.resourceBase)throw new Error('Model resource outside bundle.');name=resourceName(asset.resourceBase+'/'+url).toLowerCase();}let r=resources.get(name);if(!r&&asset.resourceBase)r=resources.get(resourceName(asset.resourceBase+'/'+url).toLowerCase());if(!r){const matches=[...resources.values()].filter(r=>r.name.toLowerCase().split('/').pop()===name.split('/').pop());if(matches.length===1)r=matches[0];}if(!r)throw new Error(`Missing model resource: ${name}`);return `data:${r.mime};base64,${r.data}`;});
  manager.addHandler(/\.tga$/i,new TGALoader(manager));manager.addHandler(/\.dds$/i,new DDSLoader(manager));
  const bytes=decode(asset.data),text=()=>new TextDecoder().decode(bytes),format=Object.keys(MODEL_MIMES).find(k=>MODEL_MIMES[k]===asset.mime);let root,animations=[];
  if(['glb','gltf'].includes(format)){const result=await new GLTFLoader(manager).parseAsync(format==='gltf'?text():bytes.buffer,'');root=result.scene;animations=result.animations;}
  else if(format==='obj'){const loader=new OBJLoader(manager),materials=new MTLLoader(manager).parse('','');for(const r of resources.values())if(r.mime==='text/x-wavefront-mtl'){const base=r.name.includes('/')?r.name.slice(0,r.name.lastIndexOf('/')+1):'',m=new MTLLoader(manager).parse(new TextDecoder().decode(decode(r.data)),base);m.preload();Object.assign(materials.materials,m.materials);}loader.setMaterials(materials);root=loader.parse(text());}
  else if(format==='fbx'){root=new FBXLoader(manager).parse(bytes.buffer,'');animations=root.animations||[];}
  else if(format==='dae'){const result=new ColladaLoader(manager).parse(text(),'');root=result.scene;animations=result.animations||[];}
  else if(format==='3mf')root=new ThreeMFLoader(manager).parse(bytes.buffer);
  else if(['stl','ply'].includes(format)){const geometry=format==='stl'?new STLLoader(manager).parse(bytes.buffer):new PLYLoader(manager).parse(bytes.buffer);if(!geometry.attributes.normal)geometry.computeVertexNormals();root=new THREE.Group();root.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#a8a8a8',roughness:.65,vertexColors:Boolean(geometry.attributes.color)})));}
  else throw new Error('Unsupported model format.');
  const deadline=Date.now()+30000;while(active>0){if(Date.now()>deadline)throw new Error('Model textures timed out.');await new Promise(r=>setTimeout(r,20));}if(errors.length)throw new Error('Model texture could not load.');
  const stats={format:asset.sourceFormat||format,vertices:0,meshes:0,bones:0,clips:animations.length};root.traverse(o=>{if(o.isMesh){stats.meshes++;stats.vertices+=o.geometry?.attributes.position?.count||0;}if(o.isBone)stats.bones++;});
  if(!stats.meshes)throw new Error('The model contains no mesh.');if(stats.vertices>1000000||stats.meshes>2048||stats.bones>256||stats.clips>256)throw new Error('Model exceeds the mesh, vertex, bone or clip limit.');
  return {root,animations,stats};
}
