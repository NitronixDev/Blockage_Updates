export const WATER_DEFAULTS = Object.freeze({ width: 12, depth: 12, resolution: 64, waveSpeed: 3, damping: 1.2, amplitude: .035, wavelength: 3, speed: 1, rainRate: .6, rippleStrength: .3, rippleRadius: .45, interactions: true });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** A damped heightfield wave equation. CFL-limited substeps keep small cells stable. */
export class WaterSolver {
  constructor(options = {}) {
    this.config = { ...WATER_DEFAULTS, ...options };
    const n = this.config.resolution;
    this.stride = n + 1; this.count = this.stride ** 2;
    this.heights = new Float32Array(this.count); this.velocity = new Float32Array(this.count);
    this.nextVelocity = new Float32Array(this.count); this.positions = new Float32Array(this.count * 3);
    this.reset();
  }
  reset() { this.heights.fill(0); this.velocity.fill(0); this.time = 0; this.rain = 0; this.seed = 12345; this.updatePositions(); }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  ripple(x, z, strength = this.config.rippleStrength, radius = this.config.rippleRadius) {
    const c = this.config, n = c.resolution;
    if (Math.abs(x) > c.width / 2 || Math.abs(z) > c.depth / 2) return false;
    const gx = (x / c.width + .5) * n, gz = (z / c.depth + .5) * n;
    const rx = Math.max(1, radius / c.width * n), rz = Math.max(1, radius / c.depth * n);
    for (let j = Math.max(1, Math.floor(gz-rz*2)); j <= Math.min(n-1, Math.ceil(gz+rz*2)); j++)
      for (let i = Math.max(1, Math.floor(gx-rx*2)); i <= Math.min(n-1, Math.ceil(gx+rx*2)); i++) {
        const d = ((i-gx)/rx)**2 + ((j-gz)/rz)**2;
        this.heights[j*this.stride+i] = clamp(this.heights[j*this.stride+i] + strength * Math.exp(-d*2), -2, 2);
      }
    return true;
  }
  baseWave(x, z) { const c = this.config; return c.amplitude * (Math.sin((x+z*.35)*Math.PI*2/c.wavelength-this.time*c.speed) + .45*Math.sin((z-x*.2)*Math.PI*2/c.wavelength+this.time*c.speed*.7)); }
  sample(x,z) {
    const c=this.config,n=c.resolution;
    if(Math.abs(x)>c.width/2||Math.abs(z)>c.depth/2)return null;
    const gx=clamp((x/c.width+.5)*n,0,n),gz=clamp((z/c.depth+.5)*n,0,n),i=Math.min(n-1,Math.floor(gx)),j=Math.min(n-1,Math.floor(gz)),a=gx-i,b=gz-j,k=j*this.stride+i;
    return (this.heights[k]*(1-a)+this.heights[k+1]*a)*(1-b)+(this.heights[k+this.stride]*(1-a)+this.heights[k+this.stride+1]*a)*b+this.baseWave(x,z);
  }
  step(dt) {
    const c=this.config,n=c.resolution,dx=c.width/n,dz=c.depth/n;
    const count=Math.max(1,Math.ceil(dt*c.waveSpeed*Math.sqrt(1/dx**2+1/dz**2)/.55)),h=dt/count;
    for(let s=0;s<count;s++){
      for(let z=1;z<n;z++)for(let x=1;x<n;x++){
        const i=z*this.stride+x,v=this.heights;
        const lap=(v[i-1]+v[i+1]-2*v[i])/dx**2+(v[i-this.stride]+v[i+this.stride]-2*v[i])/dz**2;
        this.nextVelocity[i]=(this.velocity[i]+c.waveSpeed**2*lap*h)*Math.exp(-c.damping*h);
      }
      for(let i=0;i<this.count;i++){this.velocity[i]=this.nextVelocity[i];this.heights[i]=clamp(this.heights[i]+this.velocity[i]*h,-2,2);}
    }
    this.time+=dt; this.rain+=dt*c.rainRate;
    while(this.rain>=1){this.rain--;this.ripple((this.random()-.5)*c.width*.85,(this.random()-.5)*c.depth*.85,c.rippleStrength*.5);}
  }
  updatePositions(){const c=this.config,n=c.resolution;for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const i=(z*this.stride+x)*3,px=(x/n-.5)*c.width,pz=(z/n-.5)*c.depth;this.positions[i]=px;this.positions[i+1]=this.heights[i/3]+this.baseWave(px,pz);this.positions[i+2]=pz;}}
}
