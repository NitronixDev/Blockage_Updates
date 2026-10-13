import * as THREE from 'three/webgpu';
import { WaterSolver } from './water.js';
import { terrainData } from './terrain.js';

export const PROCEDURAL_KINDS=['water','terrain','camera','audio','trigger'];
export function configureProceduralObject(object,e){
  const config=e.kind==='water'?e.simulation:e.kind==='terrain'?e.terrain:e.kind==='camera'?e.cameraSettings:e.kind==='trigger'?e.trigger:{};
  const signature=JSON.stringify(config);if(object.userData.proceduralSignature===signature)return;
  object.traverse(o=>{o.geometry?.dispose();for(const m of [o.material,o.userData.originalMaterial])if(m)m.dispose();});object.clear();
  object.userData.proceduralSignature=signature;
  if(['water','terrain'].includes(e.kind)){
    const geometry=new THREE.BufferGeometry(),material=new THREE.MeshPhysicalMaterial({color:e.material.color,metalness:e.material.metalness,roughness:e.material.roughness,clearcoat:e.kind==='water'?1:0,clearcoatRoughness:.12,side:THREE.DoubleSide});
    if(e.kind==='water'){
      const solver=new WaterSolver(e.simulation),n=e.simulation.resolution,indices=[],uv=new Float32Array(solver.count*2);object.userData.solver=solver;
      for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const i=z*(n+1)+x;uv.set([x/n,z/n],i*2);if(x<n&&z<n)indices.push(i,i+n+1,i+1,i+1,i+n+1,i+n+2);}
      geometry.setAttribute('position',new THREE.BufferAttribute(solver.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
      object.userData.updateSimulation=()=>{solver.updatePositions();geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();};object.userData.updateSimulation();
    }else{const data=terrainData(e.terrain);geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));geometry.setIndex(new THREE.BufferAttribute(data.indices,1));geometry.computeVertexNormals();}
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.entityId=e.id;object.add(mesh);
  }else{
    let geometry;
    if(e.kind==='camera'){geometry=new THREE.BoxGeometry(.65,.45,.7);geometry.translate(0,0,.2);}
    else if(e.kind==='audio')geometry=new THREE.OctahedronGeometry(.25);
    else geometry=new THREE.BoxGeometry(config.width,config.height,config.depth);
    const guide=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:e.kind==='trigger'?'#8b9b71':'#a3a3a3'}));geometry.dispose();guide.userData.entityId=e.id;guide.userData.editorOnly=true;object.userData.guide=guide;object.add(guide);
  }
}
