// CPU solvers. Positions, velocities and constraints are separate from render geometry.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const SIM_DEFAULTS = Object.freeze({
  cloth: { width: 4, height: 3, segments: 18, pin: 'corners', gravity: 9.81, damping: 0.12, wind: 1.2, stiffness: 0.96, substeps: 3, iterations: 6, collisions: true, floor: 0 },
  fluid: { width: 2.5, height: 3, depth: 2.5, count: 216, radius: 0.12, gravity: 9.81, viscosity: 0.08, substeps: 2, iterations: 3, collisions: true, display: 'surface' },
  particles: { count: 256, rate: 35, lifetime: 3, speed: 3, spread: 0.65, gravity: 3, size: 0.045, bounce: 0.25, floor: 0 }
});
export const simulationDefaults = kind => structuredClone(SIM_DEFAULTS[kind]);

function projectPoint(p, i, radius, floor, colliders = []) {
  p[i + 1] = Math.max(floor + radius, p[i + 1]);
  for (const c of colliders) {
    if (c.type === 'sphere') {
      let dx = p[i] - c.center[0], dy = p[i + 1] - c.center[1], dz = p[i + 2] - c.center[2];
      const r = c.radius + radius, d = Math.hypot(dx, dy, dz);
      if (d < r) { if (d < 1e-9) { dx = 0; dy = 1; dz = 0; } const f = r / (d < 1e-9 ? 1 : d); p[i] = c.center[0] + dx * f; p[i+1] = c.center[1] + dy * f; p[i+2] = c.center[2] + dz * f; }
    } else if (c.type === 'box') {
      const lo = c.min.map(x => x - radius), hi = c.max.map(x => x + radius);
      if (p[i] > lo[0] && p[i] < hi[0] && p[i+1] > lo[1] && p[i+1] < hi[1] && p[i+2] > lo[2] && p[i+2] < hi[2]) {
        let best = Infinity, axis = 0, value = 0;
        for (let k = 0; k < 3; k++) for (const face of [lo[k], hi[k]]) { const d = Math.abs(p[i+k] - face); if (d < best) { best = d; axis = k; value = face; } }
        p[i+axis] = value;
      }
    }
  }
}

export class ClothSolver {
  constructor(options = {}) {
    this.config = { ...SIM_DEFAULTS.cloth, ...options };
    const c = this.config, n = c.segments, stride = n + 1;
    this.count = stride * stride; this.positions = new Float32Array(this.count * 3); this.rest = new Float32Array(this.count * 3); this.previous = new Float32Array(this.count * 3); this.velocity = new Float32Array(this.count * 3); this.weights = new Float32Array(this.count); this.constraints = []; this.time = 0;
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
      const id = y * stride + x, i = id * 3;
      this.rest[i] = (x / n - 0.5) * c.width; this.rest[i+1] = c.height * (1 - y/n);
      // A small deterministic perturbation lets an unpinned sheet buckle instead of standing perfectly edge-on on the floor.
      this.rest[i+2] = c.pin==='none' ? Math.sin(x*.7+y*1.2)*.008 : 0;
      this.weights[id] = y === 0 && (c.pin === 'edge' || (c.pin === 'corners' && (x === 0 || x === n))) ? 0 : 1;
    }
    const link = (a, b, bend = false) => { const ia = a*3, ib = b*3; this.constraints.push({ a, b, length: Math.hypot(this.rest[ia]-this.rest[ib],this.rest[ia+1]-this.rest[ib+1],this.rest[ia+2]-this.rest[ib+2]), bend, lambda: 0 }); };
    for (let y=0;y<=n;y++) for(let x=0;x<=n;x++) {
      const a=y*stride+x;
      if(x<n)link(a,a+1); if(y<n)link(a,a+stride);
      if(x<n&&y<n){link(a,a+stride+1);link(a+1,a+stride);}
      if(x<n-1)link(a,a+2,true); if(y<n-1)link(a,a+stride*2,true);
    }
    const triangles=[];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*stride+x,b=a+1,d=a+stride,e=d+1;triangles.push(a,d,b,b,d,e);}
    this.indices = new Uint32Array(triangles); this.reset();
  }
  reset() { this.positions.set(this.rest); this.previous.set(this.rest); this.velocity.fill(0); this.time=0; for(const c of this.constraints)c.lambda=0; }
  step(dt, colliders = []) {
    const c=this.config,h=dt/c.substeps,p=this.positions,v=this.velocity,prev=this.previous;
    for(let sub=0;sub<c.substeps;sub++) {
      this.time+=h; prev.set(p);
      for(let id=0;id<this.count;id++) {
        const i=id*3;if(!this.weights[id]){p[i]=this.rest[i];p[i+1]=this.rest[i+1];p[i+2]=this.rest[i+2];continue;}
        v[i+1]-=c.gravity*h; v[i+2]+=c.wind*(0.55+0.45*Math.sin(this.time*1.7+p[i]*0.6))*h;
        for(let k=0;k<3;k++)p[i+k]+=v[i+k]*h;
      }
      for(const constraint of this.constraints)constraint.lambda=0;
      for(let iteration=0;iteration<c.iterations;iteration++) {
        for(const q of this.constraints) {
          const a=q.a*3,b=q.b*3,wa=this.weights[q.a],wb=this.weights[q.b];if(!wa&&!wb)continue;
          const dx=p[a]-p[b],dy=p[a+1]-p[b+1],dz=p[a+2]-p[b+2],d=Math.hypot(dx,dy,dz);if(d<1e-8)continue;
          const compliance=(1-c.stiffness)*0.00008*(q.bend?12:1),alpha=compliance/(h*h),dl=(-(d-q.length)-alpha*q.lambda)/(wa+wb+alpha);q.lambda+=dl;
          const f=dl/d;p[a]+=wa*dx*f;p[a+1]+=wa*dy*f;p[a+2]+=wa*dz*f;p[b]-=wb*dx*f;p[b+1]-=wb*dy*f;p[b+2]-=wb*dz*f;
        }
        for(let id=0;id<this.count;id++)if(this.weights[id])projectPoint(p,id*3,0.025,c.floor,c.collisions?colliders:[]);
      }
      const drag=Math.exp(-c.damping*5*h);
      for(let id=0;id<this.count;id++){const i=id*3;for(let k=0;k<3;k++)v[i+k]=this.weights[id]?clamp((p[i+k]-prev[i+k])/h,-40,40)*drag:0;}
    }
  }
}

