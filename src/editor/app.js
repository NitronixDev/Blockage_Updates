import { createEntity, createDocument, validateDocument, clone, History, descendants, duplicateEntities, isLight, LIMITS, BEHAVIOR_DEFAULTS, RIGID_DEFAULTS } from '../engine/document.js';
import { emptyWorld, simulationTest, waterTest, terrainTest, engineTest, characterTest } from '../engine/demo.js';
import { captureKey } from '../engine/animation.js';
import { createPrefab, instantiatePrefab } from '../engine/prefab.js';
import { WorldRenderer } from '../engine/renderer.js';
import { bridge } from './bridge.js';
import { installCharacterUI } from './character-ui.js';
import { icon, kindIcon } from './icons.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const primitives = ['box', 'sphere', 'cylinder', 'torus', 'plane'];
const simulated = ['cloth', 'fluid', 'particles', 'water'];
const sceneObjects = ['player','terrain','camera','audio','trigger','group'];
const editableMeshes = [...primitives,...simulated,'terrain'];
const presets = [
  { id: 'alloy', name: 'Metal', color: '#9da8b8', metalness: 0.9, roughness: 0.27, emissive: '#000000', emissiveIntensity: 0 },
  { id: 'carbon', name: 'Rubber', color: '#26313d', metalness: 0.75, roughness: 0.36, emissive: '#000000', emissiveIntensity: 0 },
  { id: 'amber', name: 'Plastic', color: '#a3a3a3', metalness: 0, roughness: 0.55, emissive: '#000000', emissiveIntensity: 0 },
  { id: 'cyan', name: 'Emission', color: '#1bbed0', metalness: 0.3, roughness: 0.2, emissive: '#28d4ec', emissiveIntensity: 2.8 }
];
const behaviorDefaults = BEHAVIOR_DEFAULTS;
const behaviorLabels = { spin: 'Rotation', float: 'Float', orbit: 'Orbit', rigidbody: 'Rigid Body', velocity: 'Velocity', oscillate: 'Oscillation', pulse: 'Scale Pulse', spring: 'Spring', path:'Path Motion', follow:'Follow Target', lookAt:'Look At', buoyancy:'Buoyancy', joint:'Spring Joint' };

