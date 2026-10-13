export const RIG_DEFAULTS=Object.freeze({mode:'source',chainBones:6,showSkeleton:false,poses:[],keys:[],interpolation:'smooth'});
export const PLAYER_DEFAULTS=Object.freeze({enabled:false,speed:3.5,runSpeed:7,acceleration:14,turnSpeed:12,jumpSpeed:5.5,gravity:9.81,radius:.3,height:1.9,floor:0,camera:'thirdPerson',cameraDistance:4.5,cameraHeight:1.6,sensitivity:.003,frontOffset:0,idleClip:0,walkClip:1,runClip:2,jumpClip:3,transition:.2});
export const emptyBonePose=bone=>({bone,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export function captureRigKey(entity,time){const key={time,poses:structuredClone(entity.rig.poses)};entity.rig.keys=entity.rig.keys.filter(k=>Math.abs(k.time-time)>.0001).concat(key).sort((a,b)=>a.time-b.time);return key;}
