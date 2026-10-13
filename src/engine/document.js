import { simulationDefaults, SIM_DEFAULTS } from './physics.js';
import { WATER_DEFAULTS } from './water.js';
import { TERRAIN_DEFAULTS } from './terrain.js';
import { ANIMATION_DEFAULTS } from './animation.js';
import { RIG_DEFAULTS, PLAYER_DEFAULTS } from './character-data.js';
import { validateCharacter } from './character-validation.js';
import { MODEL_MIMES, RESOURCE_MIMES, resourceName } from './model-formats.js';
export const FORMAT = 'blockage.scene';
export const VERSION = 4;
export const KINDS = ['group', 'box', 'sphere', 'cylinder', 'torus', 'plane', 'pointLight', 'directionalLight', 'model', 'player', 'cloth', 'fluid', 'particles', 'water', 'terrain', 'camera', 'audio', 'trigger'];
export const RIGID_DEFAULTS = Object.freeze({ restitution: .25, floor: 0, mass: 1, friction: .5, damping: .05, x: 0, y: 0, z: 0 });
export const BEHAVIOR_DEFAULTS = Object.freeze({ spin: {speed:45,axis:'Y'}, float:{amplitude:.3,speed:1}, orbit:{radius:2,speed:.5}, rigidbody:RIGID_DEFAULTS, velocity:{x:1,y:0,z:0}, oscillate:{axis:'X',amplitude:1,speed:.5}, pulse:{amplitude:.15,speed:.5}, spring:{stiffness:8,damping:1.5,x:0,y:3,z:0}, path:{axis:'X',distance:4,speed:1,pingPong:true}, follow:{target:null,speed:3,x:0,y:1,z:0}, lookAt:{target:null}, buoyancy:{strength:2.4,drag:2}, joint:{target:null,length:2,stiffness:20,damping:3} });
export const LIMITS = Object.freeze({ entities: 4000, assets: 200, assetBytes: 50 * 1024 * 1024, sceneBytes: 160 * 1024 * 1024 });
export const clone = value => structuredClone(value);
export const uid = () => globalThis.crypto.randomUUID();
export const isLight = entity => entity?.kind === 'pointLight' || entity?.kind === 'directionalLight';

export function createEntity(kind = 'box', options = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown entity type: ${kind}`);
  const entity = {
    id: uid(), name: kind === 'pointLight' ? 'Point Light' : kind === 'directionalLight' ? 'Directional Light' : kind[0].toUpperCase() + kind.slice(1),
    kind, parent: null, visible: true, locked: false,
    transform: { position: [0, ['plane','group','cloth','fluid','particles','water','terrain','trigger','player'].includes(kind) ? 0 : 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    material: { color: kind==='water'?'#376f88':kind==='terrain'?'#68715b':'#9da8b8', metalness: ['terrain','water'].includes(kind)?0:0.35, roughness: kind==='water'?.16:kind==='terrain'?.92:.4, emissive: '#000000', emissiveIntensity: 0, opacity: 1, texture: null, normalTexture:null, roughnessTexture:null, metalnessTexture:null, emissiveTexture:null },
    light: { color: '#ffffff', intensity: kind === 'directionalLight' ? 3 : 30, distance: 16 },
    behaviors: {}, castShadow: true, receiveShadow: true, collider: ['box','sphere','cylinder'].includes(kind),
    ...(SIM_DEFAULTS[kind] ? { simulation: simulationDefaults(kind) } : {}),
    ...(kind==='water'?{simulation:clone(WATER_DEFAULTS),castShadow:false}:{}),
    ...(kind==='terrain'?{terrain:clone(TERRAIN_DEFAULTS),collider:true}:{}),
    ...(kind==='camera'?{cameraSettings:{fov:65,near:.05,far:600,controller:'walk',speed:5,eyeHeight:1.7}}:{}),
    ...(kind==='audio'?{audio:{asset:null,volume:.5,loop:true,pitch:1,distance:3,rolloff:1,autoplay:true}}:{}),
    ...(kind==='trigger'?{trigger:{width:3,height:3,depth:3,target:null,action:'sound',once:true}}:{}),
    ...(['model','player'].includes(kind)?{modelAnimation:{enabled:true,clip:0,speed:1,loop:true,fade:.2},rig:clone(RIG_DEFAULTS),player:{...clone(PLAYER_DEFAULTS),enabled:kind==='player'}}:{}),
    animation: clone(ANIMATION_DEFAULTS),
    ...clone(options)
  };
  if(entity.behaviors.rigidbody)entity.behaviors.rigidbody={...RIGID_DEFAULTS,...entity.behaviors.rigidbody};
  return entity;
}

export function createDocument(name = 'Untitled World') {
  return {
    format: FORMAT, version: VERSION, name, entities: [], assets: [], timeline: {duration:8,fps:30,loop:true},
    settings: { background: '#333333', fog: 0, exposure: 1, bloom: false, bloomStrength: 0.2, shadows: true, grid: true, ambient: 1 },
    camera: { position: [7, 5, 7], target: [0, 0.75, 0] }
  };
}

const finite = (v, field, min = -1e6, max = 1e6) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${field}`);
};
const color = (v, field) => { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`Invalid ${field}`); };
const vector = (v, field, scale = false) => {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`Invalid ${field}`);
  v.forEach(x => finite(x, field, scale ? 0.001 : -100000, scale ? 10000 : 100000));
};
const string = (v, field, max = 200) => { if (typeof v !== 'string' || !v.length || v.length > max) throw new Error(`Invalid ${field}`); };
const bool = (v, field) => { if (typeof v !== 'boolean') throw new Error(`Invalid ${field}`); };

