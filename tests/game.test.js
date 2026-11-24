import test from 'node:test';
import assert from 'node:assert/strict';
import {ready,Simulation,DT,R,wholeBall,launch} from '../src/physics.js';
import {players,squad,validLineup,eligible} from '../src/players.js';
import {Shootout} from '../src/rules.js';
import {Keeper} from '../src/keeper.js';

await ready;
const fire=(sim,velocity,spin={x:0,y:0,z:0})=>sim.kick({velocity,spin});
function simulate(sim,steps=1920){
  for(let i=0;i<steps && !sim.result;i++)sim.step();
  return sim.result;
}

test('vacuum trajectory follows constant gravitational acceleration in SI units',()=>{
  const sim=new Simulation({drag:0});
  try{
    fire(sim,{x:2,y:5,z:-23});
    for(let i=0;i<72;i++)sim.step();
    const t=72*DT,p=sim.ball.translation();
    assert.ok(Math.abs(p.x-2*t)<.005);
    assert.ok(Math.abs(p.y-(R+.001+5*t-4.905*t*t))<.012);
    assert.ok(Math.abs(p.z-(11-23*t))<.015);
  }finally{sim.dispose();}
});
test('drag lowers speed and opposite spin bends the ball in opposite directions',()=>{
  const sides=[-1,1].map(sign=>{
    const sim=new Simulation();
    try{
      fire(sim,{x:0,y:4,z:-26},{x:0,y:sign*38,z:0});
      for(let i=0;i<80;i++)sim.step();
      assert.ok(Math.abs(sim.ball.linvel().z)<26);
      assert.ok(sim.drag>0&&sim.magnus>0);
      return sim.ball.translation().x;
    }finally{sim.dispose();}
  });
  assert.ok(sides[0]>.03&&sides[1]<-.03);
});
test('the sphere must clear the line and fit through the opening',()=>{
  const p={x:0,y:1,z:.2};
  assert.equal(wholeBall(p,{x:0,y:1,z:-.06}),false);
  assert.equal(wholeBall(p,{x:0,y:1,z:-.13}),true);
  assert.equal(wholeBall({...p,x:3.60},{x:3.60,y:1,z:-.13}),false);
  assert.equal(wholeBall({...p,y:2.40},{x:0,y:2.40,z:-.13}),false);
});
test('a centred flight scores and physically hits the back net',()=>{
  const sim=new Simulation();
  try{
    fire(sim,{x:0,y:4.6,z:-25});
    assert.equal(simulate(sim),'GOAL');
    for(let i=0;i<140;i++)sim.step();
    assert.ok(sim.collisions.some(c=>c.type==='net'));
  }finally{sim.dispose();}
});
test('CCD catches a fast post strike and the ball rebounds',()=>{
  const sim=new Simulation({gravity:0,drag:0});
  try{
    fire(sim,{x:3.72*5.2,y:1.05*5.2,z:-11*5.2});
    simulate(sim);
    const hit=sim.collisions.find(c=>c.type==='frame');
    assert.ok(hit);
    assert.ok(hit.loss>0);
    assert.notEqual(sim.result,'GOAL');
  }finally{sim.dispose();}
});
test('crossbar stops a high 48 m/s kick',()=>{
  const sim=new Simulation({gravity:0,drag:0});
  try{
    fire(sim,{x:0,y:(2.50-R)*48/11,z:-48});
    assert.notEqual(simulate(sim),'GOAL');
    assert.ok(sim.collisions.some(c=>c.type==='frame'));
  }finally{sim.dispose();}
});
test('the ball rebounds off grass and loses energy',()=>{
  const sim=new Simulation({drag:0});
  try{
    fire(sim,{x:0,y:4,z:-2});
    for(let i=0;i<260;i++)sim.step();
    const hit=sim.collisions.find(c=>c.type==='ground'&&c.time>.5);
    assert.ok(hit?.loss>0);
    assert.ok(sim.ball.translation().y>R+.04);
  }finally{sim.dispose();}
});
test('keeper collision changes the outcome of the identical shot',()=>{
  const sim=new Simulation();
  try{
    const p=players[squad('madrid')[0]];
    sim.setKeeper(new Keeper(p,'Pro',true).pose(0),true);
    fire(sim,{x:0,y:4.5,z:-25});
    assert.equal(simulate(sim),'SAVED');
    assert.ok(sim.collisions.some(c=>c.type==='keeper'));
  }finally{sim.dispose();}
});
test('keeper AI waits for its reaction delay and uses observed ball movement',()=>{
  const keeper=new Keeper(players[squad('barca')[0]],'Legend');
  keeper.update(.01,DT,{x:2,y:1,z:4},{x:3,y:0,z:-25});
  assert.equal(keeper.diveTime,null);
  keeper.update(.25,DT,{x:2,y:1,z:4},{x:3,y:0,z:-25});
  assert.equal(keeper.direction,1);
});
test('power, foot choice, contact and shot type affect launch conditions',()=>{
  const p=players[0],input={x:1,y:1.2,power:80,cx:0,cy:0,spin:0,timing:.72,style:'Power',foot:'Right'};
  const base=launch(input,p),chip=launch({...input,style:'Panenka'},p);
  assert.ok(Math.abs(base.velocity.z)>Math.abs(chip.velocity.z));
  assert.ok(chip.pitch>base.pitch);
  assert.ok(Math.abs(launch({...input,foot:'Left'},p).velocity.z)<Math.abs(base.velocity.z));
  assert.ok(launch({...input,cx:.8,spin:1},p).spin.y>base.spin.y);
});
test('club eligibility, dual-club footballers and duplicate teams',()=>{
  for(const name of ['Ronaldo Nazário','Luís Figo','Michael Laudrup','Samuel Eto’o']){
    const p=players.find(player=>player.name===name);
    assert.ok(eligible(p,'madrid',1)&&eligible(p,'barca',1));
  }
  for(const a of ['madrid','barca'])for(const b of ['madrid','barca']){
    const lineups=[squad(a),squad(b)];
    assert.ok(validLineup(a,lineups[0])&&validLineup(b,lineups[1]));
    if(a===b)assert.deepEqual(lineups[0],lineups[1]);
  }
  const roster=squad('madrid');roster[2]=roster[1];
  assert.equal(validLineup('madrid',roster),false);
  assert.equal(eligible(players.find(p=>p.name==='Lionel Messi'),'madrid',1),false);
});
test('a three-goal lead after three kicks each clinches early',()=>{
  const scores=new Shootout();
  [true,false,true,false,true,false].forEach(v=>scores.record(v));
  assert.equal(scores.winner,0);
  assert.deepEqual(scores.goals,[3,0]);
  assert.throws(()=>scores.record(true));
});
test('the winner in sudden death is determined only after equal kick counts',()=>{
  const scores=new Shootout(1);
  for(let i=0;i<10;i++)scores.record(true);
  assert.equal(scores.winner,null);
  scores.record(true);assert.equal(scores.winner,null);
  assert.equal(scores.record(false),1);
});

