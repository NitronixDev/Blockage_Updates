const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class PlayerController {
  constructor(settings,position=[0,0,0],yaw=0){this.settings=settings;this.position=[...position];this.velocity=[0,0,0];this.yaw=yaw;this.grounded=false;this.state='idle';}
  step(dt,input={},groundAt=()=>null,colliders=[]){if(!Number.isFinite(dt)||dt<=0)return;const steps=Math.ceil(Math.min(dt,.1)*60);for(let n=0;n<steps;n++)this.integrate(Math.min(dt,.1)/steps,{...input,jump:n===0&&input.jump},groundAt,colliders);}
  integrate(dt,input,groundAt,colliders){
    const c=this.settings,p=this.position,v=this.velocity,length=Math.hypot(input.x||0,input.z||0),yaw=input.yaw||0,speed=input.run?c.runSpeed:c.speed,x=length?(input.x*Math.cos(yaw)+input.z*Math.sin(yaw))/Math.max(1,length):0,z=length?(-input.x*Math.sin(yaw)+input.z*Math.cos(yaw))/Math.max(1,length):0,alpha=1-Math.exp(-c.acceleration*dt),old=[...p];
    for(const [i,target] of [[0,x*speed],[2,z*speed]])v[i]+=(target-v[i])*alpha;
    if(Math.hypot(v[0],v[2])>.05){const target=Math.atan2(v[0],v[2]),difference=Math.atan2(Math.sin(target-this.yaw),Math.cos(target-this.yaw));this.yaw+=difference*(1-Math.exp(-c.turnSpeed*dt));}
    const floor=Math.max(c.floor,groundAt(p[0],p[2])??c.floor);if(p[1]<=floor+.03&&v[1]<=0){p[1]=floor;this.grounded=true;}if(input.jump&&this.grounded){v[1]=c.jumpSpeed;this.grounded=false;}v[1]-=c.gravity*dt;for(let i=0;i<3;i++)p[i]+=v[i]*dt;
    let ground=Math.max(c.floor,groundAt(p[0],p[2])??c.floor);
    for(const collider of colliders){
      if(collider.type==='sphere'){const center=collider.center,r=collider.radius,closestY=clamp(center[1],p[1]+c.radius,p[1]+c.height-c.radius),dx=p[0]-center[0],dy=closestY-center[1],dz=p[2]-center[2],dist=Math.hypot(dx,dy,dz),limit=c.radius+r;if(dist<limit){if(dy>0&&old[1]>=center[1]+r-.15){ground=Math.max(ground,center[1]+Math.sqrt(Math.max(0,r*r-dx*dx-dz*dz)));}else{const horizontal=Math.hypot(dx,dz),needed=Math.sqrt(Math.max(0,limit*limit-dy*dy));if(horizontal<needed){const a=horizontal>.0001?dx/horizontal:1,b=horizontal>.0001?dz/horizontal:0;p[0]=center[0]+a*needed;p[2]=center[2]+b*needed;}}}continue;}
      const a=collider.min,b=collider.max;if(p[0]<a[0]-c.radius||p[0]>b[0]+c.radius||p[2]<a[2]-c.radius||p[2]>b[2]+c.radius)continue;
      if(old[1]>=b[1]-.03&&p[1]<=b[1]&&v[1]<=0){ground=Math.max(ground,b[1]);continue;}if(old[1]+c.height<=a[1]+.01&&p[1]+c.height>=a[1]&&v[1]>0){p[1]=a[1]-c.height;v[1]=0;continue;}if(p[1]>=b[1]||p[1]+c.height<=a[1])continue;
      const qx=clamp(p[0],a[0],b[0]),qz=clamp(p[2],a[2],b[2]),dx=p[0]-qx,dz=p[2]-qz,d=Math.hypot(dx,dz);if(d>=c.radius)continue;if(d>.00001){p[0]=qx+dx/d*c.radius;p[2]=qz+dz/d*c.radius;}else{const choices=[[Math.abs(p[0]-a[0]+c.radius),0,a[0]-c.radius],[Math.abs(p[0]-b[0]-c.radius),0,b[0]+c.radius],[Math.abs(p[2]-a[2]+c.radius),2,a[2]-c.radius],[Math.abs(p[2]-b[2]-c.radius),2,b[2]+c.radius]].sort((a,b)=>a[0]-b[0]);p[choices[0][1]]=choices[0][2];}
    }
    if(p[1]<=ground&&v[1]<=0){p[1]=ground;v[1]=0;this.grounded=true;}else this.grounded=false;
    this.state=!this.grounded?'jump':Math.hypot(v[0],v[2])<.15?'idle':input.run?'run':'walk';
  }
}
