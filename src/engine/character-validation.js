export function validateCharacter(entity,timeline){
  const number=(v,name,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw new Error(`Invalid ${name}.`);};
  const boolean=(v,name)=>{if(typeof v!=='boolean')throw new Error(`Invalid ${name}.`);};
  const poses=list=>{if(!Array.isArray(list)||list.length>256)throw new Error('Invalid bone poses.');const seen=new Set();for(const p of list){number(p.bone,'bone index',0,255,true);if(seen.has(p.bone))throw new Error('Duplicate bone pose.');seen.add(p.bone);for(const field of ['position','rotation','scale']){if(!Array.isArray(p[field])||p[field].length!==3)throw new Error('Invalid bone vector.');p[field].forEach(v=>number(v,'bone '+field,field==='scale'?.001:-10000,10000));}}};
  const rig=entity.rig;if(!rig||!['source','chain','humanoid'].includes(rig.mode))throw new Error('Invalid rig mode.');number(rig.chainBones,'chain bones',2,32,true);boolean(rig.showSkeleton,'skeleton visibility');if(!['linear','smooth','step'].includes(rig.interpolation))throw new Error('Invalid rig interpolation.');poses(rig.poses);
  if(!Array.isArray(rig.keys)||rig.keys.length>256)throw new Error('Invalid rig keys.');let last=-1;for(const key of rig.keys){number(key.time,'pose key time',0,timeline.duration);if(key.time<=last)throw new Error('Pose keys must be sorted and unique.');last=key.time;poses(key.poses);}
  const p=entity.player;boolean(p?.enabled,'player enabled');if(!['firstPerson','thirdPerson'].includes(p.camera))throw new Error('Invalid player camera.');
  for(const [name,min,max] of [['speed',.1,30],['runSpeed',.1,50],['acceleration',.1,100],['turnSpeed',.1,100],['jumpSpeed',0,30],['gravity',0,50],['radius',.05,3],['height',.1,10],['floor',-10000,10000],['cameraDistance',.2,30],['cameraHeight',0,10],['sensitivity',.0001,.02],['frontOffset',-360,360],['transition',0,3]])number(p[name],'player '+name,min,max);
  for(const name of ['idleClip','walkClip','runClip','jumpClip'])number(p[name],'player '+name,-1,255,true);
  if(p.height<2*p.radius)throw new Error('Player height must be at least twice its radius.');
  if(p.enabled&&(Object.keys(entity.behaviors||{}).length||entity.animation.enabled&&entity.animation.keys.length))throw new Error('Player controller owns transforms; remove transform behaviors and keys first.');
  number(entity.modelAnimation.fade,'clip blend time',0,3);
}