test('the match draws eligible takers automatically, with no first-round repeats',async()=>{
  const {Game}=await import('../src/game.js');
  const game=new Game({environment(){},lineup(){}},{},()=>{});
  game.start({mode:'local',clubs:['madrid','barca'],difficulty:'Pro'});
  assert.equal(game.phase,'ready');
  assert.equal(game.canAim,true);
  for(let i=0;i<5;i++){
    const {shooter}=game;
    assert.ok(eligible(shooter,'madrid',1));
    assert.equal(game.input.foot,shooter.foot);
    assert.ok(!game.taken[0].includes(shooter.id));
    game.taken[0].push(shooter.id);
    game.prepare();
  }
  assert.equal(game.shooter,game.keepers[0]);
  game.scores.turn=1;
  game.prepare();
  assert.ok(eligible(game.shooter,'barca',1));
  assert.equal(game.keeperPlayer,game.keepers[0]);
});

test('tilt maps portrait and landscape orientation to screen-relative aim',async()=>{
  const {tiltAim}=await import('../src/tilt.js');
  const origin={beta:15,gamma:0,x:0,y:1};
  assert.deepEqual(tiltAim(origin,{beta:15,gamma:0}),{x:0,y:1});
  assert.ok(tiltAim(origin,{beta:15,gamma:10}).x>1);
  assert.ok(tiltAim(origin,{beta:25,gamma:0},90).x< -1);
});

test('online guest controls only their turn and follows the host result',async()=>{
  const {Game}=await import('../src/game.js');
  const view={environment(){},lineup(){},draw(){}};
  const audio={start(){},play(){},announce(){},reaction(){}};
  const host=new Game(view,audio,()=>{});
  const guest=new Game(view,audio,()=>{});
  guest.setNetwork(1,message=>host.receiveCommand(message));
  host.setNetwork(0,message=>guest.receiveState(structuredClone(message)));
  host.start({mode:'online',clubs:['madrid','barca'],difficulty:'Pro',venue:'madrid',light:'Night'});
  assert.equal(guest.shooter.id,host.shooter.id);
  assert.equal(guest.canAim,false);
  assert.equal(guest.canDefend,true);
  guest.sendCommand('shoot',{x:2,y:1.3});
  assert.equal(host.phase,'ready');
  host.press();
  guest.defend(-1,true);
  assert.deepEqual(host.queuedDive,{direction:-1,high:true});
  for(let i=0;i<600&&host.phase!=='result';i++){host.update(1/120);guest.update(1/120);}
  assert.equal(host.phase,'result');
  assert.equal(guest.outcome,host.outcome);
  assert.deepEqual(guest.scores.kicks,host.scores.kicks);
  const previousKick=host.kickId;
  guest.next();
  assert.equal(host.canAim,false);
  assert.equal(guest.canAim,true);
  host.receiveCommand({type:'command',action:'shoot',kickId:previousKick,x:1,y:2});
  assert.equal(host.phase,'ready');
  guest.aim(-2,1.3);
  guest.press();
  assert.equal(host.phase,'run');
  assert.equal(host.input.x,-2);
  host.sim?.dispose();
});
