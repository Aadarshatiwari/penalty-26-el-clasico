import {Simulation,launch,DT,R,SPOT} from './physics.js';
import {Keeper} from './keeper.js';
import {Shootout} from './rules.js';
import {clubs,players,eligible} from './players.js';

export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const initialBall={x:0,y:R,z:SPOT};
const draw=pool=>pool[Math.floor(Math.random()*pool.length)];

export class Game {
  constructor(view,audio,changed){
    this.view=view;this.audio=audio;this.changed=changed;
    this.keys=new Set();
  }
  start(config){
    this.config=structuredClone(config);
    this.online=config.mode==='online';
    this.mode=config.mode;
    this.scores=new Shootout();
    this.matchId=(this.matchId??0)+1;this.kickSerial=0;
    this.attempts=0;this.scored=0;this.taken=[[],[]];
    this.keepers=config.clubs.map(club=>draw(players.filter(p=>eligible(p,club,0))
      .sort((a,b)=>b.rating-a.rating).slice(0,3)));
    this.view.environment(config.light,config.venue);
    this.prepare();
  }
  setNetwork(side,send){
    this.onlineSide=side;this.send=send;
    this.keys.clear();
    this.remoteMove=0;this.remoteMoveAge=0;this.networkAge=0;
  }
  get guest(){return this.online&&this.onlineSide===1;}
  get canDefend(){
    if(this.online) return this.attack!==this.onlineSide&&['ready','run','flight'].includes(this.phase);
    return this.keeper.human&&(this.aiShot||this.active);
  }
  get kickId(){return this.matchId+':'+this.kickSerial;}
  prepare(){
    this.kickSerial++;
    this.sim?.dispose();this.sim=null;
    this.phase='ready';this.queuedDive=null;this.remoteMove=0;this.remoteMoveAge=0;this.clock=0;this.accumulator=0;this.run=0;this.aiWait=0;
    this.attack=this.isMatch?this.scores.turn:0;
    const a=this.attack,b=1-a;
    this.keeperPlayer=this.keepers[b];
    this.aiShot=this.mode==='solo'&&a===1;
    this.keeper=new Keeper(this.keeperPlayer,this.config.difficulty,this.mode==='local'||this.online||this.aiShot);
    this.pose=this.keeper.pose(0);
    this.netImpact=null;this.substeps=0;this.frames=[];this.previousCollision=0;this.finish=null;this.outcome=null;
    this.shooter=draw(this.availableTakers);
    this.input={x:1.52,y:1.37,power:72,cx:0,cy:0,spin:0,timing:.72,style:this.shooter.technique,foot:this.shooter.foot};
    const teams=this.config.clubs;
    this.view.lineup(this.shooter,clubs[teams[a]],this.keeperPlayer,clubs[teams[b]],teams[a]===teams[b]&&a===1);
    this.changed();
    this.broadcast();
  }
  get availableTakers(){
    const side=this.attack;
    const outfield=players.filter(p=>p.rating>=90&&eligible(p,this.config.clubs[side],1));
    if(!this.isMatch)return outfield;
    const taken=this.taken[side];
    if(taken.length<5)return outfield.filter(p=>!taken.includes(p.id));
    if(taken.length===5)return [this.keepers[side]];
    const cycle=taken.slice(taken.length-taken.length%6);
    return taken.slice(0,6).filter(id=>!cycle.includes(id)).map(id=>players[id]);
  }
  get isMatch(){return this.mode==='local'||this.mode==='solo'||this.online;}
  get active(){return this.phase==='flight'||this.phase==='settle';}
  get canAim(){return !this.aiShot&&this.phase==='ready'&&(!this.online||this.attack===this.onlineSide);}
  press(){
    if(!this.canAim)return;
    this.audio.start();
    if(this.guest){
      this.sendCommand('shoot',{x:this.input.x,y:this.input.y});
      return;
    }
    this.beginRun();
  }
  beginRun(){
    this.phase='run';this.clock=0;this.run=0;
    this.audio.play('whistle');
    this.audio.announce(`${this.shooter.name} steps up.`);
    this.changed();
    this.broadcast();
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
    this.broadcast();
  }
  aim(x,y){
    if(!this.canAim)return;
    this.input.x=clamp(x,-4.65,4.65);
    this.input.y=clamp(y,.14,3.4);
  }
  defend(direction,high=false){
    if(!this.canDefend)return;
    if(this.guest){this.sendCommand('dive',{direction,high});return;}
    this.applyDive(direction,high);
  }
  applyDive(direction,high){
    if(this.phase==='flight'){
      this.keeper.command(direction,high,this.sim.elapsed);
    }else if(this.online&&this.phase==='run'&&!this.queuedDive){
      this.queuedDive={direction,high};
    }
  }
  get movement(){
    return Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
  }
  get keeperMove(){
    if(!this.online)return this.movement;
    if(this.attack!==this.onlineSide)return this.movement;
    return this.remoteMoveAge<.6?this.remoteMove:0;
  }
  strike(){
    this.sim=new Simulation();
    this.sim.setKeeper(this.pose,true);
    this.sim.kick(launch(this.input,this.shooter));
    this.phase='flight';this.clock=0;
    if(this.queuedDive)this.applyDive(this.queuedDive.direction,this.queuedDive.high);
    this.audio.play('kick');this.changed();
  }
  tickStep(){
    const sim=this.sim;
    const move=this.keeperMove;
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
    this.audio.reaction(this.outcome);
    if(this.outcome==='MISS')this.audio.announce('The kick stays out.');
    this.changed();
    this.broadcast();
  }
  replay(){
    if(this.phase!=='result')return;
    if(this.guest){this.sendCommand('replay');return;}
    if(!this.frames.length)return;
    this.phase='replay';this.clock=0;this.changed();
  }
  stopReplay(){
    if(this.guest){this.sendCommand('stopReplay');return;}
    this.phase='result';this.clock=.3;this.changed();
  }
  next(){
    if(this.phase!=='result')return;
    if(this.guest){this.sendCommand('next');return;}
    this.netImpact=null;
    if(this.scores.winner!==null)this.start(this.config);
    else this.prepare();
  }
  sendCommand(action,data={}){
    this.send?.({type:'command',action,kickId:this.kickId,...data});
  }
  receiveCommand(message){
    if(!this.online||this.guest||message.kickId!==this.kickId)return;
    const {action,x,y,direction,high}=message;
    if(action==='shoot'&&this.attack===1&&this.phase==='ready'&&Number.isFinite(x)&&Number.isFinite(y)){
      this.input.x=clamp(x,-4.65,4.65);this.input.y=clamp(y,.14,3.4);this.beginRun();
    }else if(this.attack===0&&['ready','run','flight'].includes(this.phase)){
      if(action==='dive'&&[-1,0,1].includes(direction))this.applyDive(direction,high===true);
      if(action==='move'&&[-1,0,1].includes(direction)){this.remoteMove=direction;this.remoteMoveAge=0;}
    }
    if(action==='next'&&this.phase==='result')this.next();
    if(action==='replay'&&this.phase==='result')this.replay();
    if(action==='stopReplay'&&this.phase==='replay')this.stopReplay();
  }
  broadcast(){
    if(!this.online||this.guest||!this.send)return;
    this.send({type:'state',config:this.config,matchId:this.matchId,kickSerial:this.kickSerial,kicks:this.scores.kicks,turn:this.scores.turn,
      winner:this.scores.winner,attack:this.attack,phase:this.phase,outcome:this.outcome,
      shooter:this.shooter.id,keeper:this.keeperPlayer.id,clock:this.clock,frame:this.currentFrame()});
  }
  receiveState(state){
    if(this.onlineSide!==1||state.config?.mode!=='online'||!Array.isArray(state.config.clubs)||
      state.config.clubs.length!==2||!state.config.clubs.every(club=>Object.hasOwn(clubs,club))||
      !players[state.shooter]||!players[state.keeper]||!state.frame?.p||!Array.isArray(state.kicks)||state.kicks.length!==2||
      !state.kicks.every(kicks=>Array.isArray(kicks)&&kicks.every(kick=>typeof kick==='boolean'))||
      ![0,1].includes(state.attack)||!['ready','run','flight','settle','result','replay'].includes(state.phase))return false;
    const fresh=!this.online||this.matchId!==state.matchId;
    const lineup=fresh||this.attack!==state.attack||this.shooter.id!==state.shooter||this.keeperPlayer.id!==state.keeper;
    const previousPhase=this.phase;
    const phaseChanged=fresh||previousPhase!==state.phase;
    const inputReset=fresh||((phaseChanged||lineup)&&state.phase==='ready');
    this.online=true;this.mode='online';this.config=state.config;this.matchId=state.matchId;this.kickSerial=state.kickSerial;
    if(fresh){this.sim?.dispose();this.sim=null;this.scores=new Shootout();this.view.environment(state.config.light,state.config.venue);}
    Object.assign(this.scores,{kicks:state.kicks,turn:state.turn,winner:state.winner});
    this.attack=state.attack;this.phase=state.phase;this.outcome=state.outcome;this.clock=state.clock;
    this.shooter=players[state.shooter];this.keeperPlayer=players[state.keeper];this.keeper={human:true};this.aiShot=false;
    this.remoteFrame=state.frame;
    if(inputReset)this.input={x:1.52,y:1.37,foot:this.shooter.foot};
    if(lineup){
      const teams=state.config.clubs,a=this.attack;
      this.view.lineup(this.shooter,clubs[teams[a]],this.keeperPlayer,clubs[teams[1-a]],teams[0]===teams[1]&&a===1);
    }
    if(phaseChanged){
      if(this.phase==='run')this.audio.play('whistle');
      if(this.phase==='flight')this.audio.play('kick');
      if(this.phase==='result'&&previousPhase!=='replay')this.audio.reaction(this.outcome);
    }
    if(lineup||phaseChanged)this.changed();
    return true;
  }
  currentFrame(){
    if(this.phase==='replay')return this.frames[Math.min(this.frames.length-1,Math.floor(this.clock*24))];
    return {p:this.sim?.ball.translation()??initialBall,q:this.sim?.ball.rotation(),pose:this.pose,
      run:this.phase==='result'?1.1+this.clock:this.active?1+Math.min(.25,this.sim.elapsed):this.run,
      celebrate:this.phase==='result'&&this.outcome==='GOAL'?1:0,elapsed:this.sim?.elapsed||0,impact:this.sim?.collisions.at(-1),net:this.netImpact};
  }
  update(dt){
    this.clock+=dt;
    this.networkAge=(this.networkAge??0)+dt;
    this.remoteMoveAge=(this.remoteMoveAge??0)+dt;
    if(this.canAim){
      const x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
      const y=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'));
      this.aim(this.input.x+x*3.7*dt,this.input.y+y*2.2*dt);
    }
    if(this.guest){
      if(this.canDefend&&this.networkAge>=.05){
        this.sendCommand('move',{direction:this.movement});this.networkAge=0;
      }
      if(this.remoteFrame)this.draw(this.remoteFrame);
      return;
    }
    if(this.online&&['ready','run'].includes(this.phase)){
      this.pose=this.keeper.update(0,dt,initialBall,{z:0},this.keeperMove);
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
    if(this.online&&this.networkAge>=1/30){this.broadcast();this.networkAge=0;}
    this.draw(this.currentFrame());
  }
  draw(frame){
    const visual={foot:this.input.foot,aim:this.canAim?this.input:null,net:frame.net,
      crowd:this.phase==='result'?this.clock+.01:0,
      confetti:this.phase==='result'&&this.outcome==='GOAL'&&this.clock<7?this.clock+.01:0};
    this.view.draw(frame,visual);
  }
}
