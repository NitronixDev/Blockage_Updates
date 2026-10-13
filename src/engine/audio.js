import * as THREE from 'three/webgpu';

export class AudioRuntime {
  constructor(camera,log=()=>{}){this.camera=camera;this.log=log;this.sounds=new Map();this.buffers=new Map();this.active=false;}
  async load(doc,objects){
    this.stop();for(const sound of this.sounds.values()){sound.disconnect();sound.removeFromParent();}this.sounds.clear();this.buffers.clear();
    if(!doc.assets.some(a=>a.type==='audio'))return;
    this.listener ||= new THREE.AudioListener();if(!this.listener.parent)this.camera.add(this.listener);
    for(const a of doc.assets.filter(a=>a.type==='audio')){const bytes=Uint8Array.from(atob(a.data),x=>x.charCodeAt(0));const buffer=await this.listener.context.decodeAudioData(bytes.buffer);this.buffers.set(a.id,buffer);}
    for(const e of doc.entities.filter(e=>e.kind==='audio'))this.configure(e,objects.get(e.id));
  }
  configure(e,object){const buffer=this.buffers.get(e.audio.asset);let sound=this.sounds.get(e.id);if(!buffer){if(sound){if(sound.isPlaying)sound.stop();sound.disconnect();sound.removeFromParent();this.sounds.delete(e.id);}return;}if(!sound){if(!object||!this.listener)return;sound=new THREE.PositionalAudio(this.listener);object.add(sound);this.sounds.set(e.id,sound);}if(sound.userData.asset!==e.audio.asset){if(sound.isPlaying)sound.stop();sound.setBuffer(buffer);sound.userData.asset=e.audio.asset;}sound.setVolume(e.audio.volume);sound.setLoop(e.audio.loop);sound.setPlaybackRate(e.audio.pitch);sound.setRefDistance(e.audio.distance);sound.setRolloffFactor(e.audio.rolloff);}
  async start(entities){this.stop();this.active=true;if(!this.listener)return;try{await this.listener.context.resume();if(!this.active)return;for(const e of entities)if(e.kind==='audio'&&e.audio.autoplay&&e.visible)this.sounds.get(e.id)?.play();}catch(e){this.log('warn',`Audio: ${e.message}`);}}
  async trigger(id){if(!this.active)return;try{await this.listener?.context.resume();const sound=this.sounds.get(id);if(this.active&&sound&&!sound.isPlaying)sound.play();}catch(e){this.log('warn',`Audio: ${e.message}`);}}
  pause(paused){if(this.listener)(paused?this.listener.context.suspend():this.listener.context.resume()).catch(e=>this.log('warn',e.message));}
  stop(){this.active=false;for(const sound of this.sounds.values())if(sound.isPlaying)sound.stop();}
  dispose(){this.stop();for(const sound of this.sounds.values()){sound.disconnect();sound.removeFromParent();}this.sounds.clear();this.listener?.removeFromParent();}
}
