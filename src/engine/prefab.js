import { createDocument, validateDocument, clone, descendants, uid } from './document.js';

export function createPrefab(doc,id){
  const root=doc.entities.find(e=>e.id===id);if(!root)throw new Error('Select an object to export.');
  const ids=descendants(doc,id),scene=createDocument(root.name);scene.timeline=clone(doc.timeline);scene.entities=clone(doc.entities.filter(e=>ids.has(e.id)));
  for(const e of scene.entities){if(e.id===id){e.parent=null;e.transform.position=[0,0,0];for(const k of e.animation.keys)k.transform.position=k.transform.position.map((v,i)=>v-root.transform.position[i]);}for(const b of Object.values(e.behaviors))if(b.target&&!ids.has(b.target))b.target=null;if(e.trigger?.target&&!ids.has(e.trigger.target))e.trigger.target=null;}
  const assets=new Set();for(const e of scene.entities){if(e.assetId)assets.add(e.assetId);for(const slot of ['texture','normalTexture','roughnessTexture','metalnessTexture','emissiveTexture'])if(e.material[slot])assets.add(e.material[slot]);if(e.audio?.asset)assets.add(e.audio.asset);}
  scene.assets=clone(doc.assets.filter(a=>assets.has(a.id)));
  return {format:'blockage.prefab',version:1,name:root.name,root:id,scene:validateDocument(scene)};
}
export function instantiatePrefab(doc,input,position=[0,0,0]){
  if(input?.format!=='blockage.prefab'||input.version!==1)throw new Error('Unsupported prefab.');
  const scene=validateDocument(input.scene),root=scene.entities.find(e=>e.id===input.root&&e.parent===null);if(!root)throw new Error('Missing prefab root.');
  if(descendants(scene,root.id).size!==scene.entities.length)throw new Error('Prefab must contain one hierarchy.');
  const output={...doc,timeline:{...doc.timeline,duration:Math.max(doc.timeline.duration,scene.timeline.duration)},entities:[...doc.entities],assets:[...doc.assets]},entities=new Map(scene.entities.map(e=>[e.id,uid()])),assets=new Map();
  for(const a of scene.assets){const match=output.assets.find(x=>x.type===a.type&&x.mime===a.mime&&x.data===a.data&&JSON.stringify(x.resources||[])===JSON.stringify(a.resources||[])&&(x.resourceBase||'')===(a.resourceBase||''));assets.set(a.id,match?.id||uid());if(!match)output.assets.push({...clone(a),id:assets.get(a.id)});}
  for(const source of scene.entities){const e=clone(source);if(e.player?.enabled&&output.entities.some(x=>x.player?.enabled))e.player.enabled=false;e.id=entities.get(e.id);e.parent=entities.get(e.parent)||null;if(e.id===entities.get(root.id)){e.transform.position=[...position];for(const k of e.animation.keys)k.transform.position=k.transform.position.map((v,i)=>v+position[i]);}if(e.assetId)e.assetId=assets.get(e.assetId);for(const slot of ['texture','normalTexture','roughnessTexture','metalnessTexture','emissiveTexture'])if(e.material[slot])e.material[slot]=assets.get(e.material[slot]);if(e.audio?.asset)e.audio.asset=assets.get(e.audio.asset);for(const b of Object.values(e.behaviors))if(b.target)b.target=entities.get(b.target)||null;if(e.trigger?.target)e.trigger.target=entities.get(e.trigger.target)||null;output.entities.push(e);}
  validateDocument(output);doc.entities=output.entities;doc.assets=output.assets;doc.timeline=output.timeline;return entities.get(root.id);
}
