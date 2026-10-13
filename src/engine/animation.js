export const ANIMATION_DEFAULTS = Object.freeze({ enabled: true, interpolation: 'linear', keys: [] });
export function sampleAnimation(animation,time,duration=8,loop=true) {
  const keys=animation?.keys;if(!animation?.enabled||!keys?.length)return null;
  const t=loop&&time>duration?time%duration:Math.max(0,Math.min(duration,time));
  let a=keys[0],b=keys.at(-1);if(t<=a.time)return structuredClone(a.transform);if(t>=b.time)return structuredClone(b.transform);
  for(let i=1;i<keys.length;i++)if(keys[i].time>=t){a=keys[i-1];b=keys[i];break;}
  let u=animation.interpolation==='step'?0:(t-a.time)/(b.time-a.time);if(animation.interpolation==='smooth')u=u*u*(3-2*u);
  const result={};for(const property of ['position','rotation','scale'])result[property]=a.transform[property].map((v,i)=>{let delta=b.transform[property][i]-v;if(property==='rotation')delta=((delta+180)%360+360)%360-180;return v+delta*u;});return result;
}
export function captureKey(entity,time,transform=entity.transform) {
  const key={time:Number(time.toFixed(4)),transform:structuredClone(transform)};const keys=entity.animation.keys;
  const existing=keys.findIndex(k=>Math.abs(k.time-key.time)<.0001);if(existing>=0)keys[existing]=key;else keys.push(key);keys.sort((a,b)=>a.time-b.time);return key;
}
