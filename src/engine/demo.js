import { createDocument, createEntity } from './document.js';
import { captureKey } from './animation.js';

export function emptyWorld() {
  const doc = createDocument('Untitled');
  const floor = createEntity('plane', { name: 'Ground', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [20, 1, 20] } });
  const sun = createEntity('directionalLight', { name: 'Sun', transform: { position: [5, 9, 5], rotation: [0, 0, 0], scale: [1, 1, 1] } });
  floor.material.color='#4a4a4a';floor.material.metalness=0;floor.material.roughness=.75;
  const cube=createEntity('box',{name:'Cube'});cube.material.color='#a5a5a5';cube.material.metalness=0;cube.material.roughness=.55;
  doc.entities.push(cube, floor, sun); return doc;
}

export function simulationTest(){
  const doc=emptyWorld();doc.name='Simulation Test';doc.entities=doc.entities.filter(e=>e.kind!=='box');
  const cloth=createEntity('cloth',{name:'Cloth',transform:{position:[-3.2,0,0],rotation:[0,0,0],scale:[1,1,1]}});cloth.material.color='#9e9b91';cloth.material.metalness=0;cloth.material.roughness=.9;
  const sphere=createEntity('sphere',{name:'Cloth Collider',transform:{position:[-3.2,1.3,.25],rotation:[0,0,0],scale:[1.6,1.6,1.6]}});sphere.material.color='#787c82';sphere.material.metalness=0;
  const fluid=createEntity('fluid',{name:'Fluid',transform:{position:[2.1,.03,0],rotation:[0,0,0],scale:[1,1,1]}});fluid.material.color='#4f87ac';fluid.material.metalness=0;fluid.material.roughness=.2;fluid.castShadow=false;
  const emitter=createEntity('particles',{name:'Emitter',transform:{position:[0,.5,3.5],rotation:[0,0,0],scale:[1,1,1]}});emitter.material.color='#b9a881';emitter.castShadow=false;emitter.simulation.floor=-.5;
  doc.entities.push(cloth,sphere,fluid,emitter);doc.camera={position:[11,8,12],target:[-.5,1.5,0]};return doc;
}

export function waterTest(){
  const doc=emptyWorld();doc.name='Water Test';doc.entities=doc.entities.filter(e=>e.kind!=='box');
  const water=createEntity('water',{name:'Water',transform:{position:[0,.7,0],rotation:[0,0,0],scale:[1,1,1]}});water.simulation.resolution=48;
  const cube=createEntity('box',{name:'Floating Cube',transform:{position:[-2,2,0],rotation:[0,0,0],scale:[1.2,1.2,1.2]},behaviors:{rigidbody:{floor:0,restitution:.1},buoyancy:{strength:2.6,drag:3}}});cube.material.color='#a19882';cube.material.metalness=0;cube.material.roughness=.7;
  const sphere=createEntity('sphere',{name:'Drop Sphere',transform:{position:[2,4,0],rotation:[0,0,0],scale:[.8,.8,.8]},behaviors:{rigidbody:{floor:0,restitution:.35}}});
  const wake=createEntity('sphere',{name:'Moving Collider',transform:{position:[-4,.7,2],rotation:[0,0,0],scale:[.8,.8,.8]},behaviors:{path:{axis:'X',distance:8,speed:1.5,pingPong:true}}});
  const camera=createEntity('camera',{name:'Player Camera',transform:{position:[8,2,9],rotation:[-8,42,0],scale:[1,1,1]}});
  doc.entities.push(water,cube,sphere,wake,camera);doc.camera={position:[12,9,13],target:[0,.7,0]};return doc;
}

