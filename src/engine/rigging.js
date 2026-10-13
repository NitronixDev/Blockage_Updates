import * as THREE from 'three/webgpu';
import { emptyBonePose } from './character-data.js';
const rad=v=>v*Math.PI/180,deg=v=>v*180/Math.PI;
export function humanoidBones(height=1.9,center=[0,0,0]){
  const layout=[['Hips',-1,0,.52,0],['Spine',0,0,.61,0],['Chest',1,0,.74,0],['Neck',2,0,.83,0],['Head',3,0,.92,0],['LeftUpperArm',2,-.19,.76,0],['LeftForeArm',5,-.34,.76,0],['LeftHand',6,-.47,.76,0],['RightUpperArm',2,.19,.76,0],['RightForeArm',8,.34,.76,0],['RightHand',9,.47,.76,0],['LeftUpperLeg',0,-.09,.50,0],['LeftLowerLeg',11,-.09,.27,0],['LeftFoot',12,-.09,.06,.035],['RightUpperLeg',0,.09,.50,0],['RightLowerLeg',14,.09,.27,0],['RightFoot',15,.09,.06,.035]];
  const positions=layout.map(([, ,x,y,z])=>new THREE.Vector3(x*height+center[0],y*height+center[1],z*height+center[2]));
  const bones=layout.map(([name])=>{const b=new THREE.Bone();b.name=name;return b;});layout.forEach(([,parent],i)=>{bones[i].position.copy(positions[i]);if(parent>=0){bones[i].position.sub(positions[parent]);bones[parent].add(bones[i]);}});return bones;
}
export function autoRig(root,settings){
  const meshes=[];root.traverse(o=>{if(o.isSkinnedMesh)throw new Error('This model already has skin weights. Use its source rig.');if(o.isMesh)meshes.push(o);});
  const count=meshes.reduce((n,m)=>n+(m.geometry.attributes.position?.count||0),0);if(!count||count>100000)throw new Error('Automatic rigging supports up to 100,000 vertices.');
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),inverse=root.matrixWorld.clone().invert();bounds.applyMatrix4(inverse);const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),height=Math.max(.1,size.y);let bones;
  if(settings.mode==='humanoid')bones=humanoidBones(height,[center.x,bounds.min.y,center.z]);else{bones=Array.from({length:settings.chainBones},(_,i)=>{const b=new THREE.Bone();b.name=`Bone_${i+1}`;b.position.set(i?0:center.x,i?height/(settings.chainBones-1):bounds.min.y,i?0:center.z);return b;});bones.forEach((b,i)=>{if(i)bones[i-1].add(b);});}
  root.add(bones[0]);root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones),points=bones.map(b=>b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
  const distance=(p,i)=>{const child=bones[i].children.find(b=>b.isBone),end=child?points[bones.indexOf(child)]:points[i],start=points[i],delta=end.clone().sub(start),length=delta.lengthSq(),t=length?THREE.MathUtils.clamp(p.clone().sub(start).dot(delta)/length,0,1):0;return p.distanceTo(start.clone().addScaledVector(delta,t));};
  const originals=new Set();for(const mesh of meshes){const geometry=mesh.geometry.clone(),vertices=geometry.attributes.position,indices=new Uint16Array(vertices.count*4),weights=new Float32Array(vertices.count*4),matrix=inverse.clone().multiply(mesh.matrixWorld),p=new THREE.Vector3();
    for(let v=0;v<vertices.count;v++){p.fromBufferAttribute(vertices,v).applyMatrix4(matrix);const near=bones.map((_,i)=>({i,d:distance(p,i)})).sort((a,b)=>a.d-b.d).slice(0,2),a=1/Math.max(.0001,near[0].d**2),b=1/Math.max(.0001,near[1].d**2);indices[v*4]=near[0].i;indices[v*4+1]=near[1].i;weights[v*4]=a/(a+b);weights[v*4+1]=b/(a+b);}
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const skin=new THREE.SkinnedMesh(geometry,mesh.material);skin.name=mesh.name;skin.position.copy(mesh.position);skin.quaternion.copy(mesh.quaternion);skin.scale.copy(mesh.scale);skin.userData={...mesh.userData};skin.castShadow=mesh.castShadow;skin.receiveShadow=mesh.receiveShadow;skin.frustumCulled=false;const parent=mesh.parent,index=parent.children.indexOf(mesh);for(const child of [...mesh.children])skin.add(child);parent.remove(mesh);parent.add(skin);parent.children.splice(parent.children.indexOf(skin),1);parent.children.splice(index,0,skin);root.updateMatrixWorld(true);skin.bind(skeleton,skin.matrixWorld);originals.add(mesh.geometry);
  }for(const geometry of originals)geometry.dispose();return bones;
}
function quaternion(rotation){return new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map(rad)));}
export function sampleRigPoses(rig,time,duration,loop=false){
  if(!rig.keys.length)return rig.poses;const keys=rig.keys,t=loop?time%duration:Math.min(time,duration);if(t<=keys[0].time)return keys[0].poses;if(t>=keys.at(-1).time)return keys.at(-1).poses;const next=keys.findIndex(k=>k.time>t),a=keys[next-1],b=keys[next];let alpha=(t-a.time)/(b.time-a.time);if(rig.interpolation==='step')return a.poses;if(rig.interpolation==='smooth')alpha=alpha*alpha*(3-2*alpha);
  const poses=new Map(a.poses.map(p=>[p.bone,p])),other=new Map(b.poses.map(p=>[p.bone,p]));return [...new Set([...poses.keys(),...other.keys()])].map(i=>{const x=poses.get(i)||emptyBonePose(i),y=other.get(i)||emptyBonePose(i),rotation=new THREE.Euler().setFromQuaternion(quaternion(x.rotation).slerp(quaternion(y.rotation),alpha));return{bone:i,position:x.position.map((v,k)=>THREE.MathUtils.lerp(v,y.position[k],alpha)),rotation:[rotation.x,rotation.y,rotation.z].map(deg),scale:x.scale.map((v,k)=>THREE.MathUtils.lerp(v,y.scale[k],alpha))};});
}
export class RigState {
  constructor(root,entity){this.root=root;this.entity=entity;const unique=new Set();root.traverse(o=>{if(o.isSkinnedMesh)for(const b of o.skeleton.bones)unique.add(b);});root.traverse(o=>{if(o.isBone)unique.add(o);});this.bones=[...unique];this.rest=this.snapshot();this.frame=this.snapshot();this.helper=new THREE.SkeletonHelper(root);this.helper.material.depthTest=false;this.helper.renderOrder=5;}
  snapshot(){return this.bones.map(b=>({position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}));}
  restore(){this.bones.forEach((b,i)=>{b.position.copy(this.rest[i].position);b.quaternion.copy(this.rest[i].quaternion);b.scale.copy(this.rest[i].scale);});}
  captureFrame(){this.frame=this.snapshot();}
  offsets(index){const b=this.bones[index],base=this.frame[index];if(!b)return emptyBonePose(index);const rotation=new THREE.Euler().setFromQuaternion(base.quaternion.clone().invert().multiply(b.quaternion));return{bone:index,position:b.position.clone().sub(base.position).toArray(),rotation:[rotation.x,rotation.y,rotation.z].map(deg),scale:b.scale.clone().divide(base.scale).toArray()};}
  applyPoses(poses){for(const p of poses){const b=this.bones[p.bone],base=this.frame[p.bone];if(!b)continue;b.position.copy(base.position).add(new THREE.Vector3(...p.position));b.quaternion.copy(base.quaternion).multiply(quaternion(p.rotation));b.scale.copy(base.scale).multiply(new THREE.Vector3(...p.scale));}this.root.updateMatrixWorld(true);this.root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.frustumCulled=false;o.boundingBox=null;o.boundingSphere=null;}});}
  apply(time,timeline){this.applyPoses(sampleRigPoses(this.entity.rig,time,timeline.duration,timeline.loop));}
  dispose(){this.helper.geometry.dispose();this.helper.material.dispose();}
}
