import RAPIER from '@dimforge/rapier3d-compat';

export const ready = RAPIER.init();
export const DT = 1 / 240;
export const R = .11;
export const MASS = .43;
export const HALF = 3.66;
export const BAR = 2.44;
export const SPOT = 11;
const frameRadius = .06;
export const defaults = { gravity: 9.81, drag: 1, friction: .55, bounce: .54 };
const length = v => Math.hypot(v.x, v.y, v.z);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const angle = (v,n) => Math.acos(Math.min(1,Math.abs(dot(v,n))/Math.max(.001,length(v))))*180/Math.PI;

export function wholeBall(previous, current) {
  if (previous.z < -R || current.z >= -R) return false;
  const t = (-R - previous.z)/(current.z - previous.z);
  const x = previous.x + t*(current.x-previous.x);
  const y = previous.y + t*(current.y-previous.y);
  return Math.abs(x)+R <= HALF && y+R <= BAR && y >= R-.005;
}

export function launch(input, player) {
  const styles = { Power:[1.12,1,1], Finesse:[.91,1,1.22], Panenka:[.59,1.27,.55], Driven:[1.06,.4,.7], Curve:[.96,1,1.55], Knuckle:[1.06,1,.03] };
  const [pace,lift,curve] = styles[input.style] || styles.Power;
  const technique = player.technique === input.style ? 1.045 : 1;
  const wrongFoot = input.foot && input.foot !== player.foot ? .70 + player.weakFoot*.003 : 1;
  const speed = (9 + input.power * (.17 + player.power*.0013))*pace*technique*wrongFoot;
  const error = (input.timing-.72) * (.016 + (100-player.accuracy)*.0012 + (100-player.composure)*.0008)/wrongFoot;
  const targetX = input.x;
  const targetY = Math.max(.18,input.y);
  const time = SPOT/speed;
  const pitch = Math.atan2((targetY-R)*lift + 4.905*time*time, SPOT) + input.cy*.033 + error;
  const yaw = Math.atan2(targetX,SPOT) + input.cx*.029 + error*(input.foot === 'Left' ? -1 : 1);
  return {
    velocity:{x:speed*Math.sin(yaw)*Math.cos(pitch),y:speed*Math.sin(pitch),z:-speed*Math.cos(yaw)*Math.cos(pitch)},
    spin:{x:(input.cy*20 + (input.style==='Panenka' ? 13 : 0))*curve,y:(input.spin*28 + input.cx*12)*curve*player.curve/85,z:input.cx*4*curve},
    pitch:pitch*180/Math.PI, knuckle:input.style==='Knuckle'
  };
}