/** Parse a portable scene. Reject bad transforms, dangling assets, and cyclic parenting before touching the live world. */
export function validateDocument(input) {
  const doc = clone(input);
  if (doc?.format !== FORMAT || ![1, 2, 3, VERSION].includes(doc.version)) throw new Error('Unsupported Blockage scene version.');
  if (doc.version === 1) for (const e of doc.entities || []) e.collider = ['box','sphere','cylinder'].includes(e.kind);
  if(doc.version<3){doc.timeline={duration:8,fps:30,loop:true};for(const e of doc.entities||[]){e.animation=clone(ANIMATION_DEFAULTS);if(e.kind==='model')e.modelAnimation={enabled:true,clip:0,speed:1,loop:true};if(e.behaviors?.rigidbody)e.behaviors.rigidbody={...RIGID_DEFAULTS,...e.behaviors.rigidbody};}}
  if(doc.version<4)for(const e of doc.entities||[])if(e.kind==='model'){e.modelAnimation.fade=.2;e.rig=clone(RIG_DEFAULTS);e.player=clone(PLAYER_DEFAULTS);}
  doc.version=VERSION;
  string(doc.name, 'world name');
  if (!Array.isArray(doc.entities) || doc.entities.length > LIMITS.entities) throw new Error('Invalid entity list or entity limit exceeded.');
  if (!Array.isArray(doc.assets) || doc.assets.length > LIMITS.assets) throw new Error('Invalid asset list or asset limit exceeded.');
  finite(doc.timeline?.duration,'timeline duration',.1,600);finite(doc.timeline.fps,'timeline fps',1,120);bool(doc.timeline.loop,'timeline loop');
  const ids = new Set(), assetIds = new Set();
  let totalAssetBytes = 0;
  for (const a of doc.assets) {
    string(a.id, 'asset id'); string(a.name, 'asset name');
    if (assetIds.has(a.id)) throw new Error('Duplicate asset id.');
    assetIds.add(a.id);
    if (!['model', 'texture','audio'].includes(a.type)) throw new Error('Unsupported asset type.');
    if (![...Object.values(MODEL_MIMES), 'image/png', 'image/jpeg', 'image/webp','image/bmp','audio/wav','audio/mpeg','audio/ogg'].includes(a.mime)) throw new Error('Unsupported asset MIME type.');
    if (a.type === 'model' && !Object.values(MODEL_MIMES).includes(a.mime)) throw new Error('A model must be a supported GLB / GLTF / OBJ / FBX / STL / PLY / DAE / 3MF asset.');
    if (a.type === 'texture' && !a.mime.startsWith('image/')) throw new Error('A texture must be an image asset.');
    if (a.type === 'audio' && !a.mime.startsWith('audio/')) throw new Error('An audio source must use an audio asset.');
    if (typeof a.data !== 'string' || !a.data.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.data) || a.data.length % 4) throw new Error('Invalid asset encoding.');
    let bytes = a.data.length * 0.75;
    if(a.resources!==undefined){if(a.type!=='model'||!Array.isArray(a.resources)||a.resources.length>128)throw new Error('Invalid model resources.');const names=new Set();for(const r of a.resources){string(r.name,'resource name',500);if(resourceName(r.name)!==r.name||names.has(r.name.toLowerCase()))throw new Error('Duplicate or invalid resource path.');names.add(r.name.toLowerCase());if(!RESOURCE_MIMES.includes(r.mime)||typeof r.data!=='string'||!r.data.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.data)||r.data.length%4)throw new Error('Invalid resource encoding or MIME.');bytes+=r.data.length*.75;}}
    if(a.resourceBase!==undefined&&(typeof a.resourceBase!=='string'||a.resourceBase.length>500||a.resourceBase!==''&&resourceName(a.resourceBase)!==a.resourceBase))throw new Error('Invalid resource base.');
    if(a.sourceFormat!==undefined&&(![...Object.keys(MODEL_MIMES),'blend'].includes(a.sourceFormat)||a.type!=='model'))throw new Error('Invalid source format.');
    if (bytes > LIMITS.assetBytes + 2) throw new Error('An asset exceeds the 50 MiB limit.');
    totalAssetBytes += bytes;
    if (totalAssetBytes > 110 * 1024 * 1024) throw new Error('Total embedded assets exceed 110 MiB.');
  }
  let simulationParticles = 0, clothVertices = 0, surfaceVertices = 0, rigidBodies=0,animationKeys=0;
  for (const e of doc.entities) {
    string(e.id, 'entity id'); string(e.name, 'entity name');
    if (ids.has(e.id)) throw new Error('Duplicate entity id.');
    ids.add(e.id);
    if (!KINDS.includes(e.kind)) throw new Error(`Unknown entity type: ${e.kind}`);
    bool(e.visible, 'visibility'); bool(e.locked, 'lock'); bool(e.castShadow, 'cast shadow'); bool(e.receiveShadow, 'receive shadow');
    bool(e.collider, 'collision flag');
    vector(e.transform?.position, 'position'); vector(e.transform?.rotation, 'rotation'); vector(e.transform?.scale, 'scale', true);
    if (e.parent !== null && typeof e.parent !== 'string') throw new Error('Invalid entity parent.');
    const m = e.material;
    color(m?.color, 'material color'); color(m?.emissive, 'emissive color');
    finite(m.metalness, 'metalness', 0, 1); finite(m.roughness, 'roughness', 0.02, 1);
    finite(m.emissiveIntensity, 'emissive intensity', 0, 20); finite(m.opacity, 'opacity', 0.05, 1);
    if (m.texture !== null && !doc.assets.some(a => a.id === m.texture && a.type === 'texture')) throw new Error('Missing texture asset.');
    for(const slot of ['normalTexture','roughnessTexture','metalnessTexture','emissiveTexture']){m[slot]??=null;if(m[slot]!==null&&!doc.assets.some(a=>a.id===m[slot]&&a.type==='texture'))throw new Error('Missing material map asset.');}
    color(e.light?.color, 'light color'); finite(e.light.intensity, 'light intensity', 0, 10000); finite(e.light.distance, 'light range', 0, 1000);
    if (e.kind === 'model' && !doc.assets.some(a => a.id === e.assetId && a.type === 'model')) throw new Error('Missing model asset.');
    const animation=e.animation;if(!animation||!Array.isArray(animation.keys)||animation.keys.length>600)throw new Error('Invalid animation keys.');bool(animation.enabled,'animation enabled');if(!['linear','smooth','step'].includes(animation.interpolation))throw new Error('Invalid interpolation.');
    let last=-1;for(const key of animation.keys){finite(key.time,'keyframe time',0,doc.timeline.duration);if(key.time<=last)throw new Error('Keyframes must be sorted and unique.');last=key.time;vector(key.transform?.position,'key position');vector(key.transform?.rotation,'key rotation');vector(key.transform?.scale,'key scale',true);}animationKeys+=animation.keys.length;
    if(['model','player'].includes(e.kind)){validateCharacter(e,doc.timeline);const a=e.modelAnimation;bool(a?.enabled,'model animation');bool(a.loop,'model loop');finite(a.clip,'model clip',0,1000);finite(a.speed,'model speed',.01,10);if(!Number.isInteger(a.clip))throw new Error('Clip must be an integer.');}
    if(e.kind==='camera'){const c=e.cameraSettings;finite(c?.fov,'camera FOV',15,120);finite(c.near,'camera near',.01,10);finite(c.far,'camera far',10,10000);if(c.far<=c.near)throw new Error('Camera far must exceed near.');if(!['static','fly','walk'].includes(c.controller))throw new Error('Invalid controller.');finite(c.speed,'controller speed',.1,50);finite(c.eyeHeight,'eye height',.2,5);}
    if(e.kind==='audio'){const a=e.audio;if(a?.asset!==null&&!doc.assets.some(x=>x.id===a?.asset&&x.type==='audio'))throw new Error('Missing audio asset.');finite(a?.volume,'audio volume',0,1);finite(a.pitch,'audio pitch',.25,4);finite(a.distance,'audio distance',.1,100);finite(a.rolloff,'audio rolloff',0,5);bool(a.loop,'audio loop');bool(a.autoplay,'audio autoplay');}
    if(e.kind==='trigger'){const c=e.trigger;for(const k of ['width','height','depth'])finite(c?.[k],'trigger size',.1,100);if(!['sound','toggle','hide','show'].includes(c.action))throw new Error('Invalid trigger action.');bool(c.once,'trigger once');if(c.target!==null&&typeof c.target!=='string')throw new Error('Invalid trigger target.');}
    if(e.kind==='water'){const c=e.simulation;finite(c?.width,'water width',2,200);finite(c.depth,'water depth',2,200);finite(c.resolution,'water resolution',16,128);if(!Number.isInteger(c.resolution))throw new Error('Water resolution must be an integer.');finite(c.waveSpeed,'wave speed',.1,8);finite(c.damping,'wave damping',.05,10);finite(c.amplitude,'wave amplitude',0,1);finite(c.wavelength,'wavelength',.2,30);finite(c.speed,'wave motion',0,10);finite(c.rainRate,'rain rate',0,30);finite(c.rippleStrength,'ripple strength',.01,1);finite(c.rippleRadius,'ripple radius',.1,3);bool(c.interactions,'water interactions');surfaceVertices+=(c.resolution+1)**2;}
    if(e.kind==='terrain'){const c=e.terrain;finite(c?.width,'terrain width',2,200);finite(c.depth,'terrain depth',2,200);finite(c.resolution,'terrain resolution',8,128);finite(c.amplitude,'terrain amplitude',0,50);finite(c.frequency,'terrain frequency',.01,1);finite(c.octaves,'terrain octaves',1,6);finite(c.seed,'terrain seed',0,1e6);if(![c.resolution,c.octaves,c.seed].every(Number.isInteger))throw new Error('Terrain counts must be integers.');bool(c.island,'island falloff');surfaceVertices+=(c.resolution+1)**2;}
    if (!e.behaviors || typeof e.behaviors !== 'object' || Array.isArray(e.behaviors)) throw new Error('Invalid behaviors.');
    for (const [key, b] of Object.entries(e.behaviors)) {
      if (!Object.hasOwn(BEHAVIOR_DEFAULTS,key) || !b || typeof b !== 'object') throw new Error(`Unsupported behavior: ${key}`);
      if (key === 'spin') { finite(b.speed, 'spin speed', -720, 720); if (b.axis !== undefined && !['X','Y','Z'].includes(b.axis)) throw new Error('Invalid rotation axis.'); }
      if (key === 'float') { finite(b.amplitude, 'float amplitude', 0, 100); finite(b.speed, 'float speed', 0, 20); }
      if (key === 'orbit') { finite(b.radius, 'orbit radius', 0, 1000); finite(b.speed, 'orbit speed', -20, 20); }
      if (key === 'rigidbody') { finite(b.restitution, 'restitution', 0, 1); finite(b.floor, 'collision floor', -10000, 10000);if(!['box','sphere','cylinder'].includes(e.kind))throw new Error('Rigid Body needs a cube, sphere or cylinder.');for(const [k,lo,hi] of [['mass',.01,1000],['friction',0,1],['damping',0,10],['x',-100,100],['y',-100,100],['z',-100,100]])finite(b[k]??RIGID_DEFAULTS[k],'rigid '+k,lo,hi);rigidBodies++; }
      if (key === 'velocity') ['x','y','z'].forEach(k => finite(b[k], 'velocity', -100, 100));
      if (key === 'oscillate') { if(!['X','Y','Z'].includes(b.axis))throw new Error('Invalid oscillation axis.');finite(b.amplitude,'oscillation amplitude',0,100);finite(b.speed,'oscillation frequency',0,20); }
      if (key === 'pulse') { finite(b.amplitude,'pulse amplitude',0,.9);finite(b.speed,'pulse frequency',0,20); }
      if (key === 'spring') { finite(b.stiffness,'spring stiffness',.1,100);finite(b.damping,'spring damping',0,20);['x','y','z'].forEach(k=>finite(b[k],'spring impulse',-50,50)); }
      if(key==='path'){if(!['X','Y','Z'].includes(b.axis))throw new Error('Invalid path axis.');finite(b.distance,'path distance',.1,100);finite(b.speed,'path speed',.01,50);bool(b.pingPong,'path ping pong');}
      if(['follow','lookAt','joint'].includes(key)&&b.target!==null&&typeof b.target!=='string')throw new Error('Invalid behavior target.');
      if(key==='follow'){finite(b.speed,'follow speed',0,50);['x','y','z'].forEach(k=>finite(b[k],'follow offset',-100,100));}
      if(key==='buoyancy'){finite(b.strength,'buoyancy',.1,10);finite(b.drag,'water drag',0,20);if(!e.behaviors.rigidbody)throw new Error('Buoyancy needs Rigid Body.');}
      if(key==='joint'){finite(b.length,'joint length',.01,50);finite(b.stiffness,'joint stiffness',.1,100);finite(b.damping,'joint damping',0,20);if(!e.behaviors.rigidbody)throw new Error('Spring Joint needs Rigid Body.');}
    }
    if (e.behaviors.float && e.behaviors.rigidbody) throw new Error('Float and Rigid Body both control vertical motion.');
    if (e.behaviors.spring && ['float','orbit','velocity','oscillate','rigidbody'].some(k=>e.behaviors[k])) throw new Error('Spring owns position; remove other position behaviors first.');
    if(e.behaviors.rigidbody&&['float','orbit','velocity','oscillate','spring','path','follow'].some(k=>e.behaviors[k]))throw new Error('Rigid Body owns position; remove other position behaviors first.');
    if(e.behaviors.spring&&['path','follow'].some(k=>e.behaviors[k]))throw new Error('Spring owns position.');
    if(animation.enabled&&animation.keys.length&&['float','orbit','velocity','oscillate','spring','path','follow','rigidbody','spin','pulse','lookAt'].some(k=>e.behaviors[k]))throw new Error('Keyframe animation owns transforms; disable animation or remove transform behaviors.');
    if (SIM_DEFAULTS[e.kind]) {
      const c=e.simulation;if(!c||typeof c!=='object')throw new Error('Missing simulation parameters.');
      if(e.kind!=='particles'){finite(c.width,'simulation width',1,30);finite(c.height,'simulation height',1,30);}
      finite(c.gravity,'gravity',0,50);
      if(e.kind==='cloth'){
        finite(c.segments,'cloth resolution',4,32);if(!Number.isInteger(c.segments))throw new Error('Cloth resolution must be an integer.');
        if(!['corners','edge','none'].includes(c.pin))throw new Error('Invalid cloth pin mode.');
        finite(c.damping,'cloth damping',0,1);finite(c.wind,'wind',-20,20);finite(c.stiffness,'cloth stiffness',.1,1);finite(c.floor,'cloth floor',-10000,10000);clothVertices+=(c.segments+1)**2;
      }else if(e.kind==='fluid'){
        finite(c.depth,'fluid depth',1,30);finite(c.count,'fluid particle count',27,768);finite(c.radius,'fluid radius',.03,.3);finite(c.viscosity,'fluid viscosity',0,1);
        if(!['surface','particles'].includes(c.display))throw new Error('Invalid fluid display.');
        if(2*c.radius*Math.ceil(Math.cbrt(c.count))>Math.min(c.width,c.height,c.depth)*.98)throw new Error('Particles do not fit: increase the fluid bounds or reduce count/radius.');
        simulationParticles+=c.count;
      }else{finite(c.count,'particle count',16,1000);finite(c.rate,'emission rate',0,500);finite(c.lifetime,'particle lifetime',.1,20);finite(c.speed,'particle speed',0,30);finite(c.spread,'emitter spread',0,2);finite(c.size,'particle size',.01,.3);finite(c.bounce,'particle bounce',0,1);finite(c.floor,'particle floor',-10000,10000);simulationParticles+=c.count;}
      if(e.kind!=='particles'){bool(c.collisions,'simulation collisions');finite(c.substeps,'simulation substeps',1,6);finite(c.iterations,'solver iterations',1,12);if(!Number.isInteger(c.substeps)||!Number.isInteger(c.iterations))throw new Error('Solver counts must be integers.');}
      if(c.count!==undefined&&!Number.isInteger(c.count))throw new Error('Particle count must be an integer.');
    }
  }
  if(simulationParticles>4000||clothVertices>12000)throw new Error('Simulation budget exceeded (4,000 particles / 12,000 cloth vertices).');
  if(surfaceVertices>100000||rigidBodies>256||animationKeys>10000)throw new Error('Scene budget exceeded (100,000 surface vertices / 256 rigid bodies / 10,000 keys).');
  if(doc.entities.filter(e=>e.player?.enabled).length>1)throw new Error('Only one player controller can be active in a scene.');
  const byId = new Map(doc.entities.map(e => [e.id, e]));
  for (const e of doc.entities) {
    for(const target of [e.trigger?.target,...Object.values(e.behaviors).map(b=>b.target)].filter(Boolean))if(!byId.has(target)||target===e.id)throw new Error('Missing or invalid target entity.');
    if(e.behaviors.joint?.target&&(!byId.get(e.behaviors.joint.target).collider||!['box','sphere','cylinder'].includes(byId.get(e.behaviors.joint.target).kind)))throw new Error('Joint target needs a primitive collider.');
    const ancestors = new Set([e.id]);
    let p = e.parent;
    while (p !== null) {
      if (!byId.has(p)) throw new Error('Missing parent entity.');
      if (ancestors.has(p)) throw new Error('Cyclic entity hierarchy.');
      ancestors.add(p); p = byId.get(p).parent;
    }
  }
  const s = doc.settings;
  color(s?.background, 'background'); finite(s.fog, 'fog', 0, 0.2); finite(s.exposure, 'exposure', 0.1, 5);
  finite(s.bloomStrength, 'bloom strength', 0, 2); finite(s.ambient, 'ambient', 0, 5);
  ['bloom', 'shadows', 'grid'].forEach(k => bool(s[k], k));
  vector(doc.camera?.position, 'camera position'); vector(doc.camera?.target, 'camera target');
  return doc;
}

