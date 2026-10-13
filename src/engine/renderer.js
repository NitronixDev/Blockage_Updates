import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadModel } from './model-loader.js';
import { RigState, autoRig } from './rigging.js';
import { createCharacter, locomotionClips } from './character.js';
import { ModelAnimator } from './model-animation.js';
import { PlayerController } from './player-controller.js';
import { Simulation } from './simulation.js';
import { isLight } from './document.js';
import { SIM_DEFAULTS } from './physics.js';
import { configureSimulationObject } from './simulation-objects.js';
import { configureProceduralObject, PROCEDURAL_KINDS } from './procedural-objects.js';
import { RigidWorld } from './rigid-world.js';
import { sampleTerrain } from './terrain.js';
import { sampleAnimation } from './animation.js';
import { AudioRuntime } from './audio.js';

const rad = THREE.MathUtils.degToRad, deg = THREE.MathUtils.radToDeg;
function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse(o => { if(o.isSkinnedMesh)skeletons.add(o.skeleton); if (o.geometry) geometries.add(o.geometry); for (const source of [o.material, o.userData.originalMaterial]) for (const m of Array.isArray(source) ? source : source ? [source] : []) { materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); } if (o.shadow) o.shadow.dispose(); });
  for(const skeleton of skeletons)skeleton.dispose(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
}