export function terrainTest(){
  const doc=emptyWorld();doc.name='Terrain Test';doc.entities=doc.entities.filter(e=>!['box','plane'].includes(e.kind));
  const terrain=createEntity('terrain',{name:'Terrain'});terrain.terrain.amplitude=4;terrain.terrain.island=true;doc.entities.push(terrain);
  for(let i=0;i<8;i++){const e=createEntity(i%2?'sphere':'box',{name:`Body ${i+1}`,transform:{position:[(i%4-1.5)*2,7+Math.floor(i/4)*2,(Math.floor(i/4)-.5)*2],rotation:[0,0,0],scale:[1,1,1]},behaviors:{rigidbody:{restitution:.2,friction:.65,floor:-10}}});doc.entities.push(e);}
  const camera=createEntity('camera',{name:'Player Camera',transform:{position:[9,5,11],rotation:[-10,40,0],scale:[1,1,1]}});doc.entities.push(camera);doc.camera={position:[21,17,22],target:[0,1.5,0]};return doc;
}

export function engineTest(){
  const doc=waterTest();doc.name='Engine Test';doc.entities.find(e=>e.kind==='water').simulation.resolution=40;
  const terrain=createEntity('terrain',{name:'Island',transform:{position:[-12,0,-7],rotation:[0,0,0],scale:[1,1,1]}});Object.assign(terrain.terrain,{width:12,depth:12,resolution:32,amplitude:2,island:true});
  const cloth=createEntity('cloth',{name:'Flag',transform:{position:[-7,0,2],rotation:[0,0,0],scale:[1,1,1]}});Object.assign(cloth.simulation,{width:2,height:3,segments:12,wind:3});cloth.material.color='#a1a1a1';cloth.material.metalness=0;
  const animated=createEntity('box',{name:'Animated Cube',transform:{position:[7,1,-1],rotation:[0,0,0],scale:[1,1,1]},collider:false});
  for(const [time,position,rotation] of [[0,[7,1,-1],[0,0,0]],[2,[7,3,-1],[0,120,0]],[4,[9,3,1],[0,240,0]],[6,[7,1,-1],[0,360,0]],[8,[7,1,-1],[0,360,0]]])captureKey(animated,time,{position,rotation,scale:[1,1,1]});animated.animation.interpolation='smooth';
  const emitter=createEntity('particles',{name:'Fountain',transform:{position:[0,.7,-3],rotation:[0,0,0],scale:[1,1,1]}});Object.assign(emitter.simulation,{gravity:9.81,speed:5,rate:50,lifetime:2,floor:-.7});emitter.material.color='#668da1';emitter.castShadow=false;
  const anchor=createEntity('sphere',{name:'Spring Anchor',transform:{position:[6,4,4],rotation:[0,0,0],scale:[.3,.3,.3]}});
  const pendulum=createEntity('sphere',{name:'Spring Body',transform:{position:[7.5,2.5,4],rotation:[0,0,0],scale:[.65,.65,.65]},behaviors:{rigidbody:{restitution:.2,z:1},joint:{target:anchor.id,length:2,stiffness:30,damping:2}}});
  const follower=createEntity('box',{name:'Follower',collider:false,transform:{position:[7,1,-3],rotation:[0,0,0],scale:[.4,.4,.4]},behaviors:{follow:{target:animated.id,speed:2,x:0,y:1,z:0},lookAt:{target:animated.id}}});
  doc.entities.push(terrain,cloth,animated,emitter,anchor,pendulum,follower);doc.camera={position:[20,14,22],target:[0,1,0]};return doc;
}

export function characterTest(){
  const doc=emptyWorld();doc.name='Character Test';doc.entities=doc.entities.filter(e=>e.kind!=='box');
  const player=createEntity('player',{name:'Player'});doc.entities.push(player);
  for(const [name,position,scale] of [['Platform',[3,.45,-3],[3,.9,3]],['Wall',[-3,1.1,-4],[1,2.2,5]],['Step',[1,.15,-1.5],[1,.3,1]]]){const box=createEntity('box',{name,transform:{position,rotation:[0,0,0],scale}});box.material.metalness=0;box.material.color='#72777a';doc.entities.push(box);}
  doc.entities.push(createEntity('sphere',{name:'Collider',transform:{position:[-1,.7,3],rotation:[0,0,0],scale:[1.4,1.4,1.4]}}));doc.camera={position:[6,4,7],target:[0,1,0]};return doc;
}