class Editor {
  constructor() {
    this.doc = emptyWorld(); this.history = new History(); this.selectedId = this.doc.entities.find(e=>e.kind==='box').id; this.collapsed = new Set(); this.propertyOpen=new Set(['transform','physics','behaviors']);
    this.savedText = JSON.stringify(this.doc); this.dirty = false; this.busy = true; this.tool = 'translate'; this.space = 'world'; this.snap = false;
    this.assetFilter = 'all'; this.logs = []; this.settingsView = false; this.autosaveTimer = null; this.gestureBefore = null;
    this.timelineTime=0;this.boneSelection=0;
    this.engine = new WorldRenderer($('#scene-canvas'), $('#viewport'), {
      select: id => this.select(id),
      beforeTransform: () => { if (!this.busy) this.gestureBefore = clone(this.doc); },
      transform: (id, transform) => { const e = this.doc.entities.find(e => e.id === id); if (e) { e.transform = transform; this.syncTransformFields(e); } },
      boneTransform:(id,pose)=>{const e=this.doc.entities.find(e=>e.id===id);if(e){e.rig.poses=e.rig.poses.filter(p=>p.bone!==pose.bone).concat(pose);this.syncBoneFields();}},
      afterTransform: () => { if (this.gestureBefore && JSON.stringify(this.gestureBefore) !== JSON.stringify(this.doc)) { this.history.push(this.gestureBefore); this.changed(); } this.gestureBefore = null; },
      log: (level, text) => this.log(level, text), fatal: text => this.failGraphics(text), stats: stats => this.updateStats(stats)
    });
    this.installEvents(); this.hydrateIcons(); this.renderAll();
    window.blockageEditor = this; // Public engine/editor handle for local development and integration tests. No Node access.
  }
  hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(e => { e.innerHTML = icon(e.dataset.icon); }); }
  async init() {
    try {
      this.info = await bridge.info();
      if (!window.blockageDesktop) $('.window-controls').hidden = true;
      if (this.info.platform === 'darwin') { $('.window-controls').hidden = true; $('.brand').style.paddingLeft = '80px'; }
      if (this.info.player) this.playerMode();
      await this.engine.init(this.info.compatibility); await this.engine.loadDocument(this.doc);
      this.busy = false; this.select(this.selectedId); $('#loading').hidden = true;
      $('#backend-status').textContent = this.engine.backend;
      this.log('info', 'Blockage 0.4.0 ready.'); this.log('info', `${this.doc.name} loaded · ${this.doc.entities.length} entities.`);
      if (this.info.vulkanRequested) this.log('info', 'Vulkan graphics path requested. Open Diagnostics to inspect the actual graphics backend.');
      if (this.info.compatibility) this.log('warn', 'Compatibility profile active · WebGL 2.');
      this.status('Ready · World loaded');if(this.info.preferences?.autoCheck&&this.info.preferences.repository)setTimeout(()=>this.checkUpdates(true),2000);
      if (this.info.player) this.play();
      else {
        const recovery = await bridge.recover();
        if (recovery.scene) this.showModal('Unsaved scene found', `<p>A recovery copy of <strong>${escape(recovery.scene.name)}</strong> is available.</p><p>Restore it to continue editing, or discard it to keep the current scene.</p>`, [{ label: 'Discard recovery', action: async () => { await bridge.clearRecovery(); this.closeModal(); } }, { label: 'Restore scene', primary: true, action: async () => { this.closeModal(); await this.replaceDocument(recovery.scene, true); this.log('info', 'Recovery restored. Save the scene to a file.'); } }]);
      }
    } catch (error) { this.failGraphics(error.message); }
  }
  get selected() { return this.doc.entities.find(e => e.id === this.selectedId); }
  get playing() { return this.engine.simulation.running; }
  status(message, error = false) { $('#status-message').textContent = message; $('#status-message').classList.toggle('status-error', error); }
  failGraphics(text) { this.busy = false; $('#loading').hidden = true; $('#gpu-error').hidden = false; $('#gpu-error-text').textContent = text; this.log('error', text); this.status('Graphics unavailable · See Output Log', true); }
  log(level, text) {
    this.logs.push({ level, text, time: new Date().toLocaleTimeString('en-GB', { hour12: false }) }); if (this.logs.length > 300) this.logs.shift(); this.renderLog();
  }
  toast(text, error = false) { const e = document.createElement('div'); e.className = `toast${error ? ' error' : ''}`; e.innerHTML = `${icon(error ? 'info' : 'check')}<span>${escape(text)}</span>`; $('#toasts').append(e); setTimeout(() => e.remove(), error ? 7000 : 3800); }
  changed() {
    this.dirty = JSON.stringify(this.doc) !== this.savedText; bridge.markDirty(this.dirty);
    $('#dirty-indicator').textContent = this.dirty ? '•' : ''; $('#status-objects').textContent = `${this.doc.entities.length} entities`; $('#entity-count').textContent = this.doc.entities.length;
    clearTimeout(this.autosaveTimer);
    if (this.dirty) this.autosaveTimer = setTimeout(() => { const doc = clone(this.doc); doc.camera = this.engine.captureCamera(); bridge.autosave(JSON.stringify(doc)).then(r => { if (!r.ok) this.log('warn', `Recovery save: ${r.error}`); }); }, 1200);
  }
  async mutate(description, change, rebuild = true) {
    if (this.busy || this.playing) { if (this.playing) this.toast('Stop simulation before editing.'); return; }
    const before = clone(this.doc), oldSelection = this.selectedId;
    try {
      change(); validateDocument(this.doc);
      if (rebuild) await this.reload(false); else if (this.selected) this.engine.syncEntity(this.selected);
      this.history.push(before); this.changed();
      this.renderAll(); this.engine.select(this.selectedId); this.log('info', description);
    } catch(error) { this.doc = before; this.selectedId = oldSelection; this.engine.doc = this.doc; if (rebuild) { try { await this.reload(false); } catch (restoreError) { this.failGraphics(restoreError.message); } } this.changed(); this.renderAll(); this.toast(error.message, true); this.log('error', error.message); }
  }
  async reload(resetCamera = false) {
    this.busy = true;
    const selection = this.selectedId;
    try { await this.engine.loadDocument(this.doc, resetCamera); this.selectedId = this.doc.entities.some(e => e.id === selection) ? selection : this.doc.entities.find(e => e.kind !== 'group')?.id || null; this.engine.select(this.selectedId); }
    finally { this.busy = false; }
  }
  async replaceDocument(doc, dirty = false) {
    const previous = { doc: this.doc, selectedId: this.selectedId, savedText: this.savedText, settingsView: this.settingsView };
    this.doc = validateDocument(doc); this.history.clear(); this.selectedId = this.doc.entities.find(e=>['player','water','terrain','cloth'].includes(e.kind))?.id||this.doc.entities.find(e => e.kind !== 'group' && !isLight(e))?.id || null;
    this.timelineTime=0;this.boneSelection=0;
    this.collapsed.clear(); this.settingsView = false; if (!dirty) this.savedText = JSON.stringify(this.doc); else this.savedText = '';
    try { await this.reload(true); } catch(error) { Object.assign(this, previous); await this.reload(false); this.renderAll(); throw error; }
    this.changed(); this.renderAll(); this.status(`Ready · ${this.doc.name}`);
  }
  select(id) {
    if(this.selectedId!==id)this.boneSelection=0;this.selectedId = id; this.settingsView = false; this.engine.select(id);
    if (id) { let e = this.selected; while (e?.parent) { this.collapsed.delete(e.parent); e = this.doc.entities.find(x => x.id === e.parent); } }
    this.renderTree(); this.renderInspector();this.renderAnimation();
    $('#selected-label').textContent = this.selected?.name || 'No selection'; $('#selection-count').textContent = this.selected ? '1 entity selected' : 'No entity selected';
  }
  renderAll() {
    $('#title-world').textContent=this.doc.name;$('#scene-tab-name').textContent=this.doc.name;document.title=`Blockage - ${this.doc.name}`;
    $('#entity-count').textContent=this.doc.entities.length;$('#status-objects').textContent=`${this.doc.entities.length} objects`;
    this.renderTree();this.renderInspector();this.renderAssets();this.renderAnimation();this.updatePlayUI();
    $('#grid-button').classList.toggle('active',this.doc.settings.grid);$('#selected-label').textContent=this.selected?.name||'';$('#selection-count').textContent=this.selected?'1 selected':'';
  }
  renderTree() {
    const query = $('#outliner-search').value.trim().toLowerCase(), rows = [], byParent = new Map();
    for (const e of this.doc.entities) { if (!byParent.has(e.parent)) byParent.set(e.parent, []); byParent.get(e.parent).push(e); }
    const matches = e => e.name.toLowerCase().includes(query) || (byParent.get(e.id) || []).some(matches);
    const add = (parent, depth) => {
      for (const e of byParent.get(parent) || []) {
        if (query && !matches(e)) continue;
        const children = byParent.get(e.id)?.length, open = !this.collapsed.has(e.id) || Boolean(query);
        rows.push(`<div class="tree-row${this.selectedId === e.id ? ' selected' : ''}${e.visible ? '' : ' hidden-entity'}" role="treeitem" tabindex="0" aria-selected="${this.selectedId === e.id}"${children ? ` aria-expanded="${open}"` : ''} data-id="${escape(e.id)}" data-kind="${e.kind}" style="padding-left:${8 + Math.min(depth, 8) * 12}px"><button class="tree-expand${open ? ' open' : ''}" data-tree-action="expand" aria-label="${open ? 'Collapse' : 'Expand'} ${escape(e.name)}">${children ? icon('chevron') : ''}</button><span class="tree-type">${icon(kindIcon(e.kind))}</span><span class="tree-name">${escape(e.name)}</span><span class="tree-visibility"><button data-tree-action="visible" title="${e.visible ? 'Hide' : 'Show'} entity" aria-label="Toggle visibility for ${escape(e.name)}">${icon(e.visible ? 'eye' : 'eyeOff')}</button><button class="lock-entity${e.locked ? ' is-locked' : ''}" data-tree-action="lock" title="${e.locked ? 'Unlock' : 'Lock'} entity" aria-label="Toggle lock for ${escape(e.name)}">${icon(e.locked ? 'lock' : 'unlock')}</button></span></div>`);
        if (children && open) add(e.id, depth + 1);
      }
    }; add(null, 0);
    $('#entity-tree').innerHTML = rows.join('') || '<div class="empty-inspector">No entities found.</div>';
  }
  vectorFields(label, property, values) {
    return `<div class="vector-row"><span class="vector-label">${label}</span><div class="vector-fields">${values.map((value, i) => `<label class="vector-field"><span class="axis-badge ${'xyz'[i]}">${'XYZ'[i]}</span><input type="number" aria-label="${label} ${'XYZ'[i]}" data-prop="transform.${property}.${i}" value="${Number(value.toFixed(3))}" min="${property === 'scale' ? '0.001' : '-100000'}" max="${property === 'scale' ? '10000' : '100000'}" step="${property === 'rotation' ? '1' : '0.1'}"></label>`).join('')}</div></div>`;
  }
  rangeField(label, property, value, min = 0, max = 1, step = 0.01) {
    return `<div class="field-row"><label>${label}</label><input type="range" aria-label="${label}" data-prop="${property}" value="${value}" min="${min}" max="${max}" step="${step}"><span class="range-value">${Number(value).toFixed(2)}</span></div>`;
  }
  numberField(label, property, value, min, max, step = 0.1) {
    return `<div class="field-row"><label>${label}</label><input type="number" aria-label="${label}" data-prop="${property}" value="${Number(value.toFixed(3))}" min="${min}" max="${max}" step="${step}"></div>`;
  }
  colorField(label, property, value) { return `<div class="field-row"><label>${label}</label><input type="color" aria-label="${label}" data-prop="${property}" value="${value}"><span class="color-hex">${escape(value.toUpperCase())}</span></div>`; }
  group(id,label,content) { return `<details class="inspector-group" data-property-group="${id}"${this.propertyOpen.has(id)?' open':''}><summary>${label}</summary><section class="inspector-section">${content}</section></details>`; }
  selectField(label,prop,value,values){return `<div class="field-row"><label>${label}</label><select aria-label="${label}" data-prop="${prop}">${values.map(([id,text])=>`<option value="${escape(id)}"${value===id?' selected':''}>${escape(text)}</option>`).join('')}</select></div>`;}
  checkField(label,prop,value){return `<div class="field-row"><label>${escape(label)}</label><input type="checkbox" aria-label="${escape(label)}" data-prop="${prop}"${value?' checked':''}></div>`;}
  targetField(label,prop,value,filter=()=>true){return this.selectField(label,prop,value??'',[['','None'],...this.doc.entities.filter(e=>e.id!==this.selectedId&&filter(e)).map(e=>[e.id,e.name])]);}
  renderInspector() {
    $('#inspector-heading').textContent=this.settingsView?'Scene':'Properties';if(this.settingsView){this.renderSettings();return;}
    const e=this.selected;if(!e){$('#inspector-content').innerHTML='<div class="empty-inspector">No object selected.</div>';return;}
    const children=descendants(this.doc,e.id),locked=this.playing||e.locked;
    let html=`<div class="entity-header"><span class="entity-avatar">${icon(kindIcon(e.kind))}</span><div class="entity-title"><input aria-label="Entity name" data-prop="name" value="${escape(e.name)}" maxlength="200"${locked?' disabled':''}></div></div><div class="${locked?'inspector-disabled':''}">`;
    const parent=`<div class="field-row"><label>Parent</label><select aria-label="Entity parent" data-prop="parent"><option value="">None</option>${this.doc.entities.filter(g=>g.kind==='group'&&!children.has(g.id)).map(g=>`<option value="${escape(g.id)}"${e.parent===g.id?' selected':''}>${escape(g.name)}</option>`).join('')}</select></div>`;
    html+=this.group('transform','Transform',parent+this.vectorFields('Location','position',e.transform.position)+this.vectorFields('Rotation','rotation',e.transform.rotation)+this.vectorFields('Scale','scale',e.transform.scale));
    if(isLight(e))html+=this.group('light','Light',this.colorField('Color','light.color',e.light.color)+this.numberField('Intensity','light.intensity',e.light.intensity,0,10000,1)+(e.kind==='pointLight'?this.numberField('Range','light.distance',e.light.distance,0,1000,1):''));
    else if(editableMeshes.includes(e.kind))html+=this.group('material','Material',this.colorField('Base Color','material.color',e.material.color)+this.rangeField('Metallic','material.metalness',e.material.metalness)+this.rangeField('Roughness','material.roughness',e.material.roughness,.02)+this.colorField('Emission','material.emissive',e.material.emissive)+this.numberField('Emission Strength','material.emissiveIntensity',e.material.emissiveIntensity,0,20)+this.rangeField('Opacity','material.opacity',e.material.opacity,.05)+`<div class="field-row"><label>Texture</label><select aria-label="Base Texture" data-prop="material.texture"><option value="">None</option>${this.doc.assets.filter(a=>a.type==='texture').map(a=>`<option value="${escape(a.id)}"${e.material.texture===a.id?' selected':''}>${escape(a.name)}</option>`).join('')}</select></div>`);
    if(editableMeshes.includes(e.kind))html+=this.group('maps','Texture Maps',[['Normal','normalTexture'],['Roughness Map','roughnessTexture'],['Metallic Map','metalnessTexture'],['Emission Map','emissiveTexture']].map(([label,slot])=>this.selectField(label,'material.'+slot,e.material[slot]??'',[['','None'],...this.doc.assets.filter(a=>a.type==='texture').map(a=>[a.id,a.name])])).join(''));
    if(simulated.includes(e.kind))html+=this.group('physics',e.kind[0].toUpperCase()+e.kind.slice(1),this.simulationFields(e));
    if(sceneObjects.includes(e.kind)&&!['group','player'].includes(e.kind))html+=this.group('physics',e.kind[0].toUpperCase()+e.kind.slice(1),this.objectFields(e));
    html+=this.group('animation','Animation',this.checkField('Enabled','animation.enabled',e.animation.enabled)+this.selectField('Interpolation','animation.interpolation',e.animation.interpolation,[['linear','Linear'],['smooth','Smooth'],['step','Step']])+`<p class="small-note">${e.animation.keys.length} transform key(s). Insert keys in the Animation tab.</p>`);
    if(['model','player'].includes(e.kind)){const clips=this.engine.objects.get(e.id)?.userData.clips||[];html+=this.group('modelAnimation','Model Animation',this.checkField('Play Clip','modelAnimation.enabled',e.modelAnimation.enabled)+this.selectField('Clip','modelAnimation.clip',e.modelAnimation.clip,clips.map((c,i)=>[i,c.name||`Clip ${i}`]))+this.numberField('Playback Speed','modelAnimation.speed',e.modelAnimation.speed,.01,10,.1)+this.numberField('Clip Blend Time','modelAnimation.fade',e.modelAnimation.fade,0,3,.01)+this.checkField('Loop Clip','modelAnimation.loop',e.modelAnimation.loop));html+=this.group('rig','Rigging',this.rigFields(e))+this.group('player','Player',this.playerFields(e,clips));}
    html+=this.group('object','Object',`<div class="check-list"><label><input type="checkbox" data-prop="visible"${e.visible?' checked':''}>Visible</label><label><input type="checkbox" data-prop="locked"${e.locked?' checked':''}>Locked</label><label><input type="checkbox" data-prop="castShadow"${e.castShadow?' checked':''}>Cast Shadow</label><label><input type="checkbox" data-prop="receiveShadow"${e.receiveShadow?' checked':''}>Receive Shadow</label>${['box','sphere','cylinder'].includes(e.kind)?`<label><input type="checkbox" data-prop="collider"${e.collider?' checked':''}>Collider</label>`:''}</div>`);
    let behaviors='';for(const [key,b] of Object.entries(e.behaviors)){
      let fields='';const nf=(label,param,min,max,step=.1)=>this.numberField(label,`behaviors.${key}.${param}`,b[param],min,max,step);
      if(key==='spin')fields=this.selectField('Axis',`behaviors.spin.axis`,b.axis||'Y',[['X','X'],['Y','Y'],['Z','Z']])+nf('Speed (°/s)','speed',-720,720,1);
      if(key==='float')fields=nf('Amplitude','amplitude',0,100)+nf('Speed','speed',0,20);
      if(key==='orbit')fields=nf('Radius','radius',0,1000)+nf('Speed','speed',-20,20);
      if(key==='rigidbody')fields=this.rangeField('Restitution','behaviors.rigidbody.restitution',b.restitution)+nf('Ground Y','floor',-10000,10000)+nf('Mass (kg)','mass',.01,1000)+this.rangeField('Friction','behaviors.rigidbody.friction',b.friction)+nf('Linear Damping','damping',0,10)+['x','y','z'].map(k=>nf('Initial '+k.toUpperCase()+' (m/s)',k,-100,100)).join('');
      if(key==='velocity')fields=['x','y','z'].map(k=>nf(k.toUpperCase()+' (m/s)',k,-100,100)).join('');
      if(key==='oscillate')fields=this.selectField('Axis','behaviors.oscillate.axis',b.axis,[['X','X'],['Y','Y'],['Z','Z']])+nf('Amplitude','amplitude',0,100)+nf('Frequency (Hz)','speed',0,20);
      if(key==='pulse')fields=nf('Amplitude','amplitude',0,.9)+nf('Frequency (Hz)','speed',0,20);
      if(key==='spring')fields=nf('Stiffness','stiffness',.1,100)+nf('Damping','damping',0,20)+['x','y','z'].map(k=>nf('Impulse '+k.toUpperCase(),k,-50,50)).join('');
      if(key==='path')fields=this.selectField('Axis','behaviors.path.axis',b.axis,[['X','X'],['Y','Y'],['Z','Z']])+nf('Distance','distance',.1,100)+nf('Speed (m/s)','speed',.01,50)+this.checkField('Ping Pong','behaviors.path.pingPong',b.pingPong);
      if(['follow','lookAt','joint'].includes(key))fields+=this.targetField('Target',`behaviors.${key}.target`,b.target,key==='joint'?x=>x.collider&&['box','sphere','cylinder'].includes(x.kind):()=>true);
      if(key==='follow')fields+=nf('Follow Speed','speed',0,50)+['x','y','z'].map(k=>nf('Offset '+k.toUpperCase(),k,-100,100)).join('');
      if(key==='buoyancy')fields=nf('Lift','strength',.1,10)+nf('Water Drag','drag',0,20);
      if(key==='joint')fields+=nf('Rest Length','length',.01,50)+nf('Stiffness','stiffness',.1,100)+nf('Damping','damping',0,20);
      behaviors+=`<div class="component-card"><div class="component-head"><span>${behaviorLabels[key]}</span><button data-remove-behavior="${key}" aria-label="Remove ${behaviorLabels[key]}">${icon('close')}</button></div>${fields}</div>`;
    }
    html+=this.group('behaviors','Behaviors',behaviors+`<button class="add-component" data-action="addBehavior">Add Behavior</button>`);
    html+=`</div><div class="entity-actions"><button data-action="duplicate">Duplicate</button><button data-action="delete">Delete</button></div>`;
    $('#inspector-content').innerHTML=html;const input=$('#inspector-content [data-prop="locked"]');if(e.locked&&!this.playing)input.closest('label').style.pointerEvents='auto';
  }
  simulationFields(e){
    const c=e.simulation,nf=(label,key,min,max,step=.1)=>this.numberField(label,'simulation.'+key,c[key],min,max,step);let html='';
    if(e.kind==='water')return nf('Width','width',2,200)+nf('Depth','depth',2,200)+nf('Resolution','resolution',16,128,1)+nf('Wave Speed','waveSpeed',.1,8)+nf('Damping','damping',.05,10)+nf('Wave Height','amplitude',0,1,.01)+nf('Wavelength','wavelength',.2,30)+nf('Wave Motion','speed',0,10)+nf('Rain (/s)','rainRate',0,30)+nf('Ripple Strength','rippleStrength',.01,1,.01)+nf('Ripple Radius','rippleRadius',.1,3)+this.checkField('Object Ripples','simulation.interactions',c.interactions);
    if(e.kind!=='particles')html+=nf('Width','width',1,30)+nf('Height','height',1,30);
    if(e.kind==='cloth')html+=nf('Resolution','segments',4,32,1)+this.selectField('Pinning','simulation.pin',c.pin,[['corners','Top Corners'],['edge','Top Edge'],['none','None']])+this.rangeField('Stiffness','simulation.stiffness',c.stiffness,.1)+this.rangeField('Damping','simulation.damping',c.damping)+nf('Wind','wind',-20,20)+nf('Ground (local Y)','floor',-10000,10000);
    if(e.kind==='fluid')html+=this.selectField('Display','simulation.display',c.display,[['surface','Surface'],['particles','Particles']])+nf('Depth','depth',1,30)+nf('Particles','count',27,768,1)+nf('Particle Radius','radius',.03,.3,.01)+this.rangeField('Viscosity','simulation.viscosity',c.viscosity);
    if(e.kind==='particles')html+=nf('Maximum','count',16,1000,1)+nf('Rate (/s)','rate',0,500,1)+nf('Lifetime','lifetime',.1,20)+nf('Speed','speed',0,30)+nf('Spread','spread',0,2)+nf('Size','size',.01,.3,.01)+this.rangeField('Bounce','simulation.bounce',c.bounce)+nf('Ground (local Y)','floor',-10000,10000);
    html+=nf('Gravity','gravity',0,50);
    if(e.kind!=='particles')html+=nf('Substeps','substeps',1,6,1)+nf('Iterations','iterations',1,12,1)+`<div class="field-row"><label>Object Collisions</label><input type="checkbox" aria-label="Object Collisions" data-prop="simulation.collisions"${c.collisions?' checked':''}></div>`;
    return html;
  }
  objectFields(e){
    const component={terrain:'terrain',camera:'cameraSettings',audio:'audio',trigger:'trigger'}[e.kind],c=e[component],nf=(label,key,min,max,step=.1)=>this.numberField(label,component+'.'+key,c[key],min,max,step);
    if(e.kind==='terrain')return nf('Width','width',2,200)+nf('Depth','depth',2,200)+nf('Resolution','resolution',8,128,1)+nf('Height','amplitude',0,50)+nf('Frequency','frequency',.01,1,.01)+nf('Octaves','octaves',1,6,1)+nf('Seed','seed',0,1e6,1)+this.checkField('Island Falloff','terrain.island',c.island)+this.checkField('Terrain Collision','collider',e.collider);
    if(e.kind==='camera')return nf('Field of View','fov',15,120,1)+nf('Near Clip','near',.01,10,.01)+nf('Far Clip','far',10,10000,1)+this.selectField('Controller','cameraSettings.controller',c.controller,[['static','Static'],['fly','Fly'],['walk','Walk']])+nf('Movement Speed','speed',.1,50)+nf('Eye Height','eyeHeight',.2,5)+`<p class="small-note">Game view: WASD, Shift, Space to jump, RMB drag to look.</p>`;
    if(e.kind==='audio')return this.selectField('Audio Clip','audio.asset',c.asset??'',[['','None'],...this.doc.assets.filter(a=>a.type==='audio').map(a=>[a.id,a.name])])+this.rangeField('Volume','audio.volume',c.volume)+nf('Pitch','pitch',.25,4)+nf('Reference Distance','distance',.1,100)+nf('Rolloff','rolloff',0,5)+this.checkField('Loop','audio.loop',c.loop)+this.checkField('Play on Start','audio.autoplay',c.autoplay);
    if(e.kind==='trigger')return nf('Width','width',.1,100)+nf('Height','height',.1,100)+nf('Depth','depth',.1,100)+this.targetField('Target','trigger.target',c.target)+this.selectField('Action','trigger.action',c.action,[['sound','Play Sound'],['toggle','Toggle Visibility'],['hide','Hide'],['show','Show']])+this.checkField('Once','trigger.once',c.once);
    return '';
  }
  renderSettings() {
    const s=this.doc.settings;$('#inspector-content').innerHTML=`<div class="entity-header"><div class="entity-title"><input aria-label="Scene name" data-prop="world.name" value="${escape(this.doc.name)}" maxlength="200"></div></div><div class="${this.playing?'inspector-disabled':''}"><section class="inspector-section"><div class="section-title">Environment</div>${this.colorField('Background','settings.background',s.background)}${this.numberField('Fog','settings.fog',s.fog,0,.2,.001)}${this.rangeField('Ambient','settings.ambient',s.ambient,0,5,.05)}${this.rangeField('Exposure','settings.exposure',s.exposure,.1,5,.05)}</section><section class="inspector-section"><div class="section-title">Rendering</div><div class="field-row"><label>Shadows</label><input type="checkbox" data-prop="settings.shadows"${s.shadows?' checked':''}></div><div class="field-row"><label>Bloom</label><input type="checkbox" data-prop="settings.bloom"${s.bloom?' checked':''}></div>${this.rangeField('Bloom Strength','settings.bloomStrength',s.bloomStrength,0,2)}<div class="field-row"><label>Grid</label><input type="checkbox" data-prop="settings.grid"${s.grid?' checked':''}></div></section><section class="inspector-section"><div class="section-title">Animation Timeline</div>${this.numberField('Duration (s)','timeline.duration',this.doc.timeline.duration,.1,600)}${this.numberField('Frames Per Second','timeline.fps',this.doc.timeline.fps,1,120,1)}${this.checkField('Loop Timeline','timeline.loop',this.doc.timeline.loop)}</section></div>`;
  }
  syncTransformFields(e) { for (const property of ['position','rotation','scale']) e.transform[property].forEach((v,i) => { const input = $(`#inspector-content [data-prop="transform.${property}.${i}"]`); if (input && document.activeElement !== input) input.value = Number(v.toFixed(3)); }); }
  writeField(input, continuous = false) {
    if(this.busy||this.playing)return;const prop=input.dataset.prop,parts=prop.split('.'),world=['settings','world','timeline'].includes(parts[0]);
    if(!world&&(!this.selected||(this.selected.locked&&prop!=='locked')))return;
    let value=input.type==='checkbox'?input.checked:['number','range'].includes(input.type)?Number(input.value):input.value;
    if(typeof value==='number'){if(!Number.isFinite(value)||input.value===''){this.renderInspector();return;}value=Math.max(Number(input.min||-1e9),Math.min(Number(input.max||1e9),value));if(['simulation.segments','simulation.count','simulation.substeps','simulation.iterations','simulation.resolution','terrain.resolution','terrain.octaves','terrain.seed'].includes(prop))value=Math.round(value);input.value=value;}
    if(prop==='name'||prop==='world.name'){value=value.trim().slice(0,200);if(!value){this.renderInspector();return;}}
    if(['parent','audio.asset','trigger.target'].includes(prop)||prop.endsWith('.target')||prop.startsWith('material.')&&prop.endsWith('Texture')||prop==='material.texture')value||=null;
    if(prop==='modelAnimation.clip'||/^player\.(idle|walk|run|jump)Clip$/.test(prop))value=Number(value);
    if(prop==='rig.chainBones')return this.mutate('Rig size changed.',()=>{this.selected.rig.chainBones=Math.round(value);this.selected.rig.poses=[];this.selected.rig.keys=[];});
    const before=clone(this.doc);if(!world&&parts[0]==='transform'&&this.timelineTime>0)this.selected.transform=this.liveTransform(this.selectedId);let target=world?this.doc:this.selected;if(parts[0]==='world')parts.shift();for(const key of parts.slice(0,-1))target=target[key];if(target[parts.at(-1)]===value)return;
    if(prop==='parent')this.engine.reparent(this.selected,value);else target[parts.at(-1)]=value;
    try{validateDocument(this.doc);}catch(error){this.doc=before;this.engine.doc=before;const e=this.selected;if(e){if(prop==='parent')this.engine.reparent(e,e.parent);this.engine.syncEntity(e);}this.renderInspector();this.renderTree();this.toast(error.message,true);return;}
    if(continuous){if(!this.fieldGesture){this.fieldGesture=before;this.fieldGestureInput=input;}}else this.history.push(before);
    if(world){this.engine.applySettings();$('#title-world').textContent=this.doc.name;$('#scene-tab-name').textContent=this.doc.name;}else this.engine.syncEntity(this.selected);
    if(input.type==='range')input.nextElementSibling.textContent=Number(value).toFixed(2);if(input.type==='color')input.nextElementSibling.textContent=value.toUpperCase();
    if(['parent','name','visible','locked'].includes(prop))this.renderTree();if(prop==='parent')this.syncTransformFields(this.selected);if(prop==='locked')this.renderInspector();if(prop==='settings.grid')$('#grid-button').classList.toggle('active',value);if(prop.startsWith('timeline.'))this.renderAnimation();this.changed();
  }
  endFieldGesture() { if (this.fieldGesture) { this.history.push(this.fieldGesture); this.fieldGesture = null; this.fieldGestureInput = null; } }
  renderAssets(){
    let assets=[...primitives.map(kind=>({id:kind,name:kind==='box'?'Cube':kind[0].toUpperCase()+kind.slice(1),category:'primitives',icon:kindIcon(kind),type:'Mesh'})),...simulated.map(kind=>({id:kind,name:kind==='particles'?'Particle Emitter':kind[0].toUpperCase()+kind.slice(1),category:'simulations',icon:kindIcon(kind),type:'Simulation'})),...sceneObjects.map(kind=>({id:kind,name:kind[0].toUpperCase()+kind.slice(1),category:'objects',icon:kindIcon(kind),type:'Object'})),...presets.map(m=>({...m,category:'materials',icon:'material',type:'Material'})),...this.doc.assets.map(a=>({...a,category:a.type==='model'?'models':a.type==='audio'?'audio':'textures',icon:a.type==='model'?'layers':a.type==='audio'?'waveform':'image',type:a.type==='model'?(a.sourceFormat||'GLB').toUpperCase():a.type==='audio'?'Audio':'Texture'}))];
    const query=$('#asset-search').value.trim().toLowerCase(),total=assets.length;assets=assets.filter(a=>(this.assetFilter==='all'||a.category===this.assetFilter)&&a.name.toLowerCase().includes(query));
    $('#asset-grid').innerHTML=assets.map(a=>`<button class="asset-card" data-asset-id="${escape(a.id)}" data-type="${a.category}" title="Double-click to use">${icon(a.icon)}${a.category==='materials'?`<span class="asset-swatch" style="--swatch:${a.color}"></span>`:''}<span class="asset-label">${escape(a.name)}</span><span class="asset-type">${a.type}</span></button>`).join('')||'<p class="empty-assets">No assets.</p>';
    $('#asset-count').textContent=total;$('#asset-total').textContent=`${assets.length} items`;$('#asset-category').textContent={all:'All',primitives:'Primitives',simulations:'Simulations',materials:'Materials',models:'Models',textures:'Textures',audio:'Audio',objects:'Objects'}[this.assetFilter];$('#asset-footer-text').textContent='Double-click to add or apply.';
  }
  renderAnimation(){
    const e=this.selected,c=this.doc.timeline;this.timelineTime=Math.min(this.timelineTime,c.duration);
    $('#timeline-time').max=c.duration;$('#timeline-time').step=1/c.fps;$('#timeline-time').value=this.timelineTime;$('#timeline-time').disabled=this.playing;$('#timeline-duration').value=c.duration;$('#timeline-duration').disabled=this.playing;
    $('#animation-name').textContent=e?e.name:'No selection';$('#animation-keys').innerHTML=e&&(e.animation.keys.length||e.rig?.keys.length)?[...e.animation.keys,...(e.rig?.keys||[])].sort((a,b)=>a.time-b.time).map(k=>`<button class="key-chip${Math.abs(k.time-this.timelineTime)<.01?' active':''}" data-key-time="${k.time}" title="Preview key at ${k.time} seconds">${icon('keyframe')}Frame ${Math.round(k.time*c.fps)} · ${k.time.toFixed(2)} s</button>`).join(''):'<span class="animation-empty">No transform keys.</span>';
    $$('[data-action="keyframe"],[data-action="removeKey"]').forEach(b=>b.disabled=this.playing||!e||e.locked);
  }
  scrub(time){if(this.playing||this.busy)return;this.timelineTime=Math.max(0,Math.min(this.doc.timeline.duration,time));this.engine.previewAnimation(this.timelineTime);this.renderAnimation();$('#simulation-frame').textContent=`Frame ${Math.round(this.timelineTime*this.doc.timeline.fps)}`;if(this.selected)this.syncTransformFields({transform:this.liveTransform(this.selectedId)});}
  liveTransform(id){const o=this.engine.objects.get(id);return {position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z].map(v=>v*180/Math.PI),scale:o.scale.toArray()};}
  async insertKey(){if(!this.selected||this.selected.locked||this.playing)return;const pose=this.liveTransform(this.selectedId);await this.mutate('Transform key inserted.',()=>captureKey(this.selected,this.timelineTime,pose),false);this.engine.previewAnimation(this.timelineTime);this.renderAnimation();}
  async removeKey(){if(!this.selected||this.playing)return;await this.mutate('Transform key removed.',()=>{this.selected.animation.keys=this.selected.animation.keys.filter(k=>Math.abs(k.time-this.timelineTime)>.01);},false);this.engine.previewAnimation(this.timelineTime);}
  async exportPrefab(){if(!this.selected||this.playing)return;const result=await bridge.savePrefab(JSON.stringify(createPrefab(this.doc,this.selectedId)),this.selected.name);if(!result.ok)this.toast(result.error,true);else if(!result.canceled)this.toast(`Exported ${result.name}`);}
  async importPrefab(){if(this.busy||this.playing)return;const result=await bridge.openPrefab();if(!result.ok){this.toast(result.error,true);return;}if(result.canceled)return;const position=this.engine.controls.target.toArray();await this.mutate('Prefab instantiated.',()=>{this.selectedId=instantiatePrefab(this.doc,result.prefab,position);});}
  renderLog() { $('#log-count').textContent = this.logs.length; $('#console-lines').innerHTML = this.logs.map(l => `<div class="console-row ${l.level}"><span class="console-time">${l.time}</span><span class="console-level">${l.level.toUpperCase()}</span><span class="console-message">${escape(l.text)}</span></div>`).join(''); $('#console-lines').scrollTop = $('#console-lines').scrollHeight; }
  async addEntity(kind, assetId = null) {
    await this.mutate(`Added ${kind === 'box' ? 'Cube' : kind}.`, () => {
      if (this.doc.entities.length >= LIMITS.entities) throw new Error('Entity limit exceeded.');
      const e = createEntity(kind); const target = this.engine.controls.target;
      e.transform.position = [Math.round(target.x), kind === 'plane' || kind === 'group' ? 0 : kind === 'pointLight' ? 3 : 0.5, Math.round(target.z)];
      if (kind === 'plane') e.transform.scale = [5, 1, 5];
      if(simulated.includes(kind)) { e.transform.position[1]=0; if(kind==='fluid'){e.material.color='#538bb0';e.material.metalness=0;e.material.roughness=.2;e.castShadow=false;}if(kind==='cloth'){e.material.color='#aaa9a2';e.material.metalness=0;e.material.roughness=.8;}if(kind==='particles'){e.material.color='#d2b275';e.castShadow=false;}this.propertyOpen.add('physics'); }
      if (kind === 'directionalLight') e.transform.position = [5, 9, 5];
      if(kind==='player'){e.transform.position[1]=0;if(this.doc.entities.some(x=>x.player?.enabled))e.player.enabled=false;this.propertyOpen.add('player');this.propertyOpen.add('rig');this.propertyOpen.add('modelAnimation');}if(kind==='terrain')e.transform.position[1]=0;
      if(kind==='water')e.transform.position[1]=.7;
      if(kind==='camera'){e.transform.position=this.engine.camera.position.toArray();e.transform.rotation=[this.engine.camera.rotation.x,this.engine.camera.rotation.y,this.engine.camera.rotation.z].map(v=>v*180/Math.PI);}
      if(kind==='audio'&&assetId){e.audio.asset=assetId;e.name=this.doc.assets.find(a=>a.id===assetId).name;this.propertyOpen.add('physics');}
      if (kind === 'model') { e.assetId = assetId; e.name = this.doc.assets.find(a => a.id === assetId).name.replace(/\.(glb|gltf|obj|fbx|stl|ply|dae|3mf|blend)$/i,''); }
      this.doc.entities.push(e); this.selectedId = e.id;
    });
  }
  async useAsset(id, type) {
    if (type === 'primitives' || type === 'simulations' || type==='objects') return this.addEntity(id);
    if (type === 'models') return this.addEntity('model', id);
    if(type==='audio')return this.addEntity('audio',id);
    if (!this.selected || !editableMeshes.includes(this.selected.kind)) { this.toast('Select a primitive mesh to apply a material or texture.'); return; }
    if (this.selected.locked) { this.toast('Unlock the selected entity first.'); return; }
    await this.mutate('Material updated.', () => {
      if (type === 'materials') { const preset = presets.find(p => p.id === id); const { id: _id, name: _name, ...material } = preset; Object.assign(this.selected.material, material); }
      else this.selected.material.texture = id;
    }, false);
  }
  async undo(redo = false) {
    if (this.busy || this.playing) return;
    const doc = redo ? this.history.redo(this.doc) : this.history.undo(this.doc);
    if (!doc) { this.toast(redo ? 'Nothing to redo.' : 'Nothing to undo.'); return; }
    this.doc = doc; await this.reload(false); this.changed(); this.renderAll(); this.status(redo ? 'Redo applied' : 'Undo applied');
  }
  setTool(tool) { this.tool = tool; this.engine.setTool(tool); $$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); }
  play() { if (this.busy) return; if (this.playing) { if(this.engine.simulation.paused)this.engine.pause();this.updatePlayUI(); return; }this.timelineTime=0;this.boneSelection=0; this.engine.start();if(this.info?.player&&this.doc.entities.some(e=>e.kind==='camera'||e.player?.enabled))this.engine.setGameView(true);this.log('info', 'Simulation started · Fixed timestep 60 Hz.'); this.updatePlayUI(); }
  stop() { if (!this.playing) return; this.engine.stop(); this.log('info', 'Simulation stopped · Editor transforms restored.'); this.updatePlayUI(); this.renderInspector(); }
  updatePlayUI(){
    const running=this.playing,paused=this.engine.simulation.paused;$('#play-button').classList.toggle('running',running);$('#play-button').innerHTML=icon('play');$('#play-button').setAttribute('aria-label',running?'Resume':'Play');
    $('#pause-button').disabled=!running;$('#stop-button').disabled=!running;$('#step-button').disabled=!paused;$('#pause-button').classList.toggle('active',paused);$('#play-overlay').hidden=!running;
    $('#viewport-state').textContent=running?paused?'Paused':'Playing':'Editing';$('#simulation-frame').textContent=`Frame ${Math.round((running?this.engine.simulation.time:this.timelineTime)*this.doc.timeline.fps)}`;$('#play-time').textContent=`${this.engine.simulation.time.toFixed(2)} s`;this.renderInspector();this.status(running?paused?'Paused':'Simulation running':'Ready');
    $('#game-button').classList.toggle('active',this.engine.gameView);this.renderAnimation();
  }
  updateStats(stats) { $('#fps-status').textContent = `${Math.round(stats.fps)} FPS`; $('#frame-status').textContent = `${stats.frameMs.toFixed(1)} ms`; $('#play-time').textContent = `${stats.time.toFixed(2)} s`;if(this.playing){$('#simulation-frame').textContent=`Frame ${Math.round(stats.time*this.doc.timeline.fps)}`;$('#timeline-time').value=this.doc.timeline.loop?stats.time%this.doc.timeline.duration:Math.min(stats.time,this.doc.timeline.duration);}this.stats = stats; }
  playerMode() { $('#app').classList.add('player-mode'); $('#viewport-controls-hint').innerHTML = '<button class="player-open" data-action="open">Open scene</button> <button class="player-open" data-action="play">Play / Pause</button> &nbsp; RMB + WASD to fly'; $('#title-world').textContent = this.doc.name; }
  async ensureSavedThen(next) {
    if (!this.dirty) return next();
    this.showModal('Unsaved changes', '<p>Save your current scene before switching worlds?</p>', [{ label: 'Cancel', action: () => this.closeModal() }, { label: 'Discard changes', action: () => { this.closeModal(); next(); } }, { label: 'Save & continue', primary: true, action: async () => { const ok = await this.save(); if (ok) { this.closeModal(); next(); } } }]);
  }
  async save(saveAs = false) {
    if (this.busy) return false;
    this.doc.camera = this.engine.captureCamera();
    const result = await bridge.saveScene(JSON.stringify(this.doc, null, 2), saveAs);
    if (!result.ok) { this.toast(result.error, true); this.log('error', result.error); return false; }
    if (result.canceled) return false;
    this.savedText = JSON.stringify(this.doc); clearTimeout(this.autosaveTimer); await bridge.clearRecovery(); this.changed(); this.toast(`Saved ${result.name}`); this.status(`Saved · ${result.name}`); this.log('info', `Scene saved · ${result.name}`); return true;
  }
  async open() {
    this.stop();
    await this.ensureSavedThen(async () => { const result = await bridge.openScene(); if (!result.ok) { this.toast(result.error, true); return; } if (!result.canceled) { await this.replaceDocument(result.scene); await bridge.clearRecovery(); this.log('info', `Scene opened · ${result.name}`); if (this.info.player) this.play(); } });
  }
  async importAssets(folder=false) {
    if (this.busy || this.playing) { this.toast('Stop simulation before importing assets.'); return; }
    if(this.importing)return;this.importing=true;let result;try{result=await bridge.importAssets(folder);}finally{this.importing=false;}if(this.playing)this.stop(); if (!result.ok) { this.toast(result.error, true); this.log('error', result.error); return; } if (result.canceled) return;
    await this.mutate(`Imported ${result.assets.length} asset(s).`, () => this.doc.assets.push(...result.assets));
    this.toast(`${result.assets.length} asset(s) imported. Double-click to use.`);
  }
  newWorld(){
    this.stop();this.ensureSavedThen(()=>{this.showModal('New Scene','<input class="modal-input" id="new-world-name" aria-label="New scene name" value="Untitled" maxlength="200">',[...[[simulationTest,'Simulation Test'],[waterTest,'Water Test'],[terrainTest,'Terrain Test'],[engineTest,'Engine Test'],[characterTest,'Character Test']].map(([make,label])=>({label,action:async()=>{this.closeModal();await bridge.resetScenePath();await bridge.clearRecovery();await this.replaceDocument(make(),true);}})),{label:'Create',primary:true,action:async()=>{const doc=emptyWorld();doc.name=$('#new-world-name').value.trim()||'Untitled';this.closeModal();await bridge.resetScenePath();await bridge.clearRecovery();await this.replaceDocument(doc,true);}}]);$('#new-world-name').focus();$('#new-world-name').select();});
  }
  showModal(title, body, buttons = []) {
    this.closeDropdown(); $('#modal-backdrop').hidden = false;
    $('#modal').innerHTML = `<div class="modal-header"><h2 id="modal-title">${escape(title)}</h2><button data-action="closeModal" aria-label="Close dialog">${icon('close')}</button></div>${body}${buttons.length ? `<div class="modal-buttons">${buttons.map((b,i) => `<button class="${b.primary ? 'primary-button' : 'secondary-button'}" data-modal-button="${i}">${escape(b.label)}</button>`).join('')}</div>` : ''}`;
    this.modalButtons = buttons; setTimeout(() => { if (!$('#modal').contains(document.activeElement)) ($('#modal input') || $('#modal button'))?.focus(); },0);
  }
  closeModal() { $('#modal-backdrop').hidden = true; this.modalButtons = []; }
  showHelp(){
    this.showModal('Controls',`<table class="modal-table"><tbody>${[['Orbit / pan / zoom','LMB drag / MMB drag / wheel'],['Fly','RMB + WASD; Q/E vertical; Shift fast'],['Select / move / rotate / scale','Q / W / E / R'],['Frame selected / grid','F / G'],['Play / stop','F5 / Esc'],['Save / open / import','Ctrl S / Ctrl O / Ctrl I'],['Undo / redo','Ctrl Z / Ctrl Shift Z'],['Duplicate / delete','Ctrl D / Delete'],['Commands','Ctrl P']].map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table><p>Cloth: distance constraints, pinning, wind and primitive collisions. Fluid: particle pressure and viscosity inside a box. Particles: emission, gravity and floor bounce. Stop restores the authored state. Simulation controls are in Properties.</p>`,[{label:'Close',primary:true,action:()=>this.closeModal()}]);
  }
  diagnostics() {
    const i = this.info || {}, g = i.gpu?.auxAttributes || {}, a = this.engine.adapterInfo || {};
    this.showModal('Graphics diagnostics', `<p>The renderer below reflects the active API. A requested Vulkan profile is not proof that every graphics stage uses Vulkan.</p><table class="modal-table"><tbody>${[['Renderer',this.engine.backend || 'Unavailable'],['Graphics profile',i.compatibility ? 'Compatibility' : i.vulkanRequested ? 'Vulkan requested' : 'Automatic'],['Electron',i.electron],['Embedded Node.js',i.node],['Chromium',i.chrome],['Platform',i.platform],['Adapter',a.description || a.vendor || g.glRenderer || 'Not exposed by driver'],['ANGLE / compositor',g.glRenderer || 'Not exposed'],['WebGPU feature',i.graphics?.webgpu || 'See renderer above'],['Frame time',this.stats ? `${this.stats.frameMs.toFixed(1)} ms (${Math.round(this.stats.fps)} FPS)` : 'Pending'],['Triangles',this.stats?.triangles ?? 'Pending']].map(([a,b]) => `<tr><td>${escape(a)}</td><td>${escape(b ?? 'Unknown')}</td></tr>`).join('')}</tbody></table><p>Windows normally uses D3D12 for WebGPU; Linux can use Vulkan; macOS uses Metal. START_BLOCKAGE_VULKAN.bat requests a Vulkan graphics path. Use the compatibility launcher if your driver refuses it.</p>`, [{ label: 'Close', primary: true, action: () => this.closeModal() }]);
  }
  showDropdown(anchor, entries) {
    this.closeDropdown(); const node = $('#dropdown'); node.innerHTML = entries.map((e,i) => e.separator ? '<div class="dropdown-separator"></div>' : e.labelOnly ? `<div class="dropdown-label">${escape(e.label)}</div>` : `<button class="dropdown-item" data-dropdown-item="${i}"${e.disabled ? ' disabled' : ''}>${icon(e.icon || 'cube')}<span>${escape(e.label)}</span>${e.key ? `<span class="key">${escape(e.key)}</span>` : ''}</button>`).join('');
    this.dropdownEntries = entries; node.hidden = false;
    const b = anchor.getBoundingClientRect(); node.style.left = `${Math.min(b.left, innerWidth - 250)}px`; node.style.top = `${Math.min(b.bottom + 4, innerHeight - node.offsetHeight - 15)}px`;
  }
  closeDropdown() { $('#dropdown').hidden = true; $$('[data-menu]').forEach(b => b.classList.remove('menu-active')); }
  addMenu(anchor) {
    this.showDropdown(anchor, [{ label: 'Mesh', labelOnly: true }, ...primitives.map(kind => ({ label: kind === 'box' ? 'Cube' : kind[0].toUpperCase() + kind.slice(1), icon: kindIcon(kind), action: () => this.addEntity(kind) })), { separator: true }, ...simulated.map(kind=>({label:kind==='particles'?'Particle Emitter':kind[0].toUpperCase()+kind.slice(1),icon:kindIcon(kind),action:()=>this.addEntity(kind)})), { separator: true },...sceneObjects.map(kind=>({label:kind==='audio'?'Audio Source':kind==='group'?'Empty Group':kind[0].toUpperCase()+kind.slice(1),icon:kindIcon(kind),action:()=>this.addEntity(kind)})),{ separator:true }, { label: 'Point Light', icon: 'light', action: () => this.addEntity('pointLight') }, { label: 'Directional Light', icon: 'sun', action: () => this.addEntity('directionalLight') }]);
  }
  addBehavior(anchor){
    if(!this.selected||this.selected.locked||this.playing)return;const e=this.selected,b=e.behaviors,position=['float','orbit','velocity','oscillate','rigidbody','spring','path','follow'],rigidKinds=['box','sphere','cylinder'];
    this.showDropdown(anchor,Object.keys(behaviorDefaults).map(key=>({label:behaviorLabels[key],icon:key==='spin'?'rotate':'move',disabled:Boolean(b[key])||Boolean(e.animation.enabled&&e.animation.keys.length)||(['rigidbody','buoyancy','joint'].includes(key)&&(!rigidKinds.includes(e.kind)||position.some(k=>k!=='rigidbody'&&b[k])))||(position.includes(key)&&key!=='rigidbody'&&Boolean(b.rigidbody))||(key==='spring'&&position.some(k=>b[k]))||(position.includes(key)&&key!=='spring'&&Boolean(b.spring)),action:()=>this.mutate(`Added ${behaviorLabels[key]}.`,()=>{if(['buoyancy','joint'].includes(key)&&!e.behaviors.rigidbody)e.behaviors.rigidbody=clone(RIGID_DEFAULTS);e.behaviors[key]=clone(behaviorDefaults[key]);if(['follow','lookAt','joint'].includes(key))e.behaviors[key].target=this.doc.entities.find(x=>x.id!==e.id&&(key!=='joint'||x.collider&&['box','sphere','cylinder'].includes(x.kind)))?.id||null;},false)})));
  }
  menu(name, anchor) {
    const entry = (label, action, iconName, key) => ({ label, action: () => this.action(action, anchor), icon: iconName, key });
    const menus = {
      file: [entry('New Scene', 'new', 'file', 'Ctrl N'), entry('Open Scene…','open','folderOpen','Ctrl O'), { separator:true }, entry('Save Scene','save','save','Ctrl S'), entry('Save Scene As…','saveAs','save','Ctrl Shift S'), entry('Import Assets…','import','import','Ctrl I'),entry('Import Model Folder…','importFolder','folder'), entry('Export Scene…','export','export'),{separator:true},entry('Export Selected as Prefab…','exportPrefab','package'),entry('Import Prefab…','importPrefab','package')],
      edit: [entry('Undo','undo','undo','Ctrl Z'),entry('Redo','redo','redo','Ctrl Shift Z'),{separator:true},entry('Duplicate Selected','duplicate','copy','Ctrl D'),entry('Delete Selected','delete','trash','Delete'),{separator:true},entry('Preferences…','preferences','settings')],
      view: [entry('Focus Selected','focus','focus','F'),entry('Game View','game','camera'),entry('Toggle Grid','grid','grid','G'),entry('Scene Settings','settings','settings'),entry('Graphics Diagnostics','diagnostics','settings'),entry('Toggle Content Browser','toggleContent','folder'),entry('Developer Tools','devtools','code')],
      help: [entry('Check for Updates…','updates','import'),entry('Controls & About','help','info'),entry('Graphics Diagnostics','diagnostics','settings')]
    };
    if (name === 'create') this.addMenu(anchor); else this.showDropdown(anchor,menus[name]); anchor.classList.add('menu-active');
  }
  commands() {
    this.showModal('Quick commands', '<input class="modal-input" id="command-query" placeholder="Search commands" aria-label="Command search"><div class="command-results" id="command-results"></div>');
    const entries = [['Preferences','preferences','settings',''],['Check for updates','updates','import',''],['Import model folder','importFolder','folder',''],['New scene','new','file','Ctrl N'],['Open scene','open','folderOpen','Ctrl O'],['Save scene','save','save','Ctrl S'],['Import assets','import','import','Ctrl I'],['Undo','undo','undo','Ctrl Z'],['Redo','redo','redo','Ctrl Shift Z'],['Play simulation','play','play','F5'],['Stop simulation','stop','stop','Esc'],['Game view','game','camera',''],['Insert keyframe','keyframe','keyframe','K'],['Export prefab','exportPrefab','package',''],['Import prefab','importPrefab','package',''],['Scene settings','settings','settings',''],['Graphics diagnostics','diagnostics','bolt',''],['Focus selected','focus','focus','F'],...[...primitives,...simulated,...sceneObjects].map(k => [`Add ${k === 'box' ? 'Cube' : k}`,'add:'+k,kindIcon(k),''])];
    const render = () => { const query = $('#command-query').value.toLowerCase(); this.commandEntries = entries.filter(e => e[0].toLowerCase().includes(query)); $('#command-results').innerHTML = this.commandEntries.map((e,i) => `<button data-command="${i}">${icon(e[2])}<span>${e[0]}</span><span class="key">${e[3]}</span></button>`).join(''); };
    render(); $('#command-query').addEventListener('input', render); $('#command-query').focus();
  }
  async action(action, anchor = $('[data-action="addMenu"]')) {
    if(['preferences','chooseBlender','updates','importFolder','createRig','boneMode','objectMode','rigKey','removeRigKey','resetRig'].includes(action))return this.featureAction(action);
    if (action.startsWith('add:')) return this.addEntity(action.slice(4));
    if (action === 'new') return this.newWorld(); if (action === 'open') return this.open(); if (action === 'save') return this.save(); if (action === 'saveAs' || action === 'export') return this.save(true); if (action === 'import') return this.importAssets();
    if (action === 'undo') return this.undo(); if (action === 'redo') return this.undo(true);
    if(action==='keyframe')return this.insertKey();if(action==='removeKey')return this.removeKey();if(action==='resetPreview'){this.scrub(0);return;}
    if(action==='exportPrefab')return this.exportPrefab();if(action==='importPrefab')return this.importPrefab();
    if(action==='game'){this.engine.setGameView(!this.engine.gameView);$('#game-button').classList.toggle('active',this.engine.gameView);this.status(this.engine.gameView?'Game view · Play, then WASD / RMB to look':'Scene view');return;}
    if(action==='ripple'){const id=this.selected?.kind==='water'?this.selectedId:this.doc.entities.find(e=>e.kind==='water')?.id;if(!this.engine.addRipple(id))this.toast('Add a Water surface first.');return;}
    if (action === 'delete' && this.selected && !this.selected.locked) return this.mutate('Deleted selected entity and descendants.', () => { const ids = descendants(this.doc,this.selectedId); this.doc.entities = this.doc.entities.filter(e => !ids.has(e.id));for(const e of this.doc.entities){for(const b of Object.values(e.behaviors))if(ids.has(b.target))b.target=null;if(ids.has(e.trigger?.target))e.trigger.target=null;}this.selectedId = null; });
    if (action === 'duplicate' && this.selected && !this.selected.locked) return this.mutate('Duplicated selected entity.', () => { this.selectedId = duplicateEntities(this.doc,this.selectedId); });
    if (action === 'focus') { this.engine.focus(); return; }
    if (action === 'play') return this.play(); if (action === 'stop') return this.stop(); if (action === 'pause') { this.engine.pause(); return this.updatePlayUI(); } if (action === 'step') {this.engine.step();return this.updatePlayUI();}
    if (action === 'settings') { this.settingsView = !this.settingsView; this.renderInspector(); return; }
    if (action === 'grid') return this.mutate('Viewport grid toggled.', () => { this.doc.settings.grid = !this.doc.settings.grid; this.engine.applySettings(); }, false);
    if (action === 'space') { this.space = this.space === 'world' ? 'local' : 'world'; this.engine.setSpace(this.space); $('#space-button').innerHTML = `${this.space === 'world' ? 'World' : 'Local'} ${icon('down')}`; return; }
    if (action === 'snap') { this.snap = !this.snap; this.engine.setSnap(this.snap); $('#snap-button').classList.toggle('active',this.snap); $('#snap-label').textContent = this.snap ? '0.5 m' : 'Free'; this.toast(this.snap ? 'Snap: 0.5 m / 15° / 0.1 scale' : 'Snapping disabled'); return; }
    if (action === 'addMenu') return this.addMenu(anchor); if (action === 'addBehavior') return this.addBehavior(anchor); if (action === 'commands') return this.commands();
    if (action === 'clearLog') { this.logs = []; this.renderLog(); return; }
    if (action === 'toggleContent') { $('#app').classList.toggle('content-collapsed'); return; }
    if (action === 'help') return this.showHelp(); if (action === 'diagnostics') return this.diagnostics(); if (action === 'closeModal') return this.closeModal();
    if (action === 'devtools') return bridge.windowAction('devtools');
    if (action === 'closeWithRecovery') { const doc = clone(this.doc); doc.camera = this.engine.captureCamera(); const result = await bridge.closeWithRecovery(JSON.stringify(doc)); if (!result.ok) this.toast(result.error,true); }
  }
  installEvents() {
    document.addEventListener('click', event => {
      const summary=event.target.closest('summary');if(summary?.parentElement.dataset.propertyGroup){const detail=summary.parentElement,id=detail.dataset.propertyGroup;detail.open?this.propertyOpen.delete(id):this.propertyOpen.add(id);}
      const action = event.target.closest('[data-action]'); if (action) { this.action(action.dataset.action,action).catch(e => { this.toast(e.message,true); this.log('error',e.message); }); return; }
      const menu = event.target.closest('[data-menu]'); if (menu) { if (!$('#dropdown').hidden && menu.classList.contains('menu-active')) this.closeDropdown(); else this.menu(menu.dataset.menu,menu); return; }
      const tool = event.target.closest('[data-tool]'); if (tool) { this.setTool(tool.dataset.tool); return; }
      const windowButton = event.target.closest('[data-window]'); if (windowButton) { bridge.windowAction(windowButton.dataset.window); return; }
      const tree = event.target.closest('.tree-row');
      if (tree) {
        const id = tree.dataset.id, e = this.doc.entities.find(e => e.id === id), treeAction = event.target.closest('[data-tree-action]')?.dataset.treeAction;
        if (treeAction === 'expand') { this.collapsed.has(id) ? this.collapsed.delete(id) : this.collapsed.add(id); this.renderTree(); }
        else if (treeAction === 'visible' || treeAction === 'lock') this.mutate(`${e.name}: ${treeAction} changed.`, () => { e[treeAction === 'visible' ? 'visible' : 'locked'] = !e[treeAction === 'visible' ? 'visible' : 'locked']; }, false).then(() => this.engine.syncEntity(e));
        else this.select(id); return;
      }
      const filter = event.target.closest('[data-asset-filter]'); if (filter) { this.assetFilter = filter.dataset.assetFilter; $$('[data-asset-filter]').forEach(b => b.classList.toggle('active',b === filter)); this.renderAssets(); return; }
      const tab = event.target.closest('[data-content-tab]'); if (tab) { $$('[data-content-tab]').forEach(b => b.classList.toggle('active',b === tab)); $('#assets-panel').hidden = tab.dataset.contentTab !== 'assets'; $('#console-panel').hidden = tab.dataset.contentTab !== 'console';$('#animation-panel').hidden=tab.dataset.contentTab!=='animation'; $('#app').classList.remove('content-collapsed'); return; }
      const key=event.target.closest('[data-key-time]');if(key){this.scrub(Number(key.dataset.keyTime));return;}
      const drop = event.target.closest('[data-dropdown-item]'); if (drop) { const entry = this.dropdownEntries[Number(drop.dataset.dropdownItem)]; this.closeDropdown(); Promise.resolve(entry.action()).catch(e => this.toast(e.message,true)); return; }
      const modalButton = event.target.closest('[data-modal-button]'); if (modalButton) { Promise.resolve(this.modalButtons[Number(modalButton.dataset.modalButton)]?.action()).catch(e => this.toast(e.message,true)); return; }
      const command = event.target.closest('[data-command]'); if (command) { const entry = this.commandEntries[Number(command.dataset.command)]; this.closeModal(); this.action(entry[1]); return; }
      const remove = event.target.closest('[data-remove-behavior]'); if (remove) { this.mutate(`Removed ${behaviorLabels[remove.dataset.removeBehavior]} behavior.`, () => {const key=remove.dataset.removeBehavior; delete this.selected.behaviors[key];if(key==='rigidbody'){delete this.selected.behaviors.buoyancy;delete this.selected.behaviors.joint;} },false); return; }
      if (!event.target.closest('#dropdown')) this.closeDropdown();
    });
    document.addEventListener('dblclick',event => { const card = event.target.closest('[data-asset-id]'); if (card) this.useAsset(card.dataset.assetId,card.dataset.type); const row = event.target.closest('.tree-row'); if (row) this.engine.focus(row.dataset.id); });
    $('#outliner-search').addEventListener('input', () => this.renderTree()); $('#asset-search').addEventListener('input', () => this.renderAssets());
    $('#timeline-time').addEventListener('input',event=>this.scrub(Number(event.target.value)));
    $('#timeline-duration').addEventListener('change',event=>{const value=Number(event.target.value);this.mutate('Animation duration changed.',()=>{this.doc.timeline.duration=value;},false).then(()=>this.renderAnimation());});
    $('#inspector-content').addEventListener('input',event => { if (event.target.matches('[data-prop]') && ['range','color'].includes(event.target.type)) this.writeField(event.target,true); });
    $('#inspector-content').addEventListener('change',event => { if(event.target.id==='bone-select'){this.boneSelection=Number(event.target.value);if(this.engine.selectedBoneOwner===this.selectedId)this.engine.selectBone(this.boneSelection);this.renderInspector();return;}if(event.target.matches('[data-bone-prop]')){this.writeBoneField(event.target);return;}if (!event.target.matches('[data-prop]')) return; if (['range','color'].includes(event.target.type)) { this.writeField(event.target,true); this.endFieldGesture(); } else this.writeField(event.target); });
    $('#inspector-content').addEventListener('focusout', () => this.endFieldGesture());
    $('#camera-view').addEventListener('change',event => this.engine.setCameraView(event.target.value)); $('#render-view').addEventListener('change',event => this.engine.setViewMode(event.target.value));
    $('#modal-backdrop').addEventListener('click',event => { if (event.target === $('#modal-backdrop')) this.closeModal(); });
    bridge.onImportProgress?.(p=>this.status(`Importing ${p.index}/${p.total} · ${p.name}`));
    bridge.onUpdateProgress?.(p=>{if($('#update-progress'))$('#update-progress').value=p.percent;if($('#update-stage'))$('#update-stage').textContent=p.stage+' · '+p.percent+'%';});
    bridge.onMenu(action => this.action(action).catch(e => this.toast(e.message,true)));
    document.addEventListener('keydown',event => {
      const typing = event.target.matches('input,textarea,select');
      if (!$('#modal-backdrop').hidden) { if (event.key === 'Escape') this.closeModal(); if (event.key === 'Enter' && $('#command-query')) { const entry = this.commandEntries[0]; if (entry) { this.closeModal(); this.action(entry[1]); } } if (event.key === 'Tab') { const focusables = [...$('#modal').querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')]; const first = focusables[0], last = focusables.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } return; }
      if (event.key === 'Escape') { this.closeDropdown(); this.stop(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); this.commands(); return; }
      // Electron's native menu handles its accelerators. The local preview needs browser shortcut handling.
      if (event.ctrlKey || event.metaKey) {
        if (window.blockageDesktop) return;
        const shortcut = { n:'new',o:'open',s:event.shiftKey?'saveAs':'save',i:'import',z:event.shiftKey?'redo':'undo',y:'redo',d:'duplicate' }[event.key.toLowerCase()];
        if (shortcut && !typing) { event.preventDefault(); this.action(shortcut); } return;
      }
      if (event.key === 'F5'&&!typing) { event.preventDefault();this.action(this.playing?'pause':'play');return; }
      if (typing || this.engine.fly || this.engine.gameView&&document.activeElement===this.engine.canvas) return;
      const key = event.key.toLowerCase(); if ({q:1,w:1,e:1,r:1}[key]) { this.setTool({q:'select',w:'translate',e:'rotate',r:'scale'}[key]); return; }
      if(key==='k'){event.preventDefault();this.insertKey();return;}
      if (key === 'f' && !window.blockageDesktop) this.engine.focus(); if (key === 'g') this.action('grid'); if (event.key === 'Delete' && !window.blockageDesktop) this.action('delete');
      if (key === '/') { event.preventDefault(); $('#outliner-search').focus(); }
      const row = event.target.closest('.tree-row'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.select(row.dataset.id); }
    });
    $('#inspector-content').addEventListener('toggle',event=>{const id=event.target.dataset?.propertyGroup;if(id){event.target.open?this.propertyOpen.add(id):this.propertyOpen.delete(id);}},{capture:true});
    this.bindSplitters();
    window.addEventListener('beforeunload', () => { if (this.dirty) { const doc = clone(this.doc); doc.camera = this.engine.captureCamera(); bridge.autosave(JSON.stringify(doc)); } });
  }
  bindSplitters(){
    const setup=(selector,compute)=>{const element=$(selector);element.addEventListener('pointerdown',event=>{element.setPointerCapture(event.pointerId);element.classList.add('dragging');const move=e=>compute(e),end=()=>{element.classList.remove('dragging');element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);};element.addEventListener('pointermove',move);element.addEventListener('pointerup',end,{once:true});});};
    setup('#right-split',e=>document.documentElement.style.setProperty('--inspector',`${Math.max(265,Math.min(420,innerWidth-e.clientX))}px`));
    setup('#bottom-split',e=>{$('#app').classList.remove('content-collapsed');document.documentElement.style.setProperty('--content-height',`${Math.max(90,Math.min(innerHeight*.45,$('.workspace').getBoundingClientRect().bottom-e.clientY))}px`);});
    setup('#outliner-split',e=>document.documentElement.style.setProperty('--outliner-height',`${Math.max(110,Math.min(innerHeight*.5,e.clientY-$('.outliner').getBoundingClientRect().top))}px`));
  }
}

installCharacterUI(Editor);
const editor = new Editor(); editor.init();