export class WorldRenderer {
  constructor(canvas, host, events = {}) {
    this.canvas = canvas; this.host = host; this.events = events;
    this.scene = new THREE.Scene(); this.content = new THREE.Group(); this.scene.add(this.content);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.05, 600);
    this.camera.position.set(12, 9, 14);
    this.selectedBoneOwner=null;this.selectedBone=0;this.playerLook={yaw:0,pitch:.12};this.objects = new Map(); this.markers = new Map(); this.mixers = [];
    this.audio=new AudioRuntime(this.camera,(level,text)=>this.events.log?.(level,text));this.gameView=false;this.previewTime=0;this.waterContacts=new Map();this.triggerStates=new Map();
    this.helpers = new THREE.Group(); this.scene.add(this.helpers);
    this.grid = new THREE.GridHelper(40, 40, '#555555', '#494949'); this.grid.position.y = 0.012;
    this.grid.material.transparent = true; this.grid.material.opacity = 0.28; this.grid.material.depthWrite = false; this.grid.userData.editorOnly = true;
    this.scene.add(this.grid);
    this.ambient = new THREE.HemisphereLight('#c2d9e8', '#516068', 0.85); this.scene.add(this.ambient);
    this.selectionBox = new THREE.BoxHelper(undefined, '#f5a469'); this.selectionBox.visible = false; this.selectionBox.material.depthTest = false; this.selectionBox.material.transparent = true; this.selectionBox.material.opacity = 0.68; this.selectionBox.renderOrder = 5; this.scene.add(this.selectionBox);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = 0.09; this.controls.target.set(0, 1.5, 0); this.controls.maxDistance = 250; this.controls.minDistance = 0.3;
    this.controls.mouseButtons.RIGHT = null;
    this.transform = new TransformControls(this.camera, canvas); this.transform.setSize(0.8); this.transform.setMode('translate');
    this.gizmo = this.transform.getHelper(); this.scene.add(this.gizmo);
    this.transform.addEventListener('dragging-changed', event => { this.controls.enabled = !event.value; });
    this.transform.addEventListener('mouseDown', () => this.events.beforeTransform?.());
    this.transform.addEventListener('objectChange', () => {
      const o = this.transform.object;
      if (!o) return;
      o.scale.set(Math.max(o.scale.x, 0.001), Math.max(o.scale.y, 0.001), Math.max(o.scale.z, 0.001));
      if(o.isBone&&o.userData.boneOwner){const rig=this.objects.get(o.userData.boneOwner)?.userData.rigState;this.events.boneTransform?.(o.userData.boneOwner,rig.offsets(o.userData.boneIndex));}else this.events.transform?.(o.userData.entityId, { position: o.position.toArray(), rotation: [deg(o.rotation.x), deg(o.rotation.y), deg(o.rotation.z)], scale: o.scale.toArray() });
      this.updateSelection();
    });
    this.transform.addEventListener('mouseUp', () => this.events.afterTransform?.());
    this.simulation = new Simulation(); this.selectedId = null; this.viewMode = 'lit'; this.tool = 'translate'; this.generation = 0; this.keys = new Set(); this.fly = false;
    this.bindInput();
  }
  async init(forceWebGL = false) {
    // Retain the navigator GPU object for the entire renderer lifetime (including async pipeline compilation).
    this.gpu = navigator.gpu;
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance', forceWebGL });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.AgXToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    await this.renderer.init();
    this.backend = this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    if (this.renderer.backend.isWebGPUBackend) {
      const device = this.renderer.backend.device;
      this.adapterInfo = device.adapterInfo ? { vendor: device.adapterInfo.vendor, architecture: device.adapterInfo.architecture, description: device.adapterInfo.description, device: device.adapterInfo.device } : {};
      device.lost.then(info => { if (info.reason !== 'destroyed') { this.stop(); this.events.fatal?.(`Graphics device lost: ${info.message || info.reason}. Relaunch Blockage in compatibility mode.`); } });
      device.addEventListener('uncapturederror', event => this.events.log?.('error', `GPU: ${event.error.message}`));
    }
    const room = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(this.renderer);
    try { this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.65; }
    catch (e) { this.events.log?.('warn', `Environment lighting unavailable: ${e.message}`); }
    finally { room.dispose(); pmrem.dispose(); }
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.host); this.resize();
    this.lastTime = performance.now(); this.sampleTime = this.lastTime; this.frames = 0; this.renderFailed = false;
    this.onPipelineRejection = event => {
      const text = String(event.reason?.message || event.reason);
      if (this.backend === 'WebGPU' && /GPU|Instance|device|pipeline|shader/i.test(text)) {
        event.preventDefault();
        if (!this.renderFailed) { this.renderFailed = true; this.renderer.setAnimationLoop(null); this.events.fatal?.(`GPU pipeline failed: ${text}. Relaunch with START_BLOCKAGE_COMPAT.bat.`); }
      }
    };
    window.addEventListener('unhandledrejection', this.onPipelineRejection);
    this.renderer.setAnimationLoop(timestamp => {
      if (this.renderFailed) return;
      try { this.frame(timestamp || performance.now()); } catch (error) { this.renderFailed = true; this.events.fatal?.(`Render failed: ${error.message}. Try compatibility mode.`); }
    });
    this.events.log?.('info', `Renderer initialized · ${this.backend} · Three.js r${THREE.REVISION}`);
  }
  async loadDocument(doc, resetCamera = true) {
    const revision = ++this.generation;
    this.setGameView(false);this.audio.stop();
    this.stop();for(const o of this.objects.values())o.userData.animator?.dispose();this.selectedBoneOwner=null; this.transform.detach(); this.selectionBox.visible = false; this.selectedId = null;
    disposeObject(this.content); this.content.clear(); disposeObject(this.helpers); this.helpers.clear();
    const environment=this.scene.environment,environmentIntensity=this.scene.environmentIntensity;
    this.scene=new THREE.Scene();this.scene.environment=environment;this.scene.environmentIntensity=environmentIntensity;
    this.scene.add(this.content,this.helpers,this.grid,this.ambient,this.selectionBox,this.gizmo);
    this.pipeline?.dispose();this.scenePass?.dispose();this.bloomNode?.dispose();this.pipeline=null;this.scenePass=null;this.bloomNode=null;
    this.objects.clear(); this.markers.clear(); this.mixers = []; this.doc = doc;
    this.textures ||= new Map(); for (const t of this.textures.values()) t.dispose(); this.textures.clear();
    const textureLoader = new THREE.TextureLoader();
    for (const a of doc.assets.filter(a => a.type === 'texture')) {
      const t = await textureLoader.loadAsync(`data:${a.mime};base64,${a.data}`); t.colorSpace = THREE.SRGBColorSpace;
      if (revision !== this.generation) { t.dispose(); return; }
      this.textures.set(a.id, t);
    }
    const assets = new Map(doc.assets.map(a => [a.id, a]));
    const pending = [];
    for (const e of doc.entities) {
      let object;
      if (e.kind === 'group' || ['model','player'].includes(e.kind) || SIM_DEFAULTS[e.kind] || PROCEDURAL_KINDS.includes(e.kind)) object = new THREE.Group();
      else if (isLight(e)) {
        object = e.kind === 'directionalLight' ? new THREE.DirectionalLight(e.light.color, e.light.intensity) : new THREE.PointLight(e.light.color, e.light.intensity, e.light.distance, 2);
        if (e.kind === 'directionalLight') {
          object.shadow.mapSize.set(2048, 2048); Object.assign(object.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 0.5, far: 80 });
          object.shadow.bias = -0.00025; object.shadow.normalBias = 0.045; object.shadow.camera.updateProjectionMatrix();
        } else { object.shadow.mapSize.set(512, 512); object.shadow.bias = -0.001; }
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(e.kind === 'directionalLight' ? 0.22 : 0.15), new THREE.MeshBasicMaterial({ color: e.light.color, transparent: true, opacity: 0.7, wireframe: true, depthTest: false }));
        marker.userData.entityId = e.id; marker.renderOrder = 3; this.helpers.add(marker); this.markers.set(e.id, marker);
      } else {
        const geometry = e.kind === 'box' ? new THREE.BoxGeometry() : e.kind === 'sphere' ? new THREE.SphereGeometry(0.5, 32, 24) : e.kind === 'cylinder' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 48) : e.kind === 'torus' ? new THREE.TorusGeometry(0.6, 0.08, 12, 64) : new THREE.PlaneGeometry(1, 1);
        if (e.kind === 'plane') geometry.rotateX(-Math.PI / 2);
        object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      }
      object.name = e.name; object.userData.entityId = e.id; this.objects.set(e.id, object); this.syncEntity(e);
      if (['model','player'].includes(e.kind)) {
        pending.push((async()=>{
          try {
            const loaded=e.kind==='player'?createCharacter():await loadModel(assets.get(e.assetId));
            if(revision!==this.generation){disposeObject(loaded.root);return;}
            if(e.rig.mode!=='source'){const bones=autoRig(loaded.root,e.rig);loaded.stats.bones=bones.length;if(e.rig.mode==='humanoid'&&!loaded.animations.length)loaded.animations=locomotionClips(bones);}
            loaded.stats.clips=loaded.animations.length;loaded.root.traverse(child=>{child.userData.entityId=e.id;if(child.isMesh){child.castShadow=e.castShadow;child.receiveShadow=e.receiveShadow;}});
            object.add(loaded.root);const rig=new RigState(loaded.root,e);if([...e.rig.poses,...e.rig.keys.flatMap(k=>k.poses)].some(p=>p.bone>=rig.bones.length))throw new Error('A saved pose refers to a missing bone.');
            rig.bones.forEach((b,i)=>{b.userData.boneOwner=e.id;b.userData.boneIndex=i;});this.helpers.add(rig.helper);
            Object.assign(object.userData,{rigState:rig,clips:loaded.animations,modelStats:loaded.stats,animator:new ModelAnimator(loaded.root,loaded.animations,rig,e)});
            object.userData.modelMixer=object.userData.animator.mixer;this.configureModelAnimation(e,object);this.applyViewMode();
          }catch(error){this.events.log?.('error',`Model ${e.name}: ${error.message}`);throw error;}
        })());
      }
    }
    for (const e of doc.entities) (e.parent ? this.objects.get(e.parent) : this.content).add(this.objects.get(e.id));
    if (resetCamera) { this.camera.position.fromArray(doc.camera.position); this.controls.target.fromArray(doc.camera.target); this.controls.update(); }
    this.applySettings();
    const results = await Promise.allSettled(pending);
    if (revision !== this.generation) return;
    await this.audio.load(doc,this.objects);
    this.scene.updateMatrixWorld(true); this.updateMarkers(); this.applyViewMode();
    const failed = results.filter(r => r.status === 'rejected').length;
    if(failed)throw new Error(results.find(r=>r.status==='rejected').reason?.message||'A model could not load.');
  }
  syncEntity(e) {
    const object = this.objects.get(e.id); if (!object) return;
    object.name = e.name; object.visible = e.visible; object.position.fromArray(e.transform.position); object.rotation.set(...e.transform.rotation.map(rad)); object.scale.fromArray(e.transform.scale);
    object.castShadow = e.castShadow; object.receiveShadow = e.receiveShadow;
    if(SIM_DEFAULTS[e.kind])configureSimulationObject(object,e);
    if(PROCEDURAL_KINDS.includes(e.kind))configureProceduralObject(object,e);
    if(e.kind==='audio')this.audio.configure(e,object);
    if(['model','player'].includes(e.kind))this.configureModelAnimation(e,object);
    if (isLight(e)) { object.color.set(e.light.color); object.intensity = e.light.intensity; if (e.kind === 'pointLight') object.distance = e.light.distance; this.markers.get(e.id)?.material.color.set(e.light.color); }
    const meshes=[];if(object.isMesh)meshes.push(object);else if(SIM_DEFAULTS[e.kind]||['water','terrain'].includes(e.kind))object.traverse(o=>{if(o.isMesh)meshes.push(o);});
    for (const mesh of meshes) {
      const m = mesh.userData.originalMaterial || mesh.material;
      m.color.set(e.material.color); m.metalness = e.material.metalness; m.roughness = e.material.roughness;
      m.emissive.set(e.material.emissive); m.emissiveIntensity = e.material.emissiveIntensity;
      const previous = m.map; m.map = this.textures?.get(e.material.texture) || null;
      if (previous !== m.map) m.needsUpdate = true;
      for(const [slot,field] of [['normalMap','normalTexture'],['roughnessMap','roughnessTexture'],['metalnessMap','metalnessTexture'],['emissiveMap','emissiveTexture']]){const asset=e.material[field],colorSpace=slot==='emissiveMap'?THREE.SRGBColorSpace:THREE.NoColorSpace,key=asset+':'+slot;let texture=null;if(asset&&this.textures?.has(asset)){if(!this.textures.has(key)){texture=this.textures.get(asset).clone();texture.colorSpace=colorSpace;texture.needsUpdate=true;this.textures.set(key,texture);}texture=this.textures.get(key);}if(m[slot]!==texture){m[slot]=texture;m.needsUpdate=true;}}
      const transparent = e.material.opacity < 1; if (m.transparent !== transparent) m.needsUpdate = true;
      m.opacity = e.material.opacity; m.transparent = transparent; m.side = ['plane','cloth','water','terrain'].includes(e.kind) ? THREE.DoubleSide : THREE.FrontSide;
      mesh.castShadow=e.castShadow;mesh.receiveShadow=e.receiveShadow;
      if (mesh.userData.originalMaterial) { mesh.material.color.copy(m.color); mesh.material.map = m.map; mesh.material.opacity = m.opacity; mesh.material.transparent = m.transparent; mesh.material.needsUpdate = true; }
    }
    if (['model','player'].includes(e.kind)) object.traverse(child => { if (child.isMesh) { child.castShadow = e.castShadow; child.receiveShadow = e.receiveShadow; } });
    if(SIM_DEFAULTS[e.kind]||PROCEDURAL_KINDS.includes(e.kind))this.applyViewMode();
    if (this.selectedId === e.id) this.select(e.id);
    this.scene.updateMatrixWorld(true); this.updateMarkers();
  }
  applySettings() {
    if (!this.doc || !this.renderer) return;
    const s = this.doc.settings; this.scene.background = new THREE.Color(s.background); this.scene.fog = new THREE.FogExp2(s.background, s.fog);
    this.renderer.toneMappingExposure = s.exposure; this.renderer.shadowMap.enabled = s.shadows;
    this.ambient.intensity = s.ambient; this.grid.visible = s.grid && !this.simulation.running;
    if (!this.pipeline) {
      this.pipeline = new THREE.RenderPipeline(this.renderer); this.scenePass = pass(this.scene, this.camera);
      this.scenePassColor = this.scenePass.getTextureNode('output'); this.bloomNode = bloom(this.scenePassColor, s.bloomStrength, 0.25, 1.15);
    }
    this.bloomNode.strength.value = s.bloomStrength;
    this.pipeline.outputNode = s.bloom && this.viewMode === 'lit' ? this.scenePassColor.add(this.bloomNode) : this.scenePassColor;
    this.pipeline.needsUpdate = true;
  }
  select(id) {
    if(this.selectedBoneOwner!==id)this.selectedBoneOwner=null;this.selectedId = id; this.transform.detach();
    const object = this.objects.get(id), e = this.doc?.entities.find(x => x.id === id);
    this.selectionBox.visible = Boolean(object && e && !isLight(e) && !this.simulation.running && !this.gameView);
    if (object && e && !e.locked && !this.simulation.running && !this.gameView && this.tool !== 'select') this.transform.attach(this.selectedBoneOwner===id?object.userData.rigState?.bones[this.selectedBone]||object:object);
    this.updateSelection();
  }
  selectBone(index){const rig=this.objects.get(this.selectedId)?.userData.rigState;if(!rig?.bones[index])return;this.selectedBoneOwner=this.selectedId;this.selectedBone=index;this.select(this.selectedId);}
  objectMode(){this.selectedBoneOwner=null;this.select(this.selectedId);}
  updateSelection() { const o = this.objects.get(this.selectedId); if (o && this.selectionBox.visible) this.selectionBox.setFromObject(o); }
  setTool(tool) { this.tool = tool; if (tool !== 'select') this.transform.setMode(tool); this.select(this.selectedId); }
  setSpace(space) { this.transform.setSpace(space); }
  setSnap(enabled) { this.transform.setTranslationSnap(enabled ? 0.5 : null); this.transform.setRotationSnap(enabled ? rad(15) : null); this.transform.setScaleSnap(enabled ? 0.1 : null); }
  reparent(entity, parentId) {
    const object = this.objects.get(entity.id), parent = parentId ? this.objects.get(parentId) : this.content;
    parent.attach(object);
    entity.parent = parentId;
    entity.transform = { position: object.position.toArray(), rotation: [deg(object.rotation.x), deg(object.rotation.y), deg(object.rotation.z)], scale: object.scale.toArray() };
  }
  setViewMode(mode) { this.viewMode = mode; this.applyViewMode(); this.applySettings(); }
  applyViewMode() {
    // Unlit uses per-material base color via a basic material, including model meshes.
    this.content.traverse(o => {
      if (!o.isMesh) return;
      if (this.viewMode === 'unlit') {
        if (!o.userData.originalMaterial) { o.userData.originalMaterial = o.material; const original = Array.isArray(o.material) ? o.material : [o.material]; const mapped = original.map(m => new THREE.MeshBasicMaterial({ color: m.color || '#ffffff', map: m.map || null, opacity: m.opacity, transparent: m.transparent, side: m.side })); o.material = Array.isArray(o.material) ? mapped : mapped[0]; }
      } else if (o.userData.originalMaterial) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); o.material = o.userData.originalMaterial; delete o.userData.originalMaterial; }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.wireframe = this.viewMode === 'wireframe';
    });
  }
  focus(id = this.selectedId) {
    const o = this.objects.get(id); if (!o) return;
    const box = new THREE.Box3().setFromObject(o), center = box.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? 2 : Math.max(1, box.getSize(new THREE.Vector3()).length());
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!direction.length()) direction.set(1, 0.7, 1).normalize();
    this.controls.target.copy(center); this.camera.position.copy(center).addScaledVector(direction, size * 1.5); this.controls.update();
  }
  setCameraView(view) {
    const target = this.controls.target, distance = Math.max(5, this.camera.position.distanceTo(target));
    const v = view === 'top' ? [0, distance, 0.001] : view === 'front' ? [0, 0.001, distance] : view === 'right' ? [distance, 0.001, 0] : [distance * 0.62, distance * 0.55, distance * 0.62];
    this.camera.position.copy(target).add(new THREE.Vector3(...v)); this.controls.update();
  }
  updateMarkers() { for (const [id, marker] of this.markers) { const object = this.objects.get(id); object.getWorldPosition(marker.position); marker.visible = object.isVisibleInHierarchy ? object.isVisibleInHierarchy() : visibleInHierarchy(object); } }
  start() {
    if (!this.doc || this.simulation.running) return;
    this.restorePreview();this.waterContacts.clear();this.triggerStates.clear();this.playerVelocityY=0;this.jumpRequested=false;
    this.transform.detach(); this.selectionBox.visible = false; this.grid.visible = false; this.helpers.visible = false;
    for(const o of this.objects.values())if(o.userData.guide)o.userData.guide.visible=false;
    this.simulation.start(this.doc.entities, this.objects, {
      timeline:this.doc.timeline,updateColliders:()=>this.updateCollisionSnapshot(), colliders:(e,o)=>this.localColliders(e,o),
      createRigidWorld:()=>this.createRigidWorld(),updateRigidStatics:(world,dt)=>this.updateRigidStatics(world,dt),applyRigidWorld:world=>this.applyRigidWorld(world),
      groundAt:(x,z)=>this.groundAt(x,z),waterAt:(x,z)=>this.surfaceHeight('water',x,z),interactions:dt=>this.updateWaterInteractions(dt),
      targetLocal:(target,o)=>{const p=target.getWorldPosition(new THREE.Vector3());return o.parent.worldToLocal(p);},lookAt:(o,target)=>o.lookAt(target.getWorldPosition(new THREE.Vector3())),
      afterStep:()=>{this.updatePlayer(1/60);this.updateAnimationTick(1/60,this.simulation.time);this.updateTriggers();}
    });
    for(const e of this.doc.entities){const o=this.objects.get(e.id);if(!o)continue;o.userData.controller=null;if(e.player?.enabled){const p=o.getWorldPosition(new THREE.Vector3()),rotation=new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()),'YXZ');o.userData.controller=new PlayerController(e.player,p.toArray(),rotation.y);}}
    this.audio.start(this.doc.entities);
  }
  stop() { this.audio.stop();this.simulation.stop();this.restorePreview();this.setGameView(false);for(const o of this.objects.values())o.userData.controller=null; this.helpers.visible = true;for(const o of this.objects.values())if(o.userData.guide)o.userData.guide.visible=true; if (this.doc) this.grid.visible = this.doc.settings.grid; this.select(this.selectedId); }
  configureModelAnimation(e,o){const animator=o.userData.animator;if(!animator)return;animator.entity=e;animator.rig.entity=e;animator.configure();animator.seek(this.previewTime,this.doc.timeline,true);o.userData.clipAction=animator.current;}
  updateModelAnimations(time,authored=false){for(const e of this.doc.entities){const o=this.objects.get(e.id);o?.userData.animator?.seek(time,this.doc.timeline,authored);}}
  updateAnimationTick(dt,time){for(const e of this.doc.entities){const o=this.objects.get(e.id);if(o?.userData.animator){o.userData.animator.advance(dt,time,this.doc.timeline,o.userData.controller);o.userData.clipAction=o.userData.animator.current;}}}
  previewAnimation(time){if(this.simulation.running)return;this.previewTime=time;for(const e of this.doc.entities){const o=this.objects.get(e.id),pose=sampleAnimation(e.animation,time,this.doc.timeline.duration,false)||e.transform;o.position.fromArray(pose.position);o.rotation.set(...pose.rotation.map(rad));o.scale.fromArray(pose.scale);}this.updateModelAnimations(time);this.scene.updateMatrixWorld(true);this.updateMarkers();this.updateSelection();}
  restorePreview(){if(!this.doc)return;this.previewTime=0;for(const e of this.doc.entities){const o=this.objects.get(e.id);if(o){o.position.fromArray(e.transform.position);o.rotation.set(...e.transform.rotation.map(rad));o.scale.fromArray(e.transform.scale);}}this.updateModelAnimations(0,true);}
  createRigidWorld(){
    this.scene.updateMatrixWorld(true);const bodies=[];
    for(const e of this.doc.entities){if(!e.collider&&!e.behaviors.rigidbody||!['box','sphere','cylinder'].includes(e.kind))continue;const o=this.objects.get(e.id);if(!visibleInHierarchy(o))continue;const bounds=new THREE.Box3().setFromObject(o),p=o.getWorldPosition(new THREE.Vector3()),half=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5).toArray(),b=e.behaviors.rigidbody;
      if(e.kind==='sphere'){const r=Math.max(...half);half.fill(r);}bodies.push({id:e.id,type:e.kind==='sphere'?'sphere':'box',collisions:e.collider,position:p.toArray(),half,velocity:[b?.x||0,b?.y||0,b?.z||0],invMass:b?1/(b.mass||1):0,restitution:b?.restitution??.2,friction:b?.friction??.5,damping:b?.damping??.05,floor:b?.floor??-10000,buoyancy:e.behaviors.buoyancy,joint:e.behaviors.joint});}
    return new RigidWorld(bodies);
  }
  updateRigidStatics(world,dt){this.scene.updateMatrixWorld(true);for(const body of world.bodies){const o=this.objects.get(body.id),box=new THREE.Box3().setFromObject(o);body.half=box.getSize(new THREE.Vector3()).multiplyScalar(.5).toArray();if(body.type==='sphere')body.half.fill(Math.max(...body.half));if(!body.invMass){const p=o.getWorldPosition(new THREE.Vector3()).toArray();body.velocity=p.map((v,k)=>(v-body.position[k])/dt);body.position=p;}}}
  applyRigidWorld(world){for(const body of world.bodies)if(body.invMass){const o=this.objects.get(body.id),p=new THREE.Vector3(...body.position);o.position.copy(o.parent.worldToLocal(p));}this.scene.updateMatrixWorld(true);}
  surfaceHeight(kind,x,z){let height=null;for(const e of this.doc?.entities||[]){if(e.kind!==kind||kind==='terrain'&&!e.collider)continue;const o=this.objects.get(e.id);if(!visibleInHierarchy(o))continue;const base=o.getWorldPosition(new THREE.Vector3()),local=o.worldToLocal(new THREE.Vector3(x,base.y,z));const y=kind==='water'?o.userData.solver.sample(local.x,local.z):sampleTerrain(local.x,local.z,e.terrain);if(y!==null){const worldY=o.localToWorld(new THREE.Vector3(local.x,y,local.z)).y;height=height===null?worldY:Math.max(height,worldY);}}return height;}
  groundAt(x,z){let height=this.surfaceHeight('terrain',x,z);for(const e of this.doc?.entities||[])if(e.kind==='plane'){const o=this.objects.get(e.id);if(!visibleInHierarchy(o))continue;const base=o.getWorldPosition(new THREE.Vector3()),p=o.worldToLocal(new THREE.Vector3(x,base.y,z));if(Math.abs(p.x)<=.5&&Math.abs(p.z)<=.5){const y=o.localToWorld(new THREE.Vector3(p.x,0,p.z)).y;height=height===null?y:Math.max(height,y);}}return height;}
  updateWaterInteractions(dt){
    this.scene.updateMatrixWorld(true);
    for(const water of this.doc.entities.filter(e=>e.kind==='water'&&e.simulation.interactions)){const o=this.objects.get(water.id);if(!visibleInHierarchy(o))continue;const solver=o.userData.solver;
      for(const e of this.doc.entities.filter(e=>e.collider&&['sphere','box','cylinder'].includes(e.kind))){const body=this.objects.get(e.id);if(!visibleInHierarchy(body))continue;const p=o.worldToLocal(body.getWorldPosition(new THREE.Vector3())),size=body.getWorldScale(new THREE.Vector3()),waterScale=o.getWorldScale(new THREE.Vector3()),r=Math.max(size.x,size.z)*.5/Math.max(waterScale.x,waterScale.z),y=solver.sample(p.x,p.z),key=water.id+e.id,previous=this.waterContacts.get(key),touch=y!==null&&Math.abs(p.y-y)<size.y*.7/waterScale.y;
        const movement=previous?p.distanceTo(previous.p):0,entered=touch&&!previous?.touch;
        if(touch&&(entered||movement>.01)){const strength=Math.min(.8,entered?water.simulation.rippleStrength:movement/dt*.012);solver.ripple(p.x,p.z,-strength,Math.max(water.simulation.rippleRadius,r*.5));}
        this.waterContacts.set(key,{p:p.clone(),touch});
      }
      let splashes=0;for(const e of this.doc.entities.filter(e=>e.kind==='particles')){const emitter=this.objects.get(e.id),particles=emitter.userData.solver;if(!visibleInHierarchy(emitter))continue;for(let i=0;i<Math.min(particles.count,256);i++){if(particles.ages[i]<0)continue;const p=o.worldToLocal(emitter.localToWorld(new THREE.Vector3().fromArray(particles.positions,i*3))),key=water.id+e.id+i,previous=this.waterContacts.get(key),y=solver.sample(p.x,p.z);if(y!==null&&previous?.age<=particles.ages[i]&&previous.p.y>y&&p.y<=y&&splashes<8){solver.ripple(p.x,p.z,-Math.min(.12,water.simulation.rippleStrength*.2),.2);splashes++;}this.waterContacts.set(key,{p:p.clone(),age:particles.ages[i]});}}
    }
  }
  addRipple(id,point=null){const e=this.doc.entities.find(e=>e.id===id&&e.kind==='water'),o=this.objects.get(id);if(!e||!o)return false;const p=point?o.worldToLocal(point.clone()):new THREE.Vector3();o.userData.solver.ripple(p.x,p.z);o.userData.updateSimulation();return true;}
  updateTriggers(){if(!this.gameView)return;const cameraPosition=this.gamePlayerId?this.objects.get(this.gamePlayerId).getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.8,0)):this.camera.position;for(const e of this.doc.entities.filter(e=>e.kind==='trigger')){const o=this.objects.get(e.id);if(!visibleInHierarchy(o))continue;const p=o.worldToLocal(cameraPosition.clone()),c=e.trigger,inside=Math.abs(p.x)<c.width/2&&Math.abs(p.y)<c.height/2&&Math.abs(p.z)<c.depth/2,state=this.triggerStates.get(e.id)||{inside:false,fired:false};if(inside&&!state.inside&&(!c.once||!state.fired)&&c.target){const target=this.objects.get(c.target);if(c.action==='sound')this.audio.trigger(c.target);else if(target)target.visible=c.action==='toggle'?!target.visible:c.action==='show';state.fired=true;this.events.log?.('info',`Trigger: ${e.name}`);}state.inside=inside;this.triggerStates.set(e.id,state);}}
  setGameView(enabled){
    if(enabled===this.gameView)return;
    if(enabled){const actor=this.doc?.entities.find(e=>e.player?.enabled&&e.visible),e=actor||this.doc?.entities.find(e=>e.kind==='camera'&&e.visible);if(!e)throw new Error('Add a Player or Camera before switching to Game view.');this.gamePlayerId=actor?.id||null;this.playerLook={yaw:0,pitch:.12};this.savedEditorCamera={...this.captureCamera(),fov:this.camera.fov,near:this.camera.near,far:this.camera.far};this.gameCameraId=e.id;this.gameView=true;this.controls.enabled=false;this.transform.detach();this.selectionBox.visible=false;this.applyGameCamera();}
    else{this.hidePlayerBody(false);this.gamePlayerId=null;this.gameView=false;this.keys.clear();this.fly=false;if(this.savedEditorCamera){const s=this.savedEditorCamera;this.camera.position.fromArray(s.position);this.controls.target.fromArray(s.target);this.camera.fov=s.fov;this.camera.near=s.near;this.camera.far=s.far;this.camera.updateProjectionMatrix();this.savedEditorCamera=null;}this.controls.enabled=true;this.controls.update();this.select(this.selectedId);}
  }
  hidePlayerBody(hidden){const o=this.objects.get(this.gamePlayerId);o?.traverse(child=>{if(!child.isMesh)return;if(hidden){if(child.userData.playerVisible===undefined)child.userData.playerVisible=child.visible;child.visible=false;}else if(child.userData.playerVisible!==undefined){child.visible=child.userData.playerVisible;delete child.userData.playerVisible;}});}
  updatePlayer(dt){const e=this.doc.entities.find(e=>e.player?.enabled),o=this.objects.get(e?.id),controller=o?.userData.controller;if(!controller)return;this.updateCollisionSnapshot();const active=this.gameView&&this.gamePlayerId===e.id,input={x:active?(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')||this.keys.has('KeyQ')?1:0):0,z:active?(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')||this.keys.has('KeyZ')?1:0):0,yaw:this.playerLook.yaw,run:active&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')),jump:active&&this.jumpRequested};if(active)this.jumpRequested=false;const colliders=(this.collisionSnapshot||[]).map(c=>c.type==='sphere'?{type:'sphere',center:c.center.toArray(),radius:c.radius}:{type:'box',min:c.box.min.toArray(),max:c.box.max.toArray()});controller.step(dt,input,(x,z)=>this.groundAt(x,z),colliders);o.position.copy(o.parent.worldToLocal(new THREE.Vector3(...controller.position)));const world=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),controller.yaw+rad(e.player.frontOffset)),parent=o.parent.getWorldQuaternion(new THREE.Quaternion());o.quaternion.copy(parent.invert().multiply(world));o.updateWorldMatrix(true,true);}
  applyGameCamera(){if(this.gamePlayerId){const e=this.doc.entities.find(e=>e.id===this.gamePlayerId),o=this.objects.get(e?.id);if(!e||!o)return;const c=e.player,target=o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,c.cameraHeight,0)),rotation=new THREE.Euler(-this.playerLook.pitch,this.playerLook.yaw,0,'YXZ');this.camera.quaternion.setFromEuler(rotation);this.camera.position.copy(target);this.hidePlayerBody(c.camera==='firstPerson');if(c.camera==='thirdPerson'){const offset=new THREE.Vector3(0,0,c.cameraDistance).applyEuler(rotation),ray=new THREE.Raycaster(target,offset.clone().normalize(),.15,c.cameraDistance),targets=[];this.content.traverse(child=>{if(child.isMesh&&child.userData.entityId!==e.id&&visibleInHierarchy(child))targets.push(child);});const hit=ray.intersectObjects(targets,false)[0];this.camera.position.addScaledVector(offset,hit?Math.max(.15,(hit.distance-.2)/c.cameraDistance):1);}this.camera.fov=65;this.camera.near=.05;this.camera.far=600;this.camera.updateProjectionMatrix();return;}const e=this.doc.entities.find(e=>e.id===this.gameCameraId),o=this.objects.get(e?.id);if(!e||!o)return;o.getWorldPosition(this.camera.position);o.getWorldQuaternion(this.camera.quaternion);Object.assign(this.camera,{fov:e.cameraSettings.fov,near:e.cameraSettings.near,far:e.cameraSettings.far});this.camera.updateProjectionMatrix();}
  updateGameController(dt){
    if(this.gamePlayerId||!this.simulation.running||this.simulation.paused)return;const e=this.doc.entities.find(e=>e.id===this.gameCameraId),o=this.objects.get(e.id),c=e.cameraSettings;if(c.controller==='static')return;
    const speed=dt*c.speed*(this.keys.has('ShiftLeft')?2:1),direction=new THREE.Vector3((this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0),0,(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0)),p=o.getWorldPosition(new THREE.Vector3());
    direction.applyQuaternion(this.camera.quaternion);if(c.controller==='walk')direction.y=0;if(direction.length())p.addScaledVector(direction.normalize(),speed);
    if(c.controller==='fly'){if(this.keys.has('KeyQ'))p.y-=speed;if(this.keys.has('KeyE'))p.y+=speed;}
    else{this.updateCollisionSnapshot();let floor=this.groundAt(p.x,p.z)??0;const feet=o.getWorldPosition(new THREE.Vector3()).y-c.eyeHeight;
      for(const collider of this.collisionSnapshot||[]){const box=collider.type==='box'?collider.box:new THREE.Box3(new THREE.Vector3(...collider.center.toArray()).addScalar(-collider.radius),collider.center.clone().addScalar(collider.radius));if(p.x<box.min.x-.3||p.x>box.max.x+.3||p.z<box.min.z-.3||p.z>box.max.z+.3)continue;if(feet>=box.max.y-.15){floor=Math.max(floor,box.max.y);continue;}if(p.y<box.min.y||feet>box.max.y)continue;const choices=[[Math.abs(p.x-box.min.x+.3),'x',box.min.x-.3],[Math.abs(p.x-box.max.x-.3),'x',box.max.x+.3],[Math.abs(p.z-box.min.z+.3),'z',box.min.z-.3],[Math.abs(p.z-box.max.z-.3),'z',box.max.z+.3]].sort((a,b)=>a[0]-b[0]);p[choices[0][1]]=choices[0][2];}
      if(this.jumpRequested&&p.y<=floor+c.eyeHeight+.05)this.playerVelocityY=5;this.jumpRequested=false;this.playerVelocityY-=9.81*dt;p.y+=this.playerVelocityY*dt;if(p.y<floor+c.eyeHeight){p.y=floor+c.eyeHeight;this.playerVelocityY=0;}
    }
    o.position.copy(o.parent.worldToLocal(p));o.updateWorldMatrix(true,false);
  }
  updateCollisionSnapshot(){
    this.scene.updateMatrixWorld(true);this.collisionSnapshot=[];
    for(const e of this.doc.entities){if(!e.collider||!['box','sphere','cylinder'].includes(e.kind))continue;const o=this.objects.get(e.id);if(!o||!visibleInHierarchy(o))continue;
      if(e.kind==='sphere'){const scale=o.getWorldScale(new THREE.Vector3());this.collisionSnapshot.push({id:e.id,type:'sphere',center:o.getWorldPosition(new THREE.Vector3()),radius:Math.max(scale.x,scale.y,scale.z)*.5});}
      else this.collisionSnapshot.push({id:e.id,type:'box',box:new THREE.Box3().setFromObject(o)});
    }
  }
  localColliders(entity,object){
    if(!entity.simulation?.collisions)return[];const inverse=object.matrixWorld.clone().invert(),scale=object.getWorldScale(new THREE.Vector3()),divisor=Math.max(.001,Math.min(scale.x,scale.y,scale.z));
    return(this.collisionSnapshot||[]).filter(c=>c.id!==entity.id).map(c=>{if(c.type==='sphere')return{type:'sphere',center:c.center.clone().applyMatrix4(inverse).toArray(),radius:c.radius/divisor};
      const local=new THREE.Box3();for(let i=0;i<8;i++)local.expandByPoint(new THREE.Vector3(i&1?c.box.max.x:c.box.min.x,i&2?c.box.max.y:c.box.min.y,i&4?c.box.max.z:c.box.min.z).applyMatrix4(inverse));return{type:'box',min:local.min.toArray(),max:local.max.toArray()};});
  }
  pause() { if (this.simulation.running) {this.simulation.paused = !this.simulation.paused;this.audio.pause(this.simulation.paused);} }
  step() { if (this.simulation.running && this.simulation.paused) { this.simulation.step();this.simulation.refresh(); } }
  resize() { if (!this.renderer) return; const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
  frame(now) {
    const delta = Math.max(0, Math.min((now - this.lastTime) / 1000, 0.1)); this.lastTime = now;
    if (this.gameView)this.updateGameController(delta);else if (this.fly) this.updateFly(delta); else this.controls.update();
    this.simulation.update(delta);
    for(const o of this.objects.values())if(o.userData.rigState)o.userData.rigState.helper.visible=!this.gameView&&!this.simulation.running&&(o.userData.rigState.entity.rig.showSkeleton||this.selectedBoneOwner===o.userData.entityId);
    if(this.gameView)this.applyGameCamera();
    if (this.transform.object) this.updateSelection();
    if (this.pipeline) this.pipeline.render(); else this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.sampleTime > 650) {
      const fps = this.frames * 1000 / (now - this.sampleTime);
      this.events.stats?.({ fps, frameMs: 1000 / fps, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, time: this.simulation.time });
      this.sampleTime = now; this.frames = 0;
    }
  }
  bindInput() {
    let startX = 0, startY = 0, wasGizmo = false;
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('pointerdown', e => {
      this.canvas.focus(); startX = e.clientX; startY = e.clientY; wasGizmo = Boolean(this.transform.axis);
      if (e.button === 2 && !this.transform.dragging) { this.fly = true; this.controls.enabled = false; this.canvas.setPointerCapture(e.pointerId); this.flyRotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ'); }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.fly) return;
      if(this.gameView&&this.gamePlayerId){const c=this.doc.entities.find(e=>e.id===this.gamePlayerId).player;this.playerLook.yaw-=e.movementX*c.sensitivity;this.playerLook.pitch=THREE.MathUtils.clamp(this.playerLook.pitch+e.movementY*c.sensitivity,-1.1,1.1);return;}
      this.flyRotation.y -= e.movementX * 0.003; this.flyRotation.x = THREE.MathUtils.clamp(this.flyRotation.x - e.movementY * 0.003, -1.55, 1.55); this.camera.quaternion.setFromEuler(this.flyRotation);
      if(this.gameView){const o=this.objects.get(this.gameCameraId),parentRotation=o.parent.getWorldQuaternion(new THREE.Quaternion());o.quaternion.copy(parentRotation.invert().multiply(this.camera.quaternion));}
    });
    this.canvas.addEventListener('pointerup', e => {
      if (e.button === 2) this.endFly();
      if (e.button !== 0 || wasGizmo || this.transform.dragging || Math.hypot(e.clientX - startX, e.clientY - startY) > 5) return;
      const bounds = this.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1), this.camera);
      const targets = [...this.content.children, ...this.helpers.children];
      const hit = ray.intersectObjects(targets, true).find(h => h.object.userData.entityId && visibleInHierarchy(h.object));
      if(this.simulation.running){if(hit)this.addRipple(hit.object.userData.entityId,hit.point);return;}
      if(this.gameView)return;
      this.events.select?.(hit?.object.userData.entityId || null);
    });
    this.canvas.addEventListener('lostpointercapture', () => this.endFly());
    window.addEventListener('keydown', e => { if ((this.fly||this.gameView&&document.activeElement===this.canvas) && ['KeyW','KeyZ','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','Space'].includes(e.code)) { e.preventDefault(); this.keys.add(e.code);if(e.code==='Space'&&!e.repeat)this.jumpRequested=true; } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.endFly(); });
  }
  endFly() {
    if (!this.fly) return;
    if(this.gameView){this.fly=false;this.controls.enabled=false;return;}
    const distance = Math.max(1, this.camera.position.distanceTo(this.controls.target));
    this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), distance);
    this.fly = false; this.keys.clear(); this.controls.enabled = true; this.controls.update();
  }
  updateFly(dt) {
    const speed = dt * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 16 : 6), direction = new THREE.Vector3();
    if (this.keys.has('KeyW')) direction.z -= 1; if (this.keys.has('KeyS')) direction.z += 1; if (this.keys.has('KeyA')) direction.x -= 1; if (this.keys.has('KeyD')) direction.x += 1;
    if (direction.lengthSq()) { direction.normalize().applyQuaternion(this.camera.quaternion); this.camera.position.addScaledVector(direction, speed); }
    if (this.keys.has('KeyQ')) this.camera.position.y -= speed; if (this.keys.has('KeyE')) this.camera.position.y += speed;
  }
  captureCamera() { if(this.gameView&&this.savedEditorCamera)return {position:[...this.savedEditorCamera.position],target:[...this.savedEditorCamera.target]};return { position: this.camera.position.toArray(), target: this.controls.target.toArray() }; }
  dispose() { for(const o of this.objects.values())o.userData.animator?.dispose();this.audio.dispose();window.removeEventListener('unhandledrejection', this.onPipelineRejection); this.renderer.setAnimationLoop(null); this.resizeObserver?.disconnect(); this.controls.dispose(); this.transform.dispose(); disposeObject(this.content); disposeObject(this.helpers); this.environment?.dispose(); this.bloomNode?.dispose(); this.scenePass?.dispose(); this.pipeline?.dispose(); this.renderer.dispose(); this.gpu = null; }
}
function visibleInHierarchy(object) { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; }
