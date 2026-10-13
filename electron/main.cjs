const { app, BrowserWindow, protocol, ipcMain, dialog, Menu, nativeTheme, net, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveAppPath, inspectAsset, atomicWrite, MAX_SCENE_BYTES } = require('./files.cjs');
const { spawn }=require('node:child_process');
const { importModelFile, listModelFiles, IMPORT_EXTENSIONS, findBlender }=require('./model-import.cjs');
const { UpdateService }=require('./updates.cjs');
const { Preferences }=require('./preferences.cjs');
const currentVersion=require('../package.json').version;
const explicitProfile=process.argv.find(a=>a.startsWith('--user-data-dir='));if(explicitProfile)app.setPath('userData',explicitProfile.slice(16));
let preferences,updater;
const root = path.resolve(__dirname, '..');
const vulkanRequested = process.argv.includes('--blockage-vulkan');
const compatibility = process.argv.includes('--blockage-webgl');
const player = process.argv.includes('--blockage-player');

// Secure standard origin is necessary for WebGPU and ES modules. No HTTP server or open port in the desktop app.
protocol.registerSchemesAsPrivileged([{ scheme: 'blockage', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.setName('Blockage');
if (vulkanRequested && process.platform !== 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
  app.commandLine.appendSwitch('use-angle', 'vulkan');
  // Requests Chromium's Vulkan graphics path. On Windows WebGPU may still use D3D12; diagnostics never label a request as proof.
}
nativeTheme.themeSource = 'dark';
let window, scenePath = null, dirty = false;
let validate;
async function validatedPrefab(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_SCENE_BYTES)throw new Error('Prefab exceeds 160 MiB.');
  const data=JSON.parse(text),{instantiatePrefab}=await import('../src/engine/prefab.js'),{createDocument}=await import('../src/engine/document.js');instantiatePrefab(createDocument(),data);return data;
}
const recoveryPath = () => path.join(app.getPath('userData'), 'recovery.blockage');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const guarded = handler => async (event, ...args) => {
  try {
    if (event.sender !== window?.webContents || !event.senderFrame?.url.startsWith('blockage://app/')) throw new Error('Untrusted sender.');
    return await handler(...args);
  } catch (error) { return { ok: false, error: error.message }; }
};
async function validatedText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SCENE_BYTES) throw new Error('Scene exceeds the 160 MiB limit.');
  validate ||= (await import('../src/engine/document.js')).validateDocument;
  return JSON.stringify(validate(JSON.parse(text)), null, 2);
}
async function readScene(filename) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > MAX_SCENE_BYTES) throw new Error('Scene exceeds the 160 MiB limit.');
  return JSON.parse(await validatedText(await fs.readFile(filename, 'utf8')));
}
function installIPC() {
  ipcMain.handle('blockage:info', guarded(async () => ({ ok: true, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, platform: process.platform, vulkanRequested, compatibility, player, version:currentVersion,preferences:preferences.value, graphics: app.getGPUFeatureStatus(), gpu: await app.getGPUInfo('complete').catch(() => ({})) })));
  ipcMain.handle('blockage:open', guarded(async () => {
    const picked = await dialog.showOpenDialog(window, { title: 'Open Blockage Scene', properties: ['openFile'], filters: [{ name: 'Blockage Scene', extensions: ['blockage', 'json'] }] });
    if (picked.canceled) return { ok: true, canceled: true };
    const scene = await readScene(picked.filePaths[0]); scenePath = picked.filePaths[0];
    return { ok: true, scene, name: path.basename(scenePath), path: scenePath };
  }));
  ipcMain.handle('blockage:save', guarded(async (text, saveAs) => {
    const content = await validatedText(text);
    let filename = scenePath;
    if (!filename || saveAs) {
      const result = await dialog.showSaveDialog(window, { title: 'Save Blockage Scene', defaultPath: filename || 'MyWorld.blockage', filters: [{ name: 'Blockage Scene', extensions: ['blockage'] }] });
      if (result.canceled) return { ok: true, canceled: true };
      filename = result.filePath;
    }
    await atomicWrite(filename, content); scenePath = filename; dirty = false; window.setDocumentEdited(false);
    await fs.rm(recoveryPath(), { force: true }).catch(() => {});
    return { ok: true, name: path.basename(filename), path: filename };
  }));
  ipcMain.handle('blockage:import',guarded(async folder=>{
    if(typeof folder!=='boolean')throw new Error('Invalid import mode.');
    const selected=await dialog.showOpenDialog(window,{title:folder?'Import Model Folder':'Import Assets',properties:folder?['openDirectory']:['openFile','multiSelections'],filters:folder?[]:[{name:'Models, Textures & Audio',extensions:IMPORT_EXTENSIONS}]});if(selected.canceled)return{ok:true,canceled:true};
    const files=folder?await listModelFiles(selected.filePaths[0]):selected.filePaths;if(files.length>100)throw new Error('Import up to 100 assets at once.');const assets=[];let bytes=0;
    for(let index=0;index<files.length;index++){const filename=files[index];window.webContents.send('blockage:import-progress',{name:path.basename(filename),index:index+1,total:files.length});const asset=await importModelFile(filename,{blenderPath:preferences.value.blenderPath,root,resourceRoot:folder?selected.filePaths[0]:undefined});bytes+=asset.bytes;if(bytes>110*1024*1024)throw new Error('Import batch exceeds 110 MiB.');assets.push(asset);}return{ok:true,assets};
  }));
  ipcMain.handle('blockage:preferences',guarded(async()=>({ok:true,preferences:preferences.value,detectedBlender:await findBlender().catch(()=>null)})));
  ipcMain.handle('blockage:preferences-save',guarded(async input=>{const value=await preferences.save(input);updater.available=null;return{ok:true,preferences:value};}));
  ipcMain.handle('blockage:choose-blender',guarded(async()=>{const result=await dialog.showOpenDialog(window,{title:'Choose Blender Executable',properties:['openFile'],filters:process.platform==='win32'?[{name:'Blender',extensions:['exe']}]:[]});return{ok:true,canceled:result.canceled,path:result.filePaths[0]};}));
  ipcMain.handle('blockage:update-check',guarded(async()=>updater.check(preferences.value.repository)));
  ipcMain.handle('blockage:update-install',guarded(async()=>{if(process.platform!=='win32')throw new Error('Automatic installation is available in the Windows release.');return updater.install();}));
  ipcMain.handle('blockage:update-open',guarded(async()=>{if(!updater.ready)throw new Error('Install an update first.');const error=await shell.openPath(updater.ready.path);if(error)throw new Error(error);return{ok:true};}));
  ipcMain.handle('blockage:update-restart',guarded(async()=>{if(process.platform!=='win32'||!updater.ready)throw new Error('No Windows update is ready.');if(dirty)throw new Error('Save your scene before restarting.');const appRoot=updater.ready.path,args=[appRoot];if(compatibility)args.push('--blockage-webgl');if(vulkanRequested)args.push('--blockage-vulkan');const child=spawn(path.join(appRoot,'node_modules/electron/dist/electron.exe'),args,{cwd:appRoot,detached:true,stdio:'ignore',windowsHide:false,shell:false});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();setTimeout(()=>app.quit(),250);return{ok:true};}));
  ipcMain.handle('blockage:prefab-save',guarded(async(text,name)=>{
    const prefab=await validatedPrefab(text),filename=String(name||'Object').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)+'.blockageprefab';
    const selected=await dialog.showSaveDialog(window,{title:'Export Prefab',defaultPath:filename,filters:[{name:'Blockage Prefab',extensions:['blockageprefab']}]});if(selected.canceled)return{ok:true,canceled:true};await atomicWrite(selected.filePath,JSON.stringify(prefab,null,2));return{ok:true,name:path.basename(selected.filePath)};
  }));
  ipcMain.handle('blockage:prefab-open',guarded(async()=>{
    const picked=await dialog.showOpenDialog(window,{title:'Import Prefab',properties:['openFile'],filters:[{name:'Blockage Prefab',extensions:['blockageprefab','json']}]});if(picked.canceled)return{ok:true,canceled:true};const stat=await fs.stat(picked.filePaths[0]);if(stat.size>MAX_SCENE_BYTES)throw new Error('Prefab exceeds 160 MiB.');return{ok:true,prefab:await validatedPrefab(await fs.readFile(picked.filePaths[0],'utf8'))};
  }));
  ipcMain.handle('blockage:autosave', guarded(async text => { await atomicWrite(recoveryPath(), await validatedText(text)); return { ok: true }; }));
  ipcMain.handle('blockage:recover', guarded(async () => { try { return { ok: true, scene: await readScene(recoveryPath()) }; } catch { return { ok: true, scene: null }; } }));
  ipcMain.handle('blockage:clear-recovery', guarded(async () => { await fs.rm(recoveryPath(), { force: true }); return { ok: true }; }));
  ipcMain.handle('blockage:reset-path', guarded(async () => { scenePath = null; return { ok: true }; }));
  ipcMain.handle('blockage:close-recovery', guarded(async text => { await atomicWrite(recoveryPath(), await validatedText(text)); dirty = false; window.close(); return { ok: true }; }));
  ipcMain.on('blockage:dirty', (event, value) => { if (event.sender === window?.webContents) { dirty = Boolean(value); window.setDocumentEdited(dirty); } });
  ipcMain.on('blockage:window', (event, action) => {
    if (event.sender !== window?.webContents) return;
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
    if (action === 'devtools') window.webContents.toggleDevTools();
  });
}
function createWindow() {
  window = new BrowserWindow({ title: 'Blockage', width: 1600, height: 1000, minWidth: 1100, minHeight: 720, backgroundColor: '#171b22', frame: process.platform === 'darwin', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', icon: path.join(root, 'assets', 'icon.png'), autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (!dirty) return;
    const answer = dialog.showMessageBoxSync(window, { type: 'question', title: 'Unsaved Scene', message: 'Keep your unsaved scene?', detail: 'A recovery copy will be offered when you reopen Blockage. Choose Cancel to save your scene first.', buttons: ['Keep recovery & close', 'Cancel'], defaultId: 1, cancelId: 1 });
    event.preventDefault();
    if (answer === 0) window.webContents.send('blockage:menu', 'closeWithRecovery');
  });
  window.loadURL(`blockage://app/src/index.html${player ? '?player=1' : ''}`);
  const send = action => () => window.webContents.send('blockage:menu', action);
  const template = [
    { label: 'File', submenu: [{ label: 'New Scene', accelerator: 'CmdOrCtrl+N', click: send('new') }, { label: 'Open Scene…', accelerator: 'CmdOrCtrl+O', click: send('open') }, { type: 'separator' }, { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') }, { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') }, { label:'Import Model Folder…',click:send('importFolder') }, { label: 'Import Assets…', accelerator: 'CmdOrCtrl+I', click: send('import') }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') }, { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: send('duplicate') }, { label: 'Delete', accelerator: 'Delete', click: send('delete') },{type:'separator'},{label:'Preferences…',click:send('preferences')}] },
    { label: 'View', submenu: [{ label: 'Focus Selected', accelerator: 'F', click: send('focus') }, { label: 'Toggle Grid', click: send('grid') }, { label: 'Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }, { label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => window.webContents.toggleDevTools() }] },
    { label: 'Help', submenu: [{label:'Check for Updates…',click:send('updates')},{ label: 'Controls & About', click: send('help') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
app.whenReady().then(async () => {
  await fs.mkdir(app.getPath('userData'),{recursive:true});preferences=new Preferences(app.getPath('userData'));await preferences.load();updater=new UpdateService({fetchImpl:(url,options)=>net.fetch(url,options),directory:app.getPath('userData'),currentVersion,onProgress:progress=>window?.webContents.send('blockage:update-progress',progress)});
  protocol.handle('blockage', async request => {
    try { const filename = resolveAppPath(root, request.url); return new Response(await fs.readFile(filename), { headers: { 'content-type': mime[path.extname(filename)] || 'application/octet-stream' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  installIPC(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
