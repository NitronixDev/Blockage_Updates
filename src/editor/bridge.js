import { MODEL_MIMES } from '../engine/model-formats.js';
import { validateDocument, LIMITS, uid } from '../engine/document.js';
import { instantiatePrefab } from '../engine/prefab.js';
import { createDocument } from '../engine/document.js';

const download = (filename, data) => {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
};
function pickFiles(input) {
  return new Promise(resolve => {
    input.value = '';
    const finish = value => { input.removeEventListener('change', changed); input.removeEventListener('cancel', canceled); resolve(value); };
    const changed = () => finish([...input.files]); const canceled = () => finish([]);
    input.addEventListener('change', changed, { once: true }); input.addEventListener('cancel', canceled, { once: true }); input.click();
  });
}
const previewBridge = {
  async info() { return { ok: true, platform: 'browser', electron: 'Browser preview', node: 'Not in browser', chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || 'Browser', vulkanRequested: false, compatibility: new URLSearchParams(location.search).has('compat'), player: new URLSearchParams(location.search).has('player'), graphics: {} }; },
  async openScene() { try { const [file] = await pickFiles(document.querySelector('#browser-scene-input')); if (!file) return { ok: true, canceled: true }; if (file.size > LIMITS.sceneBytes) throw new Error('Scene exceeds 160 MiB.'); return { ok: true, scene: validateDocument(JSON.parse(await file.text())), name: file.name }; } catch (e) { return { ok: false, error: e.message }; } },
  async saveScene(text) { try { const doc = validateDocument(JSON.parse(text)); download(doc.name.replace(/[^a-z0-9_-]/gi, '_') + '.blockage', text); return { ok: true, name: `${doc.name}.blockage` }; } catch(e) { return { ok: false, error: e.message }; } },
  async importAssets(folder=false) {
    try {
      if(folder)throw new Error('Use the desktop application to import a model folder.');
      const files=await pickFiles(document.querySelector('#browser-assets-input')),assets=[],read=async file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Could not read '+file.name));reader.readAsDataURL(file);}),models=new Set(Object.keys(MODEL_MIMES));
      const mimes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',tga:'image/x-tga',dds:'image/vnd-ms.dds',mtl:'text/x-wavefront-mtl',bin:'application/octet-stream',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'},resources=[];
      if(files.length>200)throw new Error('Select up to 200 files.');for(const file of files){if(!file.size||file.size>LIMITS.assetBytes)throw new Error('Assets must be between 1 byte and 50 MiB.');const ext=file.name.split('.').pop().toLowerCase();if(ext==='blend')throw new Error('Import BLEND in the desktop app with Blender configured.');const data=await read(file);if(['mtl','bin','png','jpg','jpeg','webp','bmp','tga','dds'].includes(ext))resources.push({name:file.name,mime:mimes[ext],data});if(!models.has(ext)&&!['png','jpg','jpeg','webp','bmp','wav','mp3','ogg'].includes(ext))continue;const type=models.has(ext)?'model':['wav','mp3','ogg'].includes(ext)?'audio':'texture';assets.push({id:uid(),name:file.name,type,mime:MODEL_MIMES[ext]||mimes[ext],data,bytes:file.size,...(type==='model'?{sourceFormat:ext}: {})});}
      for(const asset of assets)if(asset.type==='model')asset.resources=resources;
      return{ok:true,canceled:!files.length,assets};
    }catch(e){return{ok:false,error:e.message};}
  },
  async preferences(){return{ok:false,error:'Preferences are available in the desktop application.'};},
  async savePreferences(){return{ok:false,error:'Preferences are available in the desktop application.'};},
  async chooseBlender(){return{ok:false,error:'Choose Blender in the desktop application.'};},
  async checkUpdates(){return{ok:false,error:'GitHub updates are available in the Windows desktop application.'};},
  onUpdateProgress(){return()=>{};},onImportProgress(){return()=>{};},
  async savePrefab(text,name){try{const prefab=JSON.parse(text);instantiatePrefab(createDocument(),prefab);const filename=name.replace(/[^a-z0-9_-]/gi,'_')+'.blockageprefab';download(filename,text);return{ok:true,name:filename};}catch(e){return{ok:false,error:e.message};}},
  async openPrefab(){try{const [file]=await pickFiles(document.querySelector('#browser-prefab-input'));if(!file)return{ok:true,canceled:true};if(file.size>LIMITS.sceneBytes)throw new Error('Prefab exceeds 160 MiB.');const prefab=JSON.parse(await file.text());instantiatePrefab(createDocument(),prefab);return{ok:true,prefab};}catch(e){return{ok:false,error:e.message};}},
  async autosave(text) { try { localStorage.setItem('blockage-recovery', text); return { ok: true }; } catch { return { ok: false, error: 'Preview recovery storage is full.' }; } },
  async recover() { try { const text = localStorage.getItem('blockage-recovery'); return { ok: true, scene: text ? validateDocument(JSON.parse(text)) : null }; } catch { return { ok: true, scene: null }; } },
  async clearRecovery() { localStorage.removeItem('blockage-recovery'); return { ok: true }; },
  async resetScenePath() { return { ok: true }; },
  async closeWithRecovery(text) { return this.autosave(text); },
  markDirty() {}, windowAction() {}, onMenu() { return () => {}; }
};
export const bridge = window.blockageDesktop || previewBridge;
