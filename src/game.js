import {Simulation,launch,DT,R,SPOT} from './physics.js';
import {Keeper} from './keeper.js';
import {Shootout} from './rules.js';
import {clubs,players,eligible} from './players.js';

export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const initialBall={x:0,y:R,z:SPOT};

export class Game {
  constructor(view,audio,changed){
    this.view=view;this.audio=audio;this.changed=changed;
    this.camera='Broadcast';
    this.keys=new Set();
  }
  start(config){
    this.config=structuredClone(config);
    this.mode=config.mode;
    this.scores=new Shootout();
    this.attempts=0;this.scored=0;this.taken=[[],[]];
    this.view.environment(config.light,config.venue);
    this.prepare();
  }
  prepare(){
    this.sim?.dispose();this.sim=null;
    this.phase='select';this.clock=0;this.accumulator=0;this.run=0;this.aiWait=0;
    this.input={x:1.52,y:1.37,power:72,cx:0,cy:0,spin:0,timing:.72,style:'Power',foot:'Right'};
    this.attack=this.isMatch?this.scores.turn:0;
    const a=this.attack,b=1-a;
    this.keeperPlayer=players[this.config.lineups[b][0]];
    this.aiShot=this.mode==='solo'&&a===1;
    this.keeper=new Keeper(this.keeperPlayer,this.config.difficulty,this.mode==='local'||this.aiShot);
    this.pose=this.keeper.pose(0);
    this.netImpact=null;this.substeps=0;this.frames=[];this.previousCollision=0;this.finish=null;this.outcome=null;
    this.shooter=null;
    this.showLineup();
    if(this.aiShot){
      this.selectTaker(this.availableTakers[0].id);
      return;
    }
    this.changed();
  }
  get availableTakers(){
    const side=this.attack;
    const squad=this.config.lineups[side];
    if(this.aiShot)return [players[squad[(this.taken[side].length+1)%6]]];
    const outfield=players.filter(p=>eligible(p,this.config.clubs[side],1)).sort((a,b)=>b.rating-a.rating);
    if(!this.isMatch)return outfield;
    const taken=this.taken[side];
    if(taken.length<5)return outfield.filter(p=>!taken.includes(p.id));
    if(taken.length===5)return [players[squad[0]]];
    const cycle=taken.slice(taken.length-taken.length%6);
    return taken.slice(0,6).filter(id=>!cycle.includes(id)).map(id=>players[id]);
  }
  showLineup(){
    const a=this.attack,b=1-a,teams=this.config.clubs;
    this.view.lineup(this.shooter,clubs[teams[a]],this.keeperPlayer,clubs[teams[b]],teams[a]===teams[b]&&a===1);
  }
  selectTaker(id){
    if(!['select','ready'].includes(this.phase)||!this.availableTakers.some(p=>p.id===id))return;
    this.shooter=players[id];
    this.input.foot=this.shooter.foot;
    this.input.style=this.shooter.technique;
    this.showLineup();
    this.phase='ready';
    this.changed();
  }
  get isMatch(){return this.mode==='local'||this.mode==='solo';}
  get active(){return this.phase==='flight'||this.phase==='settle';}
  get canAim(){return !this.aiShot&&this.phase==='ready';}
  press(){
    if(!this.canAim)return;
    this.audio.start();
    this.phase='run';this.clock=0;this.run=0;
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
    this.phase='run';this.run=0;this.clock=0;
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
    this.sim=new Simulation();
    this.sim.setKeeper(this.pose,true);
    this.sim.kick(launch(this.input,this.shooter));
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
    }
    if(result&&!this.outcome){
      this.outcome=result;this.finish=sim.elapsed+(result==='GOAL'?.62:.12);this.phase='settle';this.changed();
    }
    if(this.finish!==null&&sim.elapsed>=this.finish)this.complete();
  }
  complete(){
    const goal=this.outcome==='GOAL';
    if(this.isMatch){
      this.taken[this.attack].push(this.shooter.id);
      this.scores.record(goal);
    }else{
      this.attempts++;if(goal)this.scored++;
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
    this.clock+=dt;
    if(this.canAim){
      const x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
      const y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'));
      this.aim(this.input.x+x*3.7*dt,this.input.y+y*2.2*dt);
    }
    if(this.phase==='ready'&&this.aiShot){
      this.aiWait+=dt;
      if(this.aiWait>1.05)this.computer();
    }
    if(this.phase==='run'){
      const duration=this.shooter.runup==='Stutter'?1.38:this.shooter.runup==='Arc'?1.20:1.08;
      this.run=Math.min(1,this.clock/duration);
      if(this.run>=1)this.strike();
    }
    if(this.active){
      this.accumulator+=dt;
      while(this.accumulator>=DT&&this.active){this.tickStep();this.accumulator-=DT;}
    }
    if(this.phase==='replay'&&this.clock*24>=this.frames.length)this.stopReplay();
    const replay=this.phase==='replay';
    const frame=replay?this.frames[Math.min(this.frames.length-1,Math.floor(this.clock*24))]:
      {p:this.sim?.ball.translation()??initialBall,q:this.sim?.ball.rotation(),pose:this.pose,
        run:this.phase==='result'?1.1+this.clock:this.active?1+Math.min(.25,this.sim.elapsed):this.run,
        celebrate:this.phase==='result'&&this.outcome==='GOAL'?1:0,elapsed:this.sim?.elapsed||0,impact:this.sim?.collisions.at(-1),net:this.netImpact};
    const visual={foot:this.input.foot,aim:this.canAim?this.input:null,net:frame.net,
      crowd:this.phase==='result'?this.clock+.01:0,
      confetti:this.phase==='result'&&this.outcome==='GOAL'&&this.clock<7?this.clock+.01:0};
    this.view.draw(frame,replay?'Replay':this.camera,visual);
  }
}