class SpatialHash {
  constructor(cellSize) { this.cellSize=cellSize;this.cells=new Map(); }
  build(p) { this.cells.clear();const h=this.cellSize;for(let i=0;i<p.length;i+=3){const key=`${Math.floor(p[i]/h)},${Math.floor(p[i+1]/h)},${Math.floor(p[i+2]/h)}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(i/3);} }
  neighbors(p,id) { const i=id*3,h=this.cellSize,x=Math.floor(p[i]/h),y=Math.floor(p[i+1]/h),z=Math.floor(p[i+2]/h),result=[];for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const list=this.cells.get(`${x+dx},${y+dy},${z+dz}`);if(list)result.push(...list);}return result; }
}

export class FluidSolver {
  constructor(options = {}) {
    this.config={...SIM_DEFAULTS.fluid,...options};const c=this.config;
    this.count=c.count;this.positions=new Float32Array(c.count*3);this.rest=new Float32Array(c.count*3);this.previous=new Float32Array(c.count*3);this.velocity=new Float32Array(c.count*3);this.deltas=new Float32Array(c.count*3);this.lambdas=new Float32Array(c.count);this.densities=new Float32Array(c.count);
    this.h=c.radius*4;this.hash=new SpatialHash(this.h);this.neighborLists=[];
    const side=Math.ceil(Math.cbrt(c.count));this.spacing=Math.min(c.radius*2.05,(c.width-c.radius*2)/(side+0.5),(c.height-c.radius*2)/(side+0.5),(c.depth-c.radius*2)/(side+0.5));
    this.massVolume=this.spacing**3;
    for(let id=0;id<c.count;id++){const x=id%side,y=Math.floor(id/side)%side,z=Math.floor(id/(side*side)),i=id*3;this.rest[i]=-c.width*.3+x*this.spacing;this.rest[i+1]=Math.min(c.height-c.radius,(c.height-side*this.spacing)*.5+c.radius+y*this.spacing);this.rest[i+2]=(z-(side-1)/2)*this.spacing;}
    this.poly=315/(64*Math.PI*this.h**9);this.spiky=-45/(Math.PI*this.h**6);this.reset();
  }
  reset(){this.positions.set(this.rest);this.previous.set(this.rest);this.velocity.fill(0);this.lambdas.fill(0);this.densities.fill(0);}
  kernel(r2){const h2=this.h*this.h;if(r2>=h2)return 0;return this.poly*(h2-r2)**3;}
  constrain(colliders){const c=this.config,p=this.positions,r=c.radius;for(let i=0;i<p.length;i+=3){p[i]=clamp(p[i],-c.width/2+r,c.width/2-r);p[i+1]=clamp(p[i+1],r,c.height-r);p[i+2]=clamp(p[i+2],-c.depth/2+r,c.depth/2-r);projectPoint(p,i,r,0,c.collisions?colliders:[]);p[i]=clamp(p[i],-c.width/2+r,c.width/2-r);p[i+1]=clamp(p[i+1],r,c.height-r);p[i+2]=clamp(p[i+2],-c.depth/2+r,c.depth/2-r);}}
  step(dt,colliders=[]){const c=this.config,p=this.positions,v=this.velocity,h=dt/c.substeps;
    for(let sub=0;sub<c.substeps;sub++){
      this.previous.set(p);for(let i=0;i<p.length;i+=3){v[i+1]-=c.gravity*h;for(let k=0;k<3;k++)p[i+k]+=v[i+k]*h;}this.constrain(colliders);
      for(let iteration=0;iteration<c.iterations;iteration++){
        this.hash.build(p);for(let id=0;id<this.count;id++)this.neighborLists[id]=this.hash.neighbors(p,id);
        for(let id=0;id<this.count;id++){
          const i=id*3;let density=0,gx=0,gy=0,gz=0,sum=0;
          for(const j of this.neighborLists[id]){const b=j*3,dx=p[i]-p[b],dy=p[i+1]-p[b+1],dz=p[i+2]-p[b+2],r2=dx*dx+dy*dy+dz*dz;density+=this.massVolume*this.kernel(r2);if(j===id||r2>=this.h*this.h||r2<1e-12)continue;const r=Math.sqrt(r2),f=this.massVolume*this.spiky*(this.h-r)**2/r,ax=dx*f,ay=dy*f,az=dz*f;gx+=ax;gy+=ay;gz+=az;sum+=ax*ax+ay*ay+az*az;}
          this.densities[id]=density;this.lambdas[id]=-Math.max(0,density-1)/(sum+gx*gx+gy*gy+gz*gz+1e-5);
        }
        this.deltas.fill(0);
        for(let id=0;id<this.count;id++){
          const i=id*3;for(const j of this.neighborLists[id]){if(j===id)continue;const b=j*3,dx=p[i]-p[b],dy=p[i+1]-p[b+1],dz=p[i+2]-p[b+2],r=Math.hypot(dx,dy,dz);if(r>=this.h||r<1e-8)continue;
            const pressure=-0.00008*(this.kernel(r*r)/this.kernel((.3*this.h)**2))**4,f=this.massVolume*(this.lambdas[id]+this.lambdas[j]+pressure)*this.spiky*(this.h-r)**2/r;
            let sep=0;if(r<c.radius*1.65)sep=(c.radius*1.65-r)*.18/r;
            this.deltas[i]+=dx*(f+sep);this.deltas[i+1]+=dy*(f+sep);this.deltas[i+2]+=dz*(f+sep);
          }
        }
        for(let i=0;i<p.length;i++)p[i]+=clamp(this.deltas[i],-c.radius*.35,c.radius*.35);this.constrain(colliders);
      }
      for(let i=0;i<p.length;i++)v[i]=clamp((p[i]-this.previous[i])/h,-18,18);
      const next=new Float32Array(v);
      for(let id=0;id<this.count;id++){const i=id*3;let w=0,ax=0,ay=0,az=0;for(const j of this.neighborLists[id]||[]){if(id===j)continue;const b=j*3,r2=(p[i]-p[b])**2+(p[i+1]-p[b+1])**2+(p[i+2]-p[b+2])**2,k=this.massVolume*this.kernel(r2);w+=k;ax+=(v[b]-v[i])*k;ay+=(v[b+1]-v[i+1])*k;az+=(v[b+2]-v[i+2])*k;}const f=c.viscosity/Math.max(1,w);next[i]+=ax*f;next[i+1]+=ay*f;next[i+2]+=az*f;}v.set(next);
    }
  }
}

export class ParticleSolver {
  constructor(options={}){this.config={...SIM_DEFAULTS.particles,...options};this.count=this.config.count;this.positions=new Float32Array(this.count*3);this.velocity=new Float32Array(this.count*3);this.ages=new Float32Array(this.count);this.reset();}
  reset(){this.positions.fill(0);this.velocity.fill(0);this.ages.fill(-1);this.emission=0;this.seed=123456;}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  step(dt){const c=this.config;this.emission+=c.rate*dt;for(let id=0;id<this.count;id++){const i=id*3;if(this.ages[id]>=0){this.ages[id]+=dt;if(this.ages[id]>c.lifetime){this.ages[id]=-1;continue;}this.velocity[i+1]-=c.gravity*dt;for(let k=0;k<3;k++)this.positions[i+k]+=this.velocity[i+k]*dt;if(this.positions[i+1]<c.floor+c.size){this.positions[i+1]=c.floor+c.size;this.velocity[i+1]=Math.abs(this.velocity[i+1])*c.bounce;}}
      if(this.ages[id]<0&&this.emission>=1){this.emission-=1;this.ages[id]=0;this.positions[i]=0;this.positions[i+1]=0;this.positions[i+2]=0;const a=this.random()*Math.PI*2,r=Math.sqrt(this.random())*c.spread;this.velocity[i]=Math.cos(a)*r*c.speed;this.velocity[i+1]=c.speed*(.8+this.random()*.4);this.velocity[i+2]=Math.sin(a)*r*c.speed;}}
    this.emission=Math.min(this.emission,this.count);
  }
}
