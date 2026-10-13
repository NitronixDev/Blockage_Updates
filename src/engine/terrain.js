export const TERRAIN_DEFAULTS = Object.freeze({ width: 30, depth: 30, resolution: 64, amplitude: 3, frequency: .1, octaves: 4, seed: 42, island: false });
const smooth = x => x*x*(3-2*x);
function hash(x,z,seed){let h=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x,z,seed){const i=Math.floor(x),j=Math.floor(z),a=smooth(x-i),b=smooth(z-j);return ((hash(i,j,seed)*(1-a)+hash(i+1,j,seed)*a)*(1-b)+(hash(i,j+1,seed)*(1-a)+hash(i+1,j+1,seed)*a)*b)*2-1;}
export function terrainHeight(x,z,options={}) {
  const c={...TERRAIN_DEFAULTS,...options};if(Math.abs(x)>c.width/2||Math.abs(z)>c.depth/2)return null;
  let value=0,weight=1,total=0,frequency=c.frequency;
  for(let i=0;i<c.octaves;i++){value+=noise((x+c.width/2)*frequency,(z+c.depth/2)*frequency,c.seed+i*31)*weight;total+=weight;weight*=.5;frequency*=2;}
  const edge=c.island?Math.max(0,1-Math.max(Math.abs(x)*2/c.width,Math.abs(z)*2/c.depth)**3):1;
  return (value/total*.5+.5)*c.amplitude*edge;
}
export function terrainData(options={}) {
  const c={...TERRAIN_DEFAULTS,...options},n=c.resolution,stride=n+1,positions=new Float32Array(stride**2*3),uv=new Float32Array(stride**2*2),indices=[];
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const k=z*stride+x,px=(x/n-.5)*c.width,pz=(z/n-.5)*c.depth;positions.set([px,terrainHeight(px,pz,c),pz],k*3);uv.set([x/n,z/n],k*2);if(x<n&&z<n){indices.push(k,k+stride,k+1,k+1,k+stride,k+stride+1);}}
  return {positions,uv,indices:new Uint32Array(indices)};
}
/** Sample the rendered triangle grid, rather than the underlying continuous noise. */
export function sampleTerrain(x,z,options={}){
  const c={...TERRAIN_DEFAULTS,...options};if(Math.abs(x)>c.width/2||Math.abs(z)>c.depth/2)return null;
  const gx=(x/c.width+.5)*c.resolution,gz=(z/c.depth+.5)*c.resolution,i=Math.min(c.resolution-1,Math.floor(gx)),j=Math.min(c.resolution-1,Math.floor(gz)),a=gx-i,b=gz-j;
  const at=(u,v)=>terrainHeight((u/c.resolution-.5)*c.width,(v/c.resolution-.5)*c.depth,c);
  return a+b<=1?at(i,j)*(1-a-b)+at(i+1,j)*a+at(i,j+1)*b:at(i+1,j+1)*(a+b-1)+at(i+1,j)*(1-b)+at(i,j+1)*(1-a);
}
