import { sampleAnimation } from './animation.js';
/** Deterministic, fixed-step behavior runtime. All edits remain in the scene document; Play changes only live objects. */
export class Simulation {
  constructor() { this.running = false; this.paused = false; this.time = 0; this.accumulator = 0; this.states = new Map(); this.stepSize = 1 / 60; }
  start(entities, objects, context = {}) {
    this.time = 0; this.accumulator = 0; this.running = true; this.paused = false; this.states.clear();
    this.context = context;
    for (const e of entities) {
      const o = objects.get(e.id);
      if (!o) continue;
      const solver=o.userData?.solver;solver?.reset();o.userData?.updateSimulation?.();
      this.states.set(e.id, { position: o.position.clone(), rotation: o.rotation.clone(), scale: o.scale?.clone(), visible: o.visible, velocity: 0, springVelocity: [e.behaviors.spring?.x||0,e.behaviors.spring?.y||0,e.behaviors.spring?.z||0], entity: e, object: o, solver });
    }
    this.rigidWorld=this.context.createRigidWorld?.();
  }
  stop() {
    for (const s of this.states.values()) { s.object.position.copy(s.position); s.object.rotation.copy(s.rotation);s.object.visible=s.visible; if(s.scale)s.object.scale.copy(s.scale);s.solver?.reset();s.object.userData?.updateSimulation?.(); }
    this.states.clear(); this.running = false; this.paused = false; this.time = 0;
    this.rigidWorld=null;
  }
  update(delta) {
    if (!this.running || this.paused) return;
    this.accumulator += Math.min(Math.max(delta, 0), 0.1);
    while (this.accumulator >= this.stepSize) { this.step(this.stepSize); this.accumulator -= this.stepSize; }
    this.refresh();
  }
  step(dt = this.stepSize) {
    if (!this.running) return;
    this.time += dt;
    for (const s of this.states.values()) {
      const b = s.entity.behaviors, o = s.object;
      const timeline=this.context.timeline||{duration:8,loop:true},pose=sampleAnimation(s.entity.animation,this.time,timeline.duration,timeline.loop);
      if(pose){o.position.fromArray(pose.position);o.rotation.set(...pose.rotation.map(v=>v*Math.PI/180));o.scale?.fromArray(pose.scale);continue;}
      if (b.spin) { const axis=(b.spin.axis||'Y').toLowerCase();o.rotation[axis] = s.rotation[axis] + this.time * b.spin.speed * Math.PI / 180; }
      if(b.velocity){o.position.x=s.position.x+this.time*b.velocity.x;o.position.y=s.position.y+this.time*b.velocity.y;o.position.z=s.position.z+this.time*b.velocity.z;}
      if (b.float) o.position.y = s.position.y + Math.sin(this.time * b.float.speed * 2) * b.float.amplitude;
      if (b.orbit) { o.position.x = s.position.x + (Math.cos(this.time * b.orbit.speed) - 1) * b.orbit.radius; o.position.z = s.position.z + Math.sin(this.time * b.orbit.speed) * b.orbit.radius; }
      if(b.oscillate){const axis=b.oscillate.axis.toLowerCase();o.position[axis]=s.position[axis]+Math.sin(this.time*b.oscillate.speed*Math.PI*2)*b.oscillate.amplitude;}
      if(b.pulse&&s.scale)o.scale.copy(s.scale).multiplyScalar(1+Math.sin(this.time*b.pulse.speed*Math.PI*2)*b.pulse.amplitude);
      if(b.spring){for(let k=0;k<3;k++){const axis='xyz'[k],acc=-b.spring.stiffness*(o.position[axis]-s.position[axis])-b.spring.damping*s.springVelocity[k];s.springVelocity[k]+=acc*dt;o.position[axis]+=s.springVelocity[k]*dt;}}
      if(b.path){const travel=this.time*b.path.speed,length=b.path.distance,v=b.path.pingPong?length-Math.abs(travel%(2*length)-length):travel%length;o.position[b.path.axis.toLowerCase()]=s.position[b.path.axis.toLowerCase()]+v;}
      if(b.follow?.target){const target=this.states.get(b.follow.target)?.object;if(target){const goal=this.context.targetLocal?.(target,o)||target.position,rate=1-Math.exp(-b.follow.speed*dt);for(let k=0;k<3;k++){const axis='xyz'[k];o.position[axis]+=(goal[axis]+b.follow[axis]-o.position[axis])*rate;}}}
      if(b.lookAt?.target){const target=this.states.get(b.lookAt.target)?.object;if(target)this.context.lookAt?.(o,target);}
      if (b.rigidbody && !this.rigidWorld) {
        s.velocity -= 9.81 * dt;
        o.position.y += s.velocity * dt;
        // Prototype collision: a horizontal plane in the entity parent's local space; not mesh/mesh physics.
        const floor = b.rigidbody.floor + s.entity.transform.scale[1] / 2;
        if (o.position.y < floor) { o.position.y = floor; s.velocity = -s.velocity * b.rigidbody.restitution; if (Math.abs(s.velocity) < 0.05) s.velocity = 0; }
      }
    }
    if(this.rigidWorld){this.context.updateRigidStatics?.(this.rigidWorld,dt);this.rigidWorld.step(dt,this.context.groundAt,this.context.waterAt);this.context.applyRigidWorld?.(this.rigidWorld);}
    this.context.interactions?.(dt);
    if([...this.states.values()].some(s=>s.solver)){
      this.context.updateColliders?.();
      for(const s of this.states.values())if(s.solver)s.solver.step(dt,this.context.colliders?.(s.entity,s.object)||[]);
    }
    this.context.afterStep?.(this.time);
  }
  refresh(){for(const s of this.states.values())if(s.solver)s.object.userData.updateSimulation?.();}
}
