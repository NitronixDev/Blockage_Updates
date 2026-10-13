const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_SCENE_BYTES = 160 * 1024 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

async function atomicWrite(filename, data) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, data, { flag: 'wx' }); await fs.rename(temporary, filename); }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
}

function resolveAppPath(root, rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'blockage:' || url.hostname !== 'app') throw new Error('Invalid origin.');
  const name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'src/index.html';
  if (name.includes('\0') || name.includes('\\')) throw new Error('Invalid path.');
  const resolved = path.resolve(root, name);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path outside application.');
  const allowed = relative === path.join('src', 'index.html') || relative.startsWith(`src${path.sep}`) || relative.startsWith(`assets${path.sep}`) || relative.startsWith(`node_modules${path.sep}three${path.sep}`);
  if (!allowed) throw new Error('This file is not a renderer resource.');
  return resolved;
}

function inspectAsset(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_ASSET_BYTES) throw new Error('Assets must be between 1 byte and 50 MiB.');
  const extension = path.extname(filename).toLowerCase();
  let mime, type;
  if (extension === '.glb') {
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length || buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB 2.0 file.');
    const length = buffer.readUInt32LE(12);
    if (length + 20 > buffer.length) throw new Error('Truncated GLB.');
    const json = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
    for (const b of [...(json.buffers || []), ...(json.images || [])]) if (b.uri && !b.uri.startsWith('data:')) throw new Error('Use a self-contained GLB with embedded textures and buffers.');
    if ((json.extensionsRequired || []).some(e => ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression'].includes(e))) throw new Error('Compressed GLB needs a decoder. Export an uncompressed GLB for this version.');
    mime = 'model/gltf-binary'; type = 'model';
  } else if (['.gltf','.obj','.fbx','.stl','.ply','.dae','.3mf'].includes(extension)) {
    const text=buffer.toString('utf8');
    if(extension==='.gltf'){const json=JSON.parse(text);if(json.asset?.version!=='2.0')throw new Error('Use glTF 2.0.');if((json.extensionsRequired||[]).some(e=>['KHR_draco_mesh_compression','KHR_texture_basisu','EXT_meshopt_compression'].includes(e)))throw new Error('Export uncompressed glTF.');}
    if(extension==='.obj'&&(!/^\s*v\s+/m.test(text)||!/^\s*f\s+/m.test(text)))throw new Error('OBJ contains no vertices or faces.');
    if(extension==='.fbx'&&!text.startsWith('Kaydara FBX Binary')&&!text.includes('FBXHeaderExtension'))throw new Error('Invalid FBX.');
    if(extension==='.stl'&&!(buffer.length>=84&&84+buffer.readUInt32LE(80)*50===buffer.length)&&!/^\s*solid\b/i.test(text))throw new Error('Invalid STL.');
    if(extension==='.ply'&&!/^ply\r?\n/.test(text))throw new Error('Invalid PLY.');
    if(extension==='.dae'&&!/<COLLADA\b/i.test(text))throw new Error('Invalid Collada file.');
    if(extension==='.3mf'&&(buffer[0]!==80||buffer[1]!==75))throw new Error('Invalid 3MF archive.');
    mime={'.gltf':'model/gltf+json','.obj':'text/x-wavefront-obj','.fbx':'application/vnd.autodesk.fbx','.stl':'model/stl','.ply':'model/ply','.dae':'model/vnd.collada+xml','.3mf':'model/3mf'}[extension];type='model';
  } else if (extension==='.bmp'&&buffer[0]===66&&buffer[1]===77){mime='image/bmp';type='texture';
  } else if (extension === '.png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mime = 'image/png'; type = 'texture'; }
  else if (['.jpg', '.jpeg'].includes(extension) && buffer[0] === 0xff && buffer[1] === 0xd8) { mime = 'image/jpeg'; type = 'texture'; }
  else if (extension === '.webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') { mime = 'image/webp'; type = 'texture'; }
  else if(extension==='.wav'&&buffer.length>=44&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WAVE'){mime='audio/wav';type='audio';}
  else if(extension==='.ogg'&&buffer.length>=32&&buffer.subarray(0,4).toString()==='OggS'){mime='audio/ogg';type='audio';}
  else if(extension==='.mp3'&&buffer.length>=4&&(buffer.subarray(0,3).toString()==='ID3'||buffer[0]===255&&(buffer[1]&0xe0)===0xe0)){mime='audio/mpeg';type='audio';}
  else throw new Error('Import a supported model, image or audio clip.');
  return { id: crypto.randomUUID(), name: path.basename(filename), mime, type, data: buffer.toString('base64'), bytes: buffer.length };
}

module.exports = { atomicWrite, resolveAppPath, inspectAsset, MAX_SCENE_BYTES, MAX_ASSET_BYTES };
