export const MODEL_MIMES = Object.freeze({glb:'model/gltf-binary',gltf:'model/gltf+json',obj:'text/x-wavefront-obj',fbx:'application/vnd.autodesk.fbx',stl:'model/stl',ply:'model/ply',dae:'model/vnd.collada+xml','3mf':'model/3mf'});
export const RESOURCE_MIMES = ['application/octet-stream','text/x-wavefront-mtl','image/png','image/jpeg','image/webp','image/bmp','image/x-tga','image/vnd-ms.dds'];
export function resourceName(value) {
  let name=String(value).replace(/\\/g,'/');try{name=decodeURIComponent(name);}catch{throw new Error('Invalid resource path.');}
  if(/^[A-Za-z]:\//.test(name))name=name.split('/').pop();
  if(!name||name.startsWith('/')||/^[a-z][a-z0-9+.-]*:/i.test(name)||/[\x00-\x1f?#]/.test(name))throw new Error('Use local model resources.');
  const parts=[];for(const p of name.split('/')){if(!p||p==='.')continue;if(p==='..'){if(!parts.length)throw new Error('Resource outside model folder.');parts.pop();}else parts.push(p);}
  if(!parts.length)throw new Error('Invalid resource path.');return parts.join('/');
}