export class Simulation {
  constructor(settings = defaults) {
    const s = this.settings = {...defaults,...settings};
    this.world = new RAPIER.World({x:0,y:-s.gravity,z:0});
    this.world.timestep = DT;
    this.world.maxCcdSubsteps = 4;
    this.events = new RAPIER.EventQueue(true);
    this.tags = new Map();
    this.keepers = [];
    this.fixed(RAPIER.ColliderDesc.cuboid(35,.15,38),0,-.15,0,'ground',s.bounce,s.friction);
    for (const sign of [-1,1]) {
      this.fixed(RAPIER.ColliderDesc.cylinder(BAR/2,frameRadius),sign*(HALF+frameRadius),BAR/2,0,'frame',.74);
      this.fixed(RAPIER.ColliderDesc.cuboid(.025,1.25,1.05),sign*(HALF+.09),1.25,-1.07,'net',.17);
    }
    const crossbar = RAPIER.ColliderDesc.cylinder(HALF+frameRadius,frameRadius).setRotation({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2});
    this.fixed(crossbar,0,BAR+frameRadius,0,'frame',.74);
    this.fixed(RAPIER.ColliderDesc.cuboid(3.77,1.3,.025),0,1.3,-2.17,'net',.16);
    this.fixed(RAPIER.ColliderDesc.cuboid(3.77,.025,1.08),0,2.62,-1.09,'net',.16);
    for (const [radius,half] of [[.24,.31],[.13,.24],[.13,.24],[.12,0],[.12,0],[.135,0],[.11,.22],[.11,.22]]) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,-8,0));
      this.add(half ? RAPIER.ColliderDesc.capsule(half,radius) : RAPIER.ColliderDesc.ball(radius),body,'keeper',.44,.42);
      this.keepers.push(body);
    }
    this.ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,R+.001,SPOT).setCcdEnabled(true).setAngularDamping(.095));
    this.ballCollider = this.add(RAPIER.ColliderDesc.ball(R).setMass(MASS),this.ball,'ball',.55,s.friction);
    this.elapsed = 0;
    this.collisions = [];
    this.drag = this.magnus = 0;
    this.forces = {drag:{x:0,y:0,z:0},magnus:{x:0,y:0,z:0}};
  }
  add(desc,body,tag,bounce,friction) {
    desc.setRestitution(bounce).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setFriction(friction).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(desc,body);
    this.tags.set(collider.handle,tag);
    return collider;
  }
  fixed(desc,x,y,z,tag,bounce,friction=.36) {
    return this.add(desc.setTranslation(x,y,z),undefined,tag,bounce,friction);
  }
  setKeeper(parts, snap = false) {
    parts.forEach((part,index) => {
      const body = this.keepers[index];
      const rotation = {x:0,y:0,z:Math.sin(part.angle/2),w:Math.cos(part.angle/2)};
      if (snap) {
        body.setTranslation(part,true);
        body.setRotation(rotation,true);
      }
      body.setNextKinematicTranslation(part);
      body.setNextKinematicRotation(rotation);
    });
  }
  kick(shot) {
    this.shot = shot;
    this.ball.applyImpulse({x:MASS*shot.velocity.x,y:MASS*shot.velocity.y,z:MASS*shot.velocity.z},true);
    this.ball.setAngvel(shot.spin,true);
  }
  step() {
    const p = this.ball.translation(), v = this.ball.linvel(), w = this.ball.angvel();
    const speed = length(v), area = Math.PI*R*R;
    const drag = -.5*1.225*.25*area*speed*this.settings.drag;
    const lift = .5*1.225*area*R*.95*this.settings.drag;
    const air = {x:drag*v.x,y:drag*v.y,z:drag*v.z};
    const magnus = {x:lift*(w.y*v.z-w.z*v.y),y:lift*(w.z*v.x-w.x*v.z),z:lift*(w.x*v.y-w.y*v.x)};
    this.forces = {drag:air,magnus};
    this.drag = length(air);
    this.magnus = length(magnus);
    const rolling = p.y < R+.013 && Math.abs(v.y)<.28 ? .014*this.settings.friction*MASS*this.settings.gravity/Math.max(.28,speed) : 0;
    const wake = this.shot?.knuckle ? this.settings.drag*speed*speed*.00045 : 0;
    this.ball.resetForces(false);
    this.ball.addForce({x:air.x+magnus.x-rolling*v.x+wake*Math.sin(29*this.elapsed),y:air.y+magnus.y+wake*Math.cos(21*this.elapsed),z:air.z+magnus.z-rolling*v.z},true);
    this.world.step(this.events);
    this.elapsed += DT;
    const next = this.ball.translation(), out = this.ball.linvel();
    this.events.drainCollisionEvents((a,b,started) => {
      if (!started || (a!==this.ballCollider.handle && b!==this.ballCollider.handle)) return;
      const other = a===this.ballCollider.handle ? b : a;
      let normal = {x:0,y:1,z:0};
      this.world.contactPair(this.ballCollider,this.world.getCollider(other),manifold => {normal=manifold.normal();});
      const afterSpin = this.ball.angvel();
      const loss = .5*MASS*(speed**2-length(out)**2) + .2*MASS*R**2*(length(w)**2-length(afterSpin)**2);
      this.collisions.push({type:this.tags.get(other),p:next,normal,impact:angle(v,normal),rebound:angle(out,normal),loss:Math.max(0,loss),time:this.elapsed});
    });
    if (!this.goal && wholeBall(p,next)) this.goal = true;
    if (!this.result) {
      if (this.goal) this.result = 'GOAL';
      else if ((this.elapsed>.55 && speed<.48) || this.elapsed>8 || Math.abs(next.x)>20 || next.z<-4 || next.z>SPOT+4 || next.y>18)
        this.result = this.collisions.some(c=>c.type==='keeper') ? 'SAVED' : 'MISS';
    }
    return this.result;
  }
  dispose() {
    this.events.free();
    this.world.free();
  }
}