/** One undo step per user gesture. Limit retained history by estimated bytes, including embedded assets. */
export class History {
  constructor(limit = 64, byteLimit = 160 * 1024 * 1024) { this.limit = limit; this.byteLimit = byteLimit; this.undoStack = []; this.redoStack = []; }
  entry(doc) { const json = JSON.stringify(doc); return { doc: JSON.parse(json), bytes: json.length * 2 }; }
  trim(stack) { while (stack.length > 1 && (stack.length > this.limit || stack.reduce((n, e) => n + e.bytes, 0) > this.byteLimit)) stack.shift(); }
  push(doc) { this.undoStack.push(this.entry(doc)); this.trim(this.undoStack); this.redoStack.length = 0; }
  undo(current) { if (!this.undoStack.length) return null; this.redoStack.push(this.entry(current)); this.trim(this.redoStack); return this.undoStack.pop().doc; }
  redo(current) { if (!this.redoStack.length) return null; this.undoStack.push(this.entry(current)); this.trim(this.undoStack); return this.redoStack.pop().doc; }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

export function descendants(doc, id) {
  const result = new Set([id]);
  let changed;
  do { changed = false; for (const e of doc.entities) if (result.has(e.parent) && !result.has(e.id)) { result.add(e.id); changed = true; } } while (changed);
  return result;
}

export function duplicateEntities(doc, id) {
  const ids = descendants(doc, id), remap = new Map([...ids].map(old => [old, uid()]));
  const copies = doc.entities.filter(e => ids.has(e.id)).map(e => {
    const c = clone(e);if(c.player)c.player.enabled=false; c.id = remap.get(e.id); c.parent = remap.get(e.parent) ?? e.parent;
    for(const b of Object.values(c.behaviors))if(b.target&&remap.has(b.target))b.target=remap.get(b.target);
    if(c.trigger?.target&&remap.has(c.trigger.target))c.trigger.target=remap.get(c.trigger.target);
    if (e.id === id) { c.name += ' Copy'; c.transform.position[0] += 1.5;for(const k of c.animation.keys)k.transform.position[0]+=1.5; }
    return c;
  });
  if (doc.entities.length + copies.length > LIMITS.entities) throw new Error('Entity limit exceeded.');
  doc.entities.push(...copies);
  return remap.get(id);
}
