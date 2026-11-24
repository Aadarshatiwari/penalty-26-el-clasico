import {Simulation,launch,defaults,DT,R,SPOT} from './physics.js';
import {Keeper} from './keeper.js';
import {Shootout} from './rules.js';
import {clubs,players} from './players.js';

export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const challenges=[
  {name:'Koeman · Power',player:'Ronald Koeman',club:'barca',style:'Power',minSpeed:30},
  {name:'Zidane · Panenka',player:'Zinedine Zidane',club:'madrid',style:'Panenka',minSpeed:0},
  {name:'Messi · Curve',player:'Lionel Messi',club:'barca',style:'Curve',minSpeed:0}
];
const initialBall={x:0,y:R,z:SPOT};

export class Game {
  constructor(view,audio,changed){
    this.view=view;this.audio=audio;this.changed=changed;
    this.parameters={...defaults};this.camera='Broadcast';
    this.labOpen=false;this.slow=false;this.forces=true;this.compare=true;
    this.keys=new Set();
  }
  start(config){
    this.config=structuredClone(config);
    this.mode=config.mode;
    this.challenge=this.mode==='legend'?challenges[config.challenge]:null;
    this.scores=new Shootout();
    this.attempts=0;this.scored=0;this.challengeWins=0;
    this.labOpen=this.mode==='lab';
    this.view.environment(config.light,config.venue);
    this.prepare();
  }
  prepare(){
    this.sim?.dispose();this.sim=null;
    this.phase='ready';this.clock=0;this.accumulator=0;this.run=0;this.motion=0;this.aiWait=0;this.input={x:1.52,y:1.37,power:72,cx:0,cy:0,spin:0,timing:.72,style:'Power',foot:'Right'};
    this.attack=this.isMatch?this.scores.turn:0;
    const a=this.attack, b=1-a;
    const cfg=this.config;
    const slot=this.isMatch?(this.scores.kicks[a].length+1)%6:1+this.attempts%5;
    this.shooter=this.challenge?players.find(p=>p.name===this.challenge.player):players[cfg.lineups[a][slot]];
    this.keeperPlayer=players[cfg.lineups[b][0]];
    this.aiShot=this.mode==='solo'&&a===1;
    this.keeper=new Keeper(this.keeperPlayer,cfg.difficulty,this.mode==='local'||this.aiShot);
    this.pose=this.keeper.pose(0);
    this.input.style=this.challenge?.style||this.shooter.technique;
    this.input.foot=this.shooter.foot;
    const shooterClub=this.challenge?.club||cfg.clubs[a];
    this.view.lineup(this.shooter,clubs[shooterClub],this.keeperPlayer,clubs[cfg.clubs[b]],cfg.clubs[a]===cfg.clubs[b]&&a===1);
    this.netImpact=null;this.substeps=0;this.frames=[];this.path=[];this.theory=[];this.pathDirty=true;this.previousCollision=0;this.finish=null;this.outcome=null;
    this.changed();
  }
  get isMatch(){return this.mode==='local'||this.mode==='solo';}
  get active(){return this.phase==='flight'||this.phase==='settle';}
  get canAim(){return !this.aiShot && ['ready','charge'].includes(this.phase);}
  press(){
    if(this.aiShot)return;
    if(this.phase==='ready'){
      this.audio.start();this.phase='charge';this.clock=0;this.changed();
    }else if(this.phase==='run'&&!this.timed){
      this.timed=true;this.input.timing=clamp(this.run,0,1);
    }
  }
  release(){
    if(this.phase!=='charge')return;
    this.phase='run';this.clock=0;this.run=0;this.timed=false;
    this.audio.play('whistle');
    this.audio.announce(`${this.shooter.name} steps up.`);
    this.changed();
  }
  computer(){
    const d={Rookie:0,Pro:1,Legend:2}[this.config.difficulty];
    const random=Math.random;
    const sign=random()<.5?-1:1;
    Object.assign(this.input,{x:sign*(1.35+random()*(1.6+d*.18)),y:.34+random()*1.83,power:60+random()*31,
      cx:(random()-.5)*.58,cy:(random()-.5)*.38,spin:(random()-.5)*.66,timing:.67+random()*.13});
    this.phase='run';this.run=0;this.clock=0;this.timed=true;
    this.audio.play('whistle');
    this.audio.announce(`${this.shooter.name} waits for the whistle.`);
    this.changed();
  }
  aim(x,y){
    if(!this.canAim)return;
    this.input.x=clamp(x,-4.65,4.65);
    this.input.y=clamp(y,.14,3.4);
  }
  defend(direction,high=false){
    if(!this.keeper.human||this.phase!=='flight')return;
    this.keeper.command(direction,high,this.sim.elapsed);
  }
  strike(){
    if(!this.timed)this.input.timing=.45;
    this.sim=new Simulation(this.mode==='lab'?this.parameters:defaults);
    this.sim.setKeeper(this.pose,true);
    const shot=launch(this.input,this.shooter);
    this.sim.kick(shot);
    for(let i=0;i<=100;i++){
      const t=i*.016;
      this.theory.push({x:shot.velocity.x*t,y:R+shot.velocity.y*t-.5*this.sim.settings.gravity*t*t,z:SPOT+shot.velocity.z*t});
      if(this.theory.at(-1).y<0||this.theory.at(-1).z<-3)break;
    }
    this.phase='flight';this.clock=0;
    this.audio.play('kick');this.changed();
  }
  tickStep(){
    const sim=this.sim;
    const move=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
    this.pose=this.keeper.update(sim.elapsed,DT,sim.ball.translation(),sim.ball.linvel(),move);
    sim.setKeeper(this.pose);
    const result=sim.step();
    while(this.previousCollision<sim.collisions.length){
      const hit=sim.collisions[this.previousCollision++];
      if(hit.type==='net')this.netImpact=hit;
      if(hit.type!=='ground'||hit.loss>.28)this.audio.play(hit.type);
    }
    this.substeps=(this.substeps??0)+1;
    if(this.substeps%4===0){
      const p=sim.ball.translation();
      this.frames.push({p,q:sim.ball.rotation(),pose:this.pose,run:1+Math.min(.25,sim.elapsed),elapsed:sim.elapsed,impact:sim.collisions.at(-1),net:this.netImpact});
      this.path.push(p);this.pathDirty=true;
    }
    if(result&&!this.outcome){
      this.outcome=result;this.finish=sim.elapsed+(result==='GOAL'?.62:.12);this.phase='settle';this.changed();
    }
    if(this.finish!==null&&sim.elapsed>=this.finish)this.complete();
  }
  complete(){
    const goal=this.outcome==='GOAL';
    if(this.isMatch)this.scores.record(goal);
    else{
      this.attempts++;if(goal)this.scored++;
      this.challengeSuccess=Boolean(this.challenge&&goal&&this.input.style===this.challenge.style&&Math.hypot(...Object.values(this.sim.shot.velocity))>=this.challenge.minSpeed);
      if(this.challengeSuccess)this.challengeWins++;
    }
    this.phase='result';this.clock=0;
    this.audio.play(goal?'goal':'miss');
    this.audio.reaction(this.outcome);
    const line=goal?'It is in. The pressure was on.':this.outcome==='SAVED'?'The keeper gets there.':'The kick stays out.';
    this.audio.announce(line);
    this.changed();
  }
  replay(){
    if(this.phase!=='result'||!this.frames.length)return;
    this.phase='replay';this.clock=0;this.changed();
  }
  stopReplay(){
    this.phase='result';this.clock=.3;this.changed();
  }
  next(){
    if(this.phase!=='result')return;
    this.netImpact=null;
    if(this.scores.winner!==null)this.start(this.config);
    else this.prepare();
  }
  update(dt){
    this.clock+=dt;this.motion+=dt;
    if(this.canAim){
      const x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
      const y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'));
      this.aim(this.input.x+x*3.7*dt,this.input.y+y*2.2*dt);
    }
    if(this.phase==='ready'&&this.aiShot){
      this.aiWait+=dt;
      if(this.aiWait>1.05)this.computer();
    }
    if(this.phase==='charge')this.input.power=clamp(32+this.clock*65,32,100);
    if(this.phase==='run'){
      const duration=this.shooter.runup==='Stutter'?1.38:this.shooter.runup==='Arc'?1.20:1.08;
      this.run=Math.min(1,this.clock/duration);
      if(this.run>=1)this.strike();
    }
    if(this.active){
      this.accumulator+=dt*(this.labOpen&&this.slow?.25:1);
      while(this.accumulator>=DT&&this.active){this.tickStep();this.accumulator-=DT;}
    }
    if(this.phase==='replay'&&this.clock*24>=this.frames.length)this.stopReplay();
    const replay=this.phase==='replay';
    const frame=replay?this.frames[Math.min(this.frames.length-1,Math.floor(this.clock*24))]:
      {p:this.sim?.ball.translation()??initialBall,q:this.sim?.ball.rotation(),pose:this.pose,
        run:this.phase==='result'?1.1+this.clock:this.active?1+Math.min(.25,this.sim.elapsed):this.run,
        celebrate:this.phase==='result'&&this.outcome==='GOAL'?1:0,elapsed:this.sim?.elapsed||0,impact:this.sim?.collisions.at(-1),net:this.netImpact};
    const visual={aim:this.canAim?this.input:null,lab:this.labOpen,compare:this.labOpen&&this.compare,net:frame.net,
      crowd:this.phase==='result'?this.clock+.01:0,
      confetti:this.phase==='result'&&this.outcome==='GOAL'&&this.clock<7?this.clock+.01:0};
    if(this.pathDirty&&this.labOpen){visual.paths=[this.path,this.theory];this.pathDirty=false;}
    if(this.labOpen&&this.forces&&this.sim&&!replay)visual.forces=[this.sim.forces.drag,this.sim.forces.magnus,{x:0,y:-.43*this.sim.settings.gravity,z:0}];
    this.view.draw(frame,replay?'Replay':this.camera,visual);
  }
}
