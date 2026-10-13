import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntity, validateDocument, History, descendants, duplicateEntities, clone } from '../src/engine/document.js';
import { simulationTest, emptyWorld } from '../src/engine/demo.js';
import { Simulation } from '../src/engine/simulation.js';
import { Vector3, Euler } from 'three';

test('starter worlds survive a JSON round trip with all transforms and components', () => {
  for (const doc of [simulationTest(), emptyWorld()]) assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.equal(emptyWorld().entities.length, 3);
});
test('invalid formats, versions, duplicate ids, and nonfinite transforms are rejected', () => {
  const doc = emptyWorld();
  assert.throws(() => validateDocument({ ...doc, version: 999 }), /version/);
  assert.throws(() => validateDocument({ ...doc, format: 'other' }), /supported/i);
  const duplicate = clone(doc); duplicate.entities.push(clone(duplicate.entities[0])); assert.throws(() => validateDocument(duplicate), /Duplicate entity/);
  doc.entities[0].transform.position[1] = NaN; assert.throws(() => validateDocument(doc), /position/);
});
test('cyclic and dangling hierarchy links are rejected before a scene is installed', () => {
  const doc = createDocument(); const a = createEntity('group'), b = createEntity('group'); doc.entities.push(a,b);
  a.parent = b.id; b.parent = a.id; assert.throws(() => validateDocument(doc), /Cyclic/);
  b.parent = 'missing'; assert.throws(() => validateDocument(doc), /Missing parent/);
});
test('asset references, MIME types, encodings, and behavior parameters are validated', () => {
  const doc = emptyWorld(); doc.entities[0].material.texture = 'missing'; assert.throws(() => validateDocument(doc), /Missing texture/);
  doc.entities[0].material.texture = null; doc.entities[0].behaviors.spin = { speed: 9999 }; assert.throws(() => validateDocument(doc), /spin speed/);
  doc.entities[0].behaviors = {}; doc.assets.push({ id:'a',name:'a.png',type:'texture',mime:'image/png',data:'bad' }); assert.throws(() => validateDocument(doc), /encoding/);
  doc.assets[0].data = 'AAAA'; doc.assets[0].type = 'model'; assert.throws(() => validateDocument(doc), /GLB/);
});
test('embedded assets stay attached to a scene after serialization', () => {
  const doc = emptyWorld(); const asset = { id:'texture',name:'tiny.png',type:'texture',mime:'image/png',data:'iVBORw0KGgo=' };
  doc.assets.push(asset); doc.entities[0].material.texture = asset.id;
  const parsed = validateDocument(JSON.parse(JSON.stringify(doc))); assert.deepEqual(parsed.assets, doc.assets); assert.equal(parsed.entities[0].material.texture,'texture');
});
test('duplicating a subtree remaps every internal parent without altering originals', () => {
  const doc = createDocument();const group=createEntity('group',{id:'assembly',name:'Assembly'});doc.entities.push(group,createEntity('box',{parent:group.id}),createEntity('sphere',{parent:group.id}));const originals = clone(doc.entities), ids = descendants(doc,'assembly');
  const copyId = duplicateEntities(doc,'assembly'), copies = doc.entities.slice(originals.length);
  assert.equal(copies.length, ids.size); assert.equal(copies[0].id,copyId); assert.equal(copies[0].name,'Assembly Copy');
  assert.deepEqual(doc.entities.slice(0,originals.length),originals);
  for (const e of copies) { assert(!ids.has(e.id)); if (e.parent) assert(copies.some(p => p.id === e.parent)); }
  assert.doesNotThrow(() => validateDocument(doc));
});
test('undo/redo restores snapshots, and a new branch clears redo', () => {
  const history = new History(3), original = emptyWorld(); history.push(original);
  const changed = clone(original); changed.entities[0].transform.position[0] = 8;
  const undone = history.undo(changed); assert.deepEqual(undone,original); assert(history.canRedo);
  const redone = history.redo(undone); assert.deepEqual(redone,changed);
  history.undo(redone); history.push(undone); assert(!history.canRedo);
  original.name = 'mutated outside history'; assert.notEqual(history.undoStack[0].doc.name,original.name);
});
test('history drops old snapshots under the byte budget', () => {
  const history = new History(64,3000); const doc = emptyWorld();
  for (let i=0;i<10;i++) { doc.name = `Scene ${i}`; history.push(doc); }
  assert.equal(history.undoStack.length,1);
});
function setup(behaviors) { const e = createEntity('box',{ behaviors }); const o = { position:new Vector3(0,4,0),rotation:new Euler(0,0,0) }; const s = new Simulation(); s.start([e],new Map([[e.id,o]])); return {s,o}; }
test('fixed-step simulation produces the same state at different display frame rates', () => {
  const a = setup({ spin:{speed:30},float:{amplitude:.4,speed:1},orbit:{radius:2,speed:.5} }), b = setup({spin:{speed:30},float:{amplitude:.4,speed:1},orbit:{radius:2,speed:.5}});
  for (let i=0;i<120;i++) a.s.update(1/60); for (let i=0;i<60;i++) b.s.update(1/30);
  assert(a.o.position.distanceTo(b.o.position)<1e-8); assert(Math.abs(a.o.rotation.y-b.o.rotation.y)<1e-8);
});
test('pause, frame stepping, and stop preserve the editable scene', () => {
  const {s,o} = setup({spin:{speed:60}}); s.update(.1); const rotation=o.rotation.y; s.paused=true; s.update(.1); assert.equal(o.rotation.y,rotation);
  s.step(); assert(o.rotation.y>rotation); s.stop(); assert.equal(o.rotation.y,0); assert.equal(o.position.y,4); assert.equal(s.running,false);
});
test('prototype rigid bodies cannot penetrate their configured local floor', () => {
  const {s,o} = setup({rigidbody:{floor:0,restitution:.45}});
  for(let i=0;i<600;i++){s.update(1/60);assert(o.position.y>=.5-1e-9);}
  s.stop();assert.equal(o.position.y,4);
});
