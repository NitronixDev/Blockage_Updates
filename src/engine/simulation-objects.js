import * as THREE from 'three/webgpu';
import { ClothSolver, FluidSolver, ParticleSolver } from './physics.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

export function configureSimulationObject(object, entity) {
  const signature=JSON.stringify(entity.simulation);
  if(object.userData.solverSignature===signature)return;
  const resources=new Set();object.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material,o.userData.originalMaterial])if(m)resources.add(m);});for(const resource of resources)resource.dispose();object.clear();
  const material=new THREE.MeshStandardMaterial({color:entity.material.color,side:entity.kind==='cloth'?THREE.DoubleSide:THREE.FrontSide});
  let mesh,solver,update;
  if(entity.kind==='cloth'){
    solver=new ClothSolver(entity.simulation);const geometry=new THREE.BufferGeometry(),n=entity.simulation.segments;
    geometry.setAttribute('position',new THREE.BufferAttribute(solver.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(new THREE.BufferAttribute(solver.indices,1));
    const uv=new Float32Array(solver.count*2);for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){const id=y*(n+1)+x;uv[id*2]=x/n;uv[id*2+1]=1-y/n;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeVertexNormals();mesh=new THREE.Mesh(geometry,material);
    update=()=>{geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();};
  }else{
    solver=entity.kind==='fluid'?new FluidSolver(entity.simulation):new ParticleSolver(entity.simulation);
    if(entity.kind==='fluid'&&entity.simulation.display==='surface'){
      const c=entity.simulation,size=Math.max(c.width,c.height,c.depth)*1.15,mesher=new MarchingCubes(26,material,false,false,12000);
      // MarchingCubes.count is a vertex counter; Renderer treats Mesh.count as an instance count. Render a plain Mesh around the generated geometry.
      mesh=new THREE.Mesh(mesher.geometry,material);mesh.position.y=c.height/2;mesh.scale.setScalar(size/2);mesher.isolation=80;
      update=()=>{mesher.reset();const subtract=12,strength=(mesher.isolation+subtract)*(c.radius*1.3/size)**2;for(let i=0;i<solver.positions.length;i+=3)mesher.addBall(solver.positions[i]/size+.5,(solver.positions[i+1]-c.height/2)/size+.5,solver.positions[i+2]/size+.5,strength,subtract);mesher.update();};
    }else{
      mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),material,solver.count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);const dummy=new THREE.Object3D();
      update=()=>{for(let i=0;i<solver.count;i++){dummy.position.fromArray(solver.positions,i*3);const size=entity.kind==='fluid'?entity.simulation.radius:solver.ages[i]<0?0:entity.simulation.size*(1-.65*solver.ages[i]/entity.simulation.lifetime);dummy.scale.setScalar(size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();};
    }
    let guide;
    if(entity.kind==='fluid'){const c=entity.simulation,geometry=new THREE.BoxGeometry(c.width,c.height,c.depth);geometry.translate(0,c.height/2,0);guide=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#767676'}));geometry.dispose();}
    else{const geometry=new THREE.ConeGeometry(.25,.6,8);geometry.translate(0,.3,0);guide=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#767676'}));geometry.dispose();}
    guide.userData.entityId=entity.id;guide.userData.editorOnly=true;object.add(guide);object.userData.guide=guide;
  }
  mesh.userData.entityId=entity.id;mesh.castShadow=entity.castShadow;mesh.receiveShadow=entity.receiveShadow;object.add(mesh);
  object.userData.solver=solver;object.userData.solverSignature=signature;object.userData.updateSimulation=update;update();
}
