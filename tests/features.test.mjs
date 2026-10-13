import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { WaterSolver } from '../src/engine/water.js';
import { terrainData, terrainHeight, sampleTerrain } from '../src/engine/terrain.js';
import { RigidWorld, collide } from '../src/engine/rigid-world.js';
import { captureKey, sampleAnimation } from '../src/engine/animation.js';
import { createDocument, createEntity, validateDocument, clone, duplicateEntities } from '../src/engine/document.js';
import { createPrefab, instantiatePrefab } from '../src/engine/prefab.js';
import { waterTest, terrainTest, engineTest } from '../src/engine/demo.js';
import { Simulation } from '../src/engine/simulation.js';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{inspectAsset}=require('../electron/files.cjs');
const finite=values=>assert([...values].every(Number.isFinite));
const body=(id,position,options={})=>({id,type:'box',position:[...position],half:[.5,.5,.5],velocity:[0,0,0],invMass:1,restitution:.1,friction:.6,damping:.02,floor:0,...options});

test('water ripple propagates beyond its initial footprint and decays',()=>{
  const s=new WaterSolver({resolution:32,amplitude:0,rainRate:0,damping:1.5});s.ripple(0,0,.4,.4);const before=s.sample(2,0);let propagated=0;
  for(let i=0;i<120;i++){s.step(1/60);propagated=Math.max(propagated,Math.abs(s.sample(2,0)));}
  finite(s.heights);finite(s.velocity);assert(propagated>Math.abs(before)+.001);const peak=Math.max(...s.heights.map(Math.abs));
  for(let i=0;i<480;i++)s.step(1/60);assert(Math.max(...s.heights.map(Math.abs))<peak*.3);
});
test('water CFL substeps stay finite with small cells and a fast wave speed',()=>{
  const s=new WaterSolver({width:2,depth:2,resolution:128,waveSpeed:8,rainRate:0,amplitude:0});s.ripple(0,0,.9,.1);
  for(let i=0;i<30;i++)s.step(1/30);finite(s.heights);finite(s.velocity);assert(Math.max(...s.heights.map(Math.abs))<2);
});
test('rain is seeded and water reset restores the original mesh exactly',()=>{
  const a=new WaterSolver({resolution:16,rainRate:20}),b=new WaterSolver({resolution:16,rainRate:20}),before=new Float32Array(a.positions);
  for(let i=0;i<60;i++){a.step(1/60);b.step(1/60);}a.updatePositions();b.updatePositions();assert.deepEqual(a.positions,b.positions);assert.notDeepEqual(a.positions,before);assert.equal(a.sample(100,100),null);assert.equal(a.ripple(100,0),false);a.reset();assert.deepEqual(a.positions,before);
});
test('terrain seeds are repeatable, distinct and sampled on the rendered grid',()=>{
  const options={width:10,depth:10,resolution:16,seed:72,amplitude:5},a=terrainData(options),b=terrainData(options),c=terrainData({...options,seed:73});assert.deepEqual(a,b);assert.notDeepEqual(a.positions,c.positions);finite(a.positions);
  for(let i=0;i<a.positions.length;i+=3)assert(Math.abs(sampleTerrain(a.positions[i],a.positions[i+2],options)-a.positions[i+1])<1e-5);
  assert.equal(terrainHeight(100,0,options),null);assert.equal(terrainHeight(5,0,{...options,island:true}),0);assert(a.indices.every(i=>i<a.positions.length/3));
});
test('sphere impulses conserve momentum in an elastic collision',()=>{
  const a=body('a',[-.6,1,0],{type:'sphere',velocity:[2,0,0],restitution:1,friction:0,damping:0,floor:-100}),b=body('b',[.6,1,0],{type:'sphere',velocity:[-2,0,0],restitution:1,friction:0,damping:0,floor:-100}),w=new RigidWorld([a,b],{gravity:0});
  for(let i=0;i<20;i++)w.step(1/60);assert(a.velocity[0]<-1.9);assert(b.velocity[0]>1.9);assert(Math.abs(a.velocity[0]+b.velocity[0])<1e-8);assert.equal(collide(a,b),null);
});
test('rigid boxes form a resting stack without sinking through their floor',()=>{
  const boxes=[body('a',[0,1,0]),body('b',[0,2.5,0]),body('c',[0,4,0])],world=new RigidWorld(boxes);
  for(let i=0;i<600;i++)world.step(1/60);boxes.forEach((b,i)=>{finite(b.position);assert(Math.abs(b.position[1]-(.5+i))<.025);assert(Math.abs(b.velocity[1])<.2);});
});
test('sphere-box contacts project embedded spheres out along the nearest face',()=>{
  const sphere=body('ball',[.8,1,0],{type:'sphere',floor:-100}),box=body('static',[0,1,0],{invMass:0,half:[1,1,1],floor:-100}),world=new RigidWorld([sphere,box],{gravity:0});world.step(1/60);assert(sphere.position[0]>1.49);assert.equal(box.position[0],0);
});
test('buoyancy and water drag support a submerged body near the surface',()=>{
  const cube=body('float',[0,3,0],{buoyancy:{strength:2,drag:4}}),world=new RigidWorld([cube]);for(let i=0;i<600;i++)world.step(1/60,()=>0,()=>1);assert(Math.abs(cube.position[1]-1)<.08);assert(Math.abs(cube.velocity[1])<.08);
});
test('spring joints stay bounded and terrain height stops falling bodies',()=>{
  const anchor=body('anchor',[0,4,0],{invMass:0}),pendulum=body('p',[1,2,0],{joint:{target:'anchor',length:2,stiffness:30,damping:4}}),world=new RigidWorld([anchor,pendulum]);for(let i=0;i<600;i++)world.step(1/60);finite(pendulum.position);assert(Math.hypot(...pendulum.position.map((v,i)=>v-anchor.position[i]))<3);
  const drop=body('drop',[2,8,2]),terrain=new RigidWorld([drop]);for(let i=0;i<300;i++)terrain.step(1/60,()=>2);assert(Math.abs(drop.position[1]-2.5)<.01);
});
test('keyframes interpolate transforms, shortest rotations and loop boundaries',()=>{
  const e=createEntity('box');captureKey(e,0,{position:[0,0,0],rotation:[0,350,0],scale:[1,1,1]});captureKey(e,2,{position:[4,2,0],rotation:[0,10,0],scale:[2,2,2]});
  const pose=sampleAnimation(e.animation,1,2,false);assert.deepEqual(pose.position,[2,1,0]);assert.equal(pose.rotation[1],360);assert.deepEqual(pose.scale,[1.5,1.5,1.5]);assert.deepEqual(sampleAnimation(e.animation,3,2,true),pose);e.animation.interpolation='step';assert.deepEqual(sampleAnimation(e.animation,1,2,false).position,[0,0,0]);e.animation.enabled=false;assert.equal(sampleAnimation(e.animation,1),null);
});
test('key capture replaces duplicate times and rejects unsorted or conflicting transforms',()=>{
  const d=createDocument(),e=createEntity('box');d.entities.push(e);captureKey(e,1);captureKey(e,0);captureKey(e,1,{...e.transform,position:[1,1,1]});assert.equal(e.animation.keys.length,2);assert.doesNotThrow(()=>validateDocument(d));e.behaviors.spin={speed:30,axis:'Y'};assert.throws(()=>validateDocument(d),/owns transforms/);delete e.behaviors.spin;e.animation.keys.reverse();assert.throws(()=>validateDocument(d),/sorted/);
});
test('fixed-step key playback and path motion restore the authored pose on Stop',()=>{
  const e=createEntity('box'),path=createEntity('sphere',{behaviors:{path:{axis:'Z',distance:2,speed:1,pingPong:true}}});captureKey(e,0);captureKey(e,2,{...e.transform,position:[4,2,0]});const objects=new Map([e,path].map(x=>{const o=new Object3D();o.position.fromArray(x.transform.position);return[x.id,o];})),simulation=new Simulation();simulation.start([e,path],objects,{timeline:{duration:8,loop:false}});
  for(let i=0;i<60;i++)simulation.step();assert(Math.abs(objects.get(e.id).position.x-2)<1e-6);assert(Math.abs(objects.get(path.id).position.z-1)<1e-6);simulation.stop();assert.deepEqual(objects.get(e.id).position.toArray(),e.transform.position);assert.deepEqual(objects.get(path.id).position.toArray(),path.transform.position);
});
test('prefabs preserve subtree links and deduplicate embedded assets across instances',()=>{
  const d=createDocument(),g=createEntity('group'),a=createEntity('box',{parent:g.id}),b=createEntity('box',{parent:g.id,behaviors:{follow:{target:a.id,speed:2,x:0,y:0,z:0}}});d.entities.push(g,a,b);d.assets.push({id:'image',name:'image.png',type:'texture',mime:'image/png',data:'AAAA'});a.material.texture='image';const prefab=createPrefab(d,g.id),target=createDocument(),id=instantiatePrefab(target,prefab,[3,0,0]);instantiatePrefab(target,prefab,[-3,0,0]);assert.equal(target.entities.length,6);assert.equal(target.assets.length,1);assert.deepEqual(target.entities.find(e=>e.id===id).transform.position,[3,0,0]);for(const e of target.entities.filter(e=>e.behaviors.follow))assert.equal(target.entities.find(x=>x.id===e.behaviors.follow.target).parent,e.parent);assert.doesNotThrow(()=>validateDocument(target));
});
test('prefab animation is offset with its root and bad imports leave their destination intact',()=>{
  const d=createDocument(),e=createEntity('box',{transform:{position:[5,2,0],rotation:[0,0,0],scale:[1,1,1]}});captureKey(e,0);captureKey(e,2,{...e.transform,position:[7,2,0]});d.entities.push(e);const target=createDocument(),prefab=createPrefab(d,e.id),id=instantiatePrefab(target,prefab,[10,0,0]);assert.deepEqual(target.entities.find(x=>x.id===id).animation.keys[1].transform.position,[12,0,0]);const before=clone(target),bad=clone(prefab);bad.root='missing';assert.throws(()=>instantiatePrefab(target,bad));assert.deepEqual(target,before);
});
test('duplicated hierarchies remap behavior targets and animated root offsets',()=>{
  const d=createDocument(),g=createEntity('group'),a=createEntity('box',{parent:g.id}),b=createEntity('sphere',{parent:g.id,behaviors:{lookAt:{target:a.id}}});captureKey(g,0);d.entities.push(g,a,b);const id=duplicateEntities(d,g.id),root=d.entities.find(x=>x.id===id),copies=d.entities.filter(x=>x.parent===id);assert.equal(root.animation.keys[0].transform.position[0],1.5);assert.equal(copies.find(x=>x.behaviors.lookAt).behaviors.lookAt.target,copies.find(x=>x.kind==='box').id);
});
test('audio imports validate container signatures and persist the sound settings',()=>{
  const wav=Buffer.alloc(64);wav.write('RIFF');wav.writeUInt32LE(56,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(20,40);const asset=inspectAsset(wav,'test.wav');assert.equal(asset.type,'audio');const d=createDocument(),e=createEntity('audio');e.audio.asset=asset.id;d.entities.push(e);d.assets.push(asset);assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),d);assert.throws(()=>inspectAsset(Buffer.from('garbage'),'bad.wav'));e.audio.asset='missing';assert.throws(()=>validateDocument(d),/Missing audio/);
});
test('new scenes reject dangling gameplay links, oversized surfaces and invalid camera planes',()=>{
  const d=createDocument();const camera=createEntity('camera');d.entities.push(camera);camera.cameraSettings.far=10;camera.cameraSettings.near=10;assert.throws(()=>validateDocument(d),/far must/);d.entities=[createEntity('trigger')];d.entities[0].trigger.target='missing';assert.throws(()=>validateDocument(d),/target/);d.entities=[];for(let i=0;i<7;i++){const e=createEntity('water');e.simulation.resolution=128;d.entities.push(e);}assert.throws(()=>validateDocument(d),/budget/);
});
test('version two scenes migrate to version four without changing their existing settings',()=>{
  const d=waterTest();d.entities=d.entities.filter(e=>!['water','camera'].includes(e.kind));d.version=2;delete d.timeline;for(const e of d.entities)delete e.animation;const settings=clone(d.settings),migrated=validateDocument(d);assert.equal(migrated.version,4);assert.deepEqual(migrated.settings,settings);assert(migrated.entities.every(e=>e.animation.keys.length===0));
});
test('all new demonstration scenes round-trip without losing their components',()=>{for(const make of [waterTest,terrainTest,engineTest]){const d=make();assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),d);}});
test('PBR map references and long prefab timelines survive instantiation',()=>{
  const d=createDocument(),e=createEntity('box');d.timeline.duration=30;captureKey(e,0);captureKey(e,20);d.entities.push(e);d.assets.push({id:'normal',name:'normal.png',type:'texture',mime:'image/png',data:'AAAA'});e.material.normalTexture='normal';e.material.roughnessTexture='normal';const p=createPrefab(d,e.id),target=createDocument(),id=instantiatePrefab(target,p);assert.equal(target.timeline.duration,30);const copy=target.entities.find(x=>x.id===id);assert.equal(copy.material.normalTexture,copy.material.roughnessTexture);assert.equal(target.assets.length,1);copy.material.normalTexture='missing';assert.throws(()=>validateDocument(target),/map asset/);
});
test('disabling primitive contacts keeps gravity and floor integration active',()=>{
  const drop=body('drop',[0,4,0],{collisions:false}),obstacle=body('obstacle',[0,2,0],{invMass:0,half:[2,.5,2]}),world=new RigidWorld([drop,obstacle]);for(let i=0;i<300;i++)world.step(1/60);assert(Math.abs(drop.position[1]-.5)<.01);assert.equal(obstacle.position[1],2);
});
test('spring joints reject terrain targets that cannot be represented as rigid primitives',()=>{
  const doc=createDocument(),terrain=createEntity('terrain'),ball=createEntity('sphere',{behaviors:{rigidbody:{floor:0,restitution:.2},joint:{target:terrain.id,length:2,stiffness:20,damping:2}}});doc.entities.push(terrain,ball);assert.throws(()=>validateDocument(doc),/primitive collider/);
});
