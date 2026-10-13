const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
/** Linear impulse solver: spheres and conservative axis-aligned boxes, no angular dynamics. */
export class RigidWorld {
  constructor(bodies=[],options={}){this.bodies=bodies;this.gravity=options.gravity??9.81;this.contacts=0;}
  step(dt,groundAt=()=>null,waterAt=()=>null){
    this.contacts=0;
    const count=2,h=dt/count;
    for(let sub=0;sub<count;sub++){
      for(const b of this.bodies){if(!b.invMass)continue;
        b.velocity[1]-=this.gravity*h;
        if(b.buoyancy){const water=waterAt(b.position[0],b.position[2]);if(water!==null){const immersion=clamp((water-(b.position[1]-b.half[1]))/(b.half[1]*2),0,1);b.velocity[1]+=this.gravity*b.buoyancy.strength*immersion*h;for(let k=0;k<3;k++)b.velocity[k]*=Math.exp(-b.buoyancy.drag*immersion*h);}}
        if(b.joint){const target=this.bodies.find(x=>x.id===b.joint.target);if(target){const d=b.position.map((v,k)=>target.position[k]-v),length=Math.hypot(...d);if(length>1e-8){const n=d.map(v=>v/length),relative=target.velocity.map((v,k)=>v-b.velocity[k]),f=(length-b.joint.length)*b.joint.stiffness+dot(relative,n)*b.joint.damping;for(let k=0;k<3;k++){b.velocity[k]+=n[k]*f*b.invMass*h;if(target.invMass)target.velocity[k]-=n[k]*f*target.invMass*h;}}}}
        for(let k=0;k<3;k++){b.velocity[k]*=Math.exp(-(b.damping??.03)*h);b.position[k]+=b.velocity[k]*h;}
        const floor=Math.max(b.floor??-10000,groundAt(b.position[0],b.position[2])??-10000)+b.half[1];
        if(b.position[1]<floor){b.position[1]=floor;if(b.velocity[1]<0)b.velocity[1]=-b.velocity[1]*(Math.abs(b.velocity[1])<.35?0:b.restitution);const friction=Math.exp(-b.friction*8*h);b.velocity[0]*=friction;b.velocity[2]*=friction;this.contacts++;}
      }
      // Sweep on X, then solve contacts iteratively to support resting stacks.
      for(let iteration=0;iteration<6;iteration++){
        const sorted=[...this.bodies].sort((a,b)=>a.position[0]-a.half[0]-(b.position[0]-b.half[0]));
        for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
          const a=sorted[i],b=sorted[j];if(b.position[0]-b.half[0]>a.position[0]+a.half[0])break;if(!a.invMass&&!b.invMass||a.collisions===false||b.collisions===false)continue;
          const contact=collide(a,b);if(contact){resolve(a,b,contact);this.contacts++;}
        }
        for(const b of this.bodies)if(b.invMass){const floor=Math.max(b.floor??-10000,groundAt(b.position[0],b.position[2])??-10000)+b.half[1];if(b.position[1]<floor){b.position[1]=floor;if(b.velocity[1]<0)b.velocity[1]=0;}}
      }
    }
  }
}
export function collide(a,b){
  const delta=b.position.map((v,k)=>v-a.position[k]);
  if(a.type==='sphere'&&b.type==='sphere'){const distance=Math.hypot(...delta),depth=a.half[0]+b.half[0]-distance;if(depth<=0)return null;return{normal:distance>1e-9?delta.map(v=>v/distance):[0,1,0],depth};}
  if(a.type==='sphere'||b.type==='sphere'){
    const sphere=a.type==='sphere'?a:b,box=sphere===a?b:a,closest=sphere.position.map((v,k)=>clamp(v,box.position[k]-box.half[k],box.position[k]+box.half[k])),d=closest.map((v,k)=>v-sphere.position[k]),distance=Math.hypot(...d);
    if(distance>1e-9){if(distance>=sphere.half[0])return null;return{normal:d.map(v=>v/distance*(sphere===a?1:-1)),depth:sphere.half[0]-distance};}
    let axis=0,gap=Infinity,sign=1;for(let k=0;k<3;k++){const g=box.half[k]-Math.abs(sphere.position[k]-box.position[k]);if(g<gap){gap=g;axis=k;sign=sphere.position[k]>=box.position[k]?1:-1;}}
    const normal=[0,0,0];normal[axis]=-sign*(sphere===a?1:-1);return{normal,depth:sphere.half[0]+gap};
  }
  let depth=Infinity,axis=0;for(let k=0;k<3;k++){const d=a.half[k]+b.half[k]-Math.abs(delta[k]);if(d<=0)return null;if(d<depth){depth=d;axis=k;}}
  const normal=[0,0,0];normal[axis]=delta[axis]>=0?1:-1;return{normal,depth};
}
function resolve(a,b,{normal,depth}){
  const inverse=a.invMass+b.invMass,correction=Math.max(0,depth-.0001)*.85/inverse;
  for(let k=0;k<3;k++){a.position[k]-=normal[k]*correction*a.invMass;b.position[k]+=normal[k]*correction*b.invMass;}
  const relative=b.velocity.map((v,k)=>v-a.velocity[k]),speed=dot(relative,normal);if(speed>=0)return;
  const e=Math.abs(speed)<.35?0:Math.min(a.restitution,b.restitution),impulse=-(1+e)*speed/inverse;
  for(let k=0;k<3;k++){a.velocity[k]-=impulse*normal[k]*a.invMass;b.velocity[k]+=impulse*normal[k]*b.invMass;}
  const tangent=relative.map((v,k)=>v-speed*normal[k]),length=Math.hypot(...tangent);if(length<1e-8)return;
  const friction=Math.min(length/inverse,impulse*Math.sqrt(a.friction*b.friction));for(let k=0;k<3;k++){const f=tangent[k]/length*friction;a.velocity[k]+=f*a.invMass;b.velocity[k]-=f*b.invMass;}
}
