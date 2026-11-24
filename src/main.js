import './style.css';
import {ready,defaults,MASS,R} from './physics.js';
import {clubs,players,squad,eligible,validLineup} from './players.js';
import {Stadium} from './render.js';
import {StadiumAudio} from './audio.js';
import {Game,challenges} from './game.js';

const $=id=>document.getElementById(id);
const config={mode:'solo',clubs:['madrid','barca'],lineups:[squad('madrid'),squad('barca')],difficulty:'Pro',venue:'madrid',light:'Night',challenge:0};
const preferences={quality:'High',volume:.55,mute:false,commentary:false};
function restore(key){
  try{return JSON.parse(localStorage.getItem(key));}catch{return null;}
}
function save(){
  try{
    localStorage.setItem('penalty26-settings',JSON.stringify(preferences));
    localStorage.setItem('penalty26-lineup',JSON.stringify(config));
  }catch{/* Browser storage can be disabled. */}
}
Object.assign(preferences,restore('penalty26-settings'));
const old=restore('penalty26-lineup');
if(old?.clubs?.length===2 && old.clubs.every((club,i)=>validLineup(club,old.lineups?.[i]||[])))Object.assign(config,old);
let game, stadium, audio, selection, draft;
const params={gravity:['Gravity','m/s²',1,18,.01],drag:['Air resistance','×',0,2,.05],friction:['Friction','',0,1,.05],bounce:['Restitution','',0,1,.01]};
const options=values=>values.map(v=>`<option>${v}</option>`).join('');
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const humanLabel=(side)=>game.mode==='local'?`Player ${side+1}`:side===0?'You':'CPU';

function button(id,fn){$(id).addEventListener('click',fn);}
function setLab(open){
  game.labOpen=open;game.pathDirty=true;$('lab').hidden=!open;
}
function setup(){
  draft=structuredClone(config);
  $('difficulty').value=draft.difficulty;$('venue').value=draft.venue;$('light').value=draft.light;$('challenge').value=draft.challenge;
  renderSetup();$('setup').showModal();
}
function renderSetup(){
  $('modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===draft.mode));
  $('challenge-field').hidden=draft.mode!=='legend';
  $('setup-note').textContent=draft.mode==='legend'?'The challenge sets the first taker. Ratings are custom.':'Custom gameplay ratings';
  $('lineups').innerHTML=draft.clubs.map((id,i)=>`<section class="lineup"><label>${i===0?'Player 1':draft.mode==='local'?'Player 2':'Opponent'} <select data-club="${i}" aria-label="Club for side ${i+1}">${Object.entries(clubs).map(([k,c])=>`<option value="${k}" ${k===id?'selected':''}>${c.name}</option>`).join('')}</select></label><div class="slots">${draft.lineups[i].map((pid,slot)=>`<button type="button" class="slot" data-side="${i}" data-slot="${slot}"><span class="slot-index">${slot||'GK'}</span>${players[pid].name}<b>${players[pid].rating}</b></button>`).join('')}</div></section>`).join('');
}
function openRoster(side,slot){
  selection={side,slot};$('roster-club').textContent=clubs[draft.clubs[side]].name;
  $('roster-title').textContent=slot?`Penalty taker ${slot}`:'Goalkeeper';
  for(const id of ['search','position','generation','nationality'])$(id).value='';
  $('rating').value='0';
  $('nationality').innerHTML='<option value="">All</option>'+options([...new Set(players.filter(p=>eligible(p,draft.clubs[side],slot)).map(p=>p.nation))].sort());
  renderRoster();$('roster').showModal();$('search').focus();
}
function renderRoster(){
  const {side,slot}=selection;
  const normalize=s=>s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const search=normalize($('search').value.trim());
  const results=players.filter(p=>eligible(p,draft.clubs[side],slot)&&normalize(p.name).includes(search)&&
    (!$('position').value||p.position===$('position').value)&&(!$('generation').value||p.generation===$('generation').value)&&
    (!$('nationality').value||p.nation===$('nationality').value)&&p.rating>=Number($('rating').value)).sort((a,b)=>b.rating-a.rating);
  $('player-results').innerHTML=results.map(p=>{
    const taken=draft.lineups[side].includes(p.id)&&draft.lineups[side][slot]!==p.id;
    const skills=slot?`PWR ${p.power} · ACC ${p.accuracy} · CUR ${p.curve} · COM ${p.composure} · WF ${p.weakFoot}`:
      `REF ${p.reflex} · DIV ${p.dive} · RCH ${p.reach} · POS ${p.positioning}`;
    return `<button class="person" data-player="${p.id}" ${taken?'disabled':''}><b>${p.rating}</b><strong>${p.name}</strong><small>${p.position} · ${p.nation} · ${p.generation} · ${p.year}</small><small class="traits">${skills}</small><small>${p.height.toFixed(2)} m · ${p.weight} kg · ${p.foot} foot · ${p.runup}</small></button>`;
  }).join('')||'<p>No players match these filters.</p>';
}

function kickDots(kicks){
  const start=Math.max(0,kicks.length-7);
  return Array.from({length:Math.max(5,kicks.length-start)},(_,i)=>{
    const value=kicks[start+i];return `<i class="${value===undefined?'':value?'good':'bad'}" title="${value===undefined?'Pending':value?'Goal':'Missed'}"></i>`;
  }).join('');
}
const range=(id,label,value,min=-1,max=1,step=.05)=>`<label><span>${label} <output id="${id}-value">${Number(value).toFixed(2)}</output></span><input id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
function announce(tag,title,description){
  $('announcement').hidden=!title;
  if(title){
    $('announcement-tag').textContent=tag;$('announcement-title').textContent=title;$('announcement-description').textContent=description;
  }
}
function sync(){
  if(!game.config)return;
  const {phase,shooter,input,attack,keeperPlayer,scores}=game;
  const {clubs:teams,venue,light}=game.config;
  for(const [i,label] of ['home','away'].entries()){
    const team=clubs[i===0&&game.challenge?game.challenge.club:teams[i]];
    $(label+'-badge').textContent=team.badge;$(label+'-badge').className='crest '+(team.badge==='RM'?'madrid':'barca');
    $(label+'-short').textContent=team.short;$(label+'-kicks').innerHTML=game.isMatch?kickDots(scores.kicks[i]):'';
  }
  $('venue-label').textContent=`${clubs[venue].venue.toUpperCase()} · ${light.toUpperCase()}`;
  $('score').innerHTML=game.isMatch?`${scores.goals[0]} <i>–</i> ${scores.goals[1]}`:`${game.challenge?game.challengeWins:game.scored} <i>/</i> ${game.attempts}`;
  $('round-label').textContent=game.isMatch?(Math.max(...scores.kicks.map(k=>k.length))>=5&&Math.min(...scores.kicks.map(k=>k.length))>=5?'SUDDEN DEATH':`ROUND ${String(Math.min(5,Math.min(...scores.kicks.map(k=>k.length))+1)).padStart(2,'0')}`):game.challenge?'LEGEND CHALLENGE':game.mode==='lab'?'PHYSICS LAB':'TRAINING';
  $('lab').hidden=!game.labOpen;
  $('player-card').innerHTML=`<span class="rating">${shooter.rating}</span><span class="eyebrow">${humanLabel(attack).toUpperCase()} · PENALTY TAKER</span><h2>${shooter.name}</h2><p>${shooter.foot} foot · ${shooter.runup} run-up · ${shooter.nation}</p>`;
  const dock=$('control-dock');
  const leave=dock.contains(document.activeElement)?document.activeElement.id:'';
  if(phase==='result'){
    const winner=scores.winner;
    const info=winner!==null?`${humanLabel(winner)} · ${clubs[teams[winner]].name} · ${scores.goals.join('–')}`:
      game.challenge?(game.challengeSuccess?'Challenge completed':`Score with ${game.challenge.style}${game.challenge.minSpeed?' at 30 m/s or faster':''}`):`${shooter.name} against ${keeperPlayer.name}`;
    announce(winner!==null?'FINAL SCORE':'PENALTY RESULT',winner!==null?'VICTORY':game.outcome,info);
    dock.innerHTML=`<button id="replay" class="span-two">Slow-motion replay</button><button id="next" class="primary span-two">${winner!==null?'Rematch':game.isMatch?'Next penalty':'Take another kick'}</button>`;
  }else if(phase==='replay'){
    announce('','','');dock.innerHTML='<span class="eyebrow span-two">SLOW-MOTION REPLAY</span><button id="skip-replay" class="span-two">End replay</button>';
  }else{
    announce('','','');
    const meter='<div class="meter" aria-label="Power or timing meter"><span id="meter-fill"></span><i id="meter-target" class="target" hidden></i><i id="meter-needle" class="needle" hidden></i></div>';
    const defend=game.keeper.human && (game.aiShot||game.active);
    if(defend){
      dock.innerHTML=`<span class="eyebrow span-two">${humanLabel(1-attack)} in goal</span><span class="span-two">${keeperPlayer.name}</span>
        <button data-dive="-1">Dive left</button><button data-dive="0">Jump</button><button data-dive="1">Dive right</button><button id="dive-low" aria-pressed="false">Low dive</button>
        <button data-move="-1" class="span-two">Move left</button><button data-move="1" class="span-two">Move right</button>`;
    }else if(phase==='ready'||phase==='charge'||phase==='run'){
      dock.innerHTML=`<label>Technique <select id="style">${options(['Power','Finesse','Panenka','Driven','Curve','Knuckle'])}</select></label><label>Foot <select id="foot">${options(['Right','Left'])}</select></label>${range('spin','Spin',input.spin)}
        <button class="primary shoot" id="shoot">${phase==='run'?'Strike':phase==='charge'?'Release':'Hold to shoot'}</button>
        <label class="span-two"><span>Contact left / right</span><input id="cx" aria-label="Horizontal ball contact" type="range" min="-1" max="1" step=".05" value="${input.cx}"></label>
        <label class="span-two"><span>Contact low / high</span><input id="cy" aria-label="Vertical ball contact" type="range" min="-1" max="1" step=".05" value="${input.cy}"></label>${meter}`;
      $('style').value=input.style;$('foot').value=input.foot;
    }else{
      dock.innerHTML='<span class="eyebrow span-two">BALL IN PLAY</span><span class="span-two">Watching the goal line</span>';
    }
  }
  if(leave && $(leave) && leave!=='shoot')$(leave).focus({preventScroll:true});
  $('hint').innerHTML=game.keeper.human&&(game.aiShot||game.active)?'MOVE <kbd>A</kbd><kbd>D</kbd> &nbsp; DIVE <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> &nbsp; LOW <kbd>SHIFT</kbd>':
    'AIM <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp; HOLD <kbd>SPACE</kbd> FOR POWER &nbsp; PRESS AGAIN TO TIME THE STRIKE';
}
function updateMeter(){
  const fill=$('meter-fill');if(!fill)return;
  const timing=game.phase==='run';
  fill.style.width=(timing?100:game.input.power)+'%';
  fill.style.opacity=timing?.23:1;
  $('meter-needle').hidden=$('meter-target').hidden=!timing;
  if(timing){
    $('meter-needle').style.left=(game.timed?game.input.timing:game.run)*100+'%';
    $('shoot').textContent=game.timed?'Timed':'Strike';
  }
}
function telemetry(){
  if(!game.labOpen)return;
  const sim=game.sim;
  const shot=sim?.shot, v=sim?.ball.linvel(), w=sim?.ball.angvel(), p=sim?.ball.translation();
  const last=sim?.collisions.at(-1);
  const f=(value,unit)=>Number.isFinite(value)?`${value.toFixed(2)} ${unit}`:'—';
  const vector=(v,unit)=>v?`${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)} ${unit}`:'—';
  const axis=w?[['Top/back',w.x],['Side',w.y],['Roll',w.z]].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0]:null;
  const metrics=[
    ['Initial velocity',vector(shot?.velocity,'m/s')],['Current velocity',vector(v,'m/s')],
    ['Launch angle',f(shot?.pitch,'°')],['Angular velocity',vector(w,'rad/s')],
    ['Dominant spin',axis&&Math.abs(axis[1])>.1?`${axis[0]} ${axis[1]>0?'+':'−'}`:'—'],
    ['Elapsed',f(sim?.elapsed,'s')],['Kinetic energy',f(v?.x!==undefined?.5*MASS*magnitude(v)**2+.2*MASS*R**2*magnitude(w)**2:NaN,'J')],
    ['Potential energy',f(p?MASS*sim.settings.gravity*p.y:NaN,'J')],['Drag force',f(sim?.drag,'N')],['Magnus force',f(sim?.magnus,'N')],
    ['Impact angle',f(last?.impact,'°')],['Rebound angle',f(last?.rebound,'°')],
    ['Last collision loss',f(last?.loss,'J')],['Total collision loss',f(sim?.collisions.reduce((sum,c)=>sum+c.loss,0),'J')]
  ];
  $('telemetry').innerHTML=metrics.map(([label,value])=>`<dt>${label}</dt><dd>${value}</dd>`).join('');
  $('parameters').querySelectorAll('input').forEach(input=>input.disabled=game.mode!=='lab'||game.active);
}
function bind(){
  button('open-setup',setup);
  button('open-lab',()=>{setLab(!game.labOpen);telemetry();});
  button('close-lab',()=>setLab(false));
  button('open-settings',()=>$('settings').showModal());
  button('close-roster',()=>$('roster').close());
  $('modes').addEventListener('click',e=>{if(e.target.dataset.mode){draft.mode=e.target.dataset.mode;renderSetup();}});
  $('lineups').addEventListener('change',e=>{
    const side=Number(e.target.dataset.club);if(!Number.isInteger(side))return;
    draft.clubs[side]=e.target.value;draft.lineups[side]=squad(e.target.value);renderSetup();
  });
  $('lineups').addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(b)openRoster(Number(b.dataset.side),Number(b.dataset.slot));});
  for(const id of ['search','position','generation','nationality','rating'])$(id).addEventListener('input',renderRoster);
  $('player-results').addEventListener('click',e=>{
    const b=e.target.closest('[data-player]');if(!b||b.disabled)return;
    draft.lineups[selection.side][selection.slot]=Number(b.dataset.player);
    renderSetup();$('roster').close();
  });
  $('setup-form').addEventListener('submit',e=>{
    if(e.submitter?.value!=='start')return;
    Object.assign(config,draft,{difficulty:$('difficulty').value,venue:$('venue').value,light:$('light').value,challenge:Number($('challenge').value)});
    audio.start();game.start(config);save();
  });
  $('camera').addEventListener('change',e=>game.camera=e.target.value);
  for(const key of ['quality','volume','mute','commentary']){
    const el=$(key);
    if(el.type==='checkbox')el.checked=preferences[key];else el.value=preferences[key];
    el.addEventListener('input',()=>{
      preferences[key]=el.type==='checkbox'?el.checked:key==='volume'?Number(el.value):el.value;
      if(key==='quality')stadium.quality(el.value);else audio.start();
      save();
    });
  }
  for(const key of ['slow','forces','compare'])$(key).addEventListener('change',e=>game[key]=e.target.checked);
  $('parameters').innerHTML=Object.entries(params).map(([key,[label,,min,max,step]])=>range(key,label,defaults[key],min,max,step)).join('');
  $('parameters').addEventListener('input',e=>{
    if(game.mode!=='lab'||game.active)return;
    const key=e.target.id;game.parameters[key]=Number(e.target.value);
    $(key+'-value').textContent=game.parameters[key].toFixed(2);
  });
  const dock=$('control-dock');
  dock.addEventListener('input',e=>{
    const k=e.target.id;
    if(!['style','foot','spin','cx','cy'].includes(k)||!game.canAim)return;
    game.input[k]=e.target.type==='range'?Number(e.target.value):e.target.value;
    if($(k+'-value'))$(k+'-value').textContent=Number(e.target.value).toFixed(2);
  });
  let low=false;
  dock.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const actions={replay:()=>game.replay(),next:()=>game.next(),'skip-replay':()=>game.stopReplay(),'dive-low':()=>{low=!low;b.setAttribute('aria-pressed',low);}};
    if(actions[b.id])actions[b.id]();
    if(b.dataset.dive!==undefined)game.defend(Number(b.dataset.dive),!low);
  });
  let pointer=null;
  dock.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.id==='shoot'){
      e.preventDefault();pointer={id:e.pointerId,kind:'shoot'};dock.setPointerCapture(e.pointerId);game.press();
    }
    if(b.dataset.move!==undefined){
      e.preventDefault();const key=b.dataset.move==='1'?'KeyD':'KeyA';
      pointer={id:e.pointerId,kind:key};dock.setPointerCapture(e.pointerId);game.keys.add(key);
    }
  });
  function release(e){
    if(pointer?.id!==e.pointerId)return;
    if(pointer.kind==='shoot')game.release();else game.keys.delete(pointer.kind);
    pointer=null;
  }
  dock.addEventListener('pointerup',release);dock.addEventListener('pointercancel',release);
  dock.addEventListener('lostpointercapture',release);
  const canvas=$('stadium');
  let drag;
  canvas.addEventListener('pointerdown',e=>{
    if(!game.canAim)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,aimX:game.input.x,aimY:game.input.y};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)game.aim(drag.aimX+(e.clientX-drag.x)*.019,drag.aimY-(e.clientY-drag.y)*.014);});
  const stopDrag=()=>{drag=null;};
  canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);
  const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  window.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
    if(movement.includes(e.code)){e.preventDefault();game.keys.add(e.code);}
    if(e.code==='Space'&&(!e.target.closest('button')||e.target.id==='shoot')){
      e.preventDefault();if(!e.repeat)game.press();
    }
    if(!e.repeat&&['KeyJ','KeyK','KeyL'].includes(e.code))game.defend({KeyJ:-1,KeyK:0,KeyL:1}[e.code],!e.shiftKey);
    if(e.code==='Enter'&&game.phase==='result'&&!e.target.closest('button'))game.next();
  });
  window.addEventListener('keyup',e=>{game.keys.delete(e.code);if(e.code==='Space')game.release();});
  window.addEventListener('blur',()=>{game.keys.clear();game.release();});
}

async function boot(){
  await ready;
  stadium=new Stadium($('stadium'));
  stadium.quality(preferences.quality);
  audio=new StadiumAudio(preferences);
  game=new Game(stadium,audio,sync);
  game.start(config);bind();
  let before=performance.now(),lastReport=before,frames=0;
  function frame(now){
    const dt=Math.min(.05,(now-before)/1000);before=now;frames++;
    if(!document.querySelector('dialog[open]'))game.update(dt);
    updateMeter();
    if(now-lastReport>300){
      $('performance').textContent=`${Math.round(frames*1000/(now-lastReport))} FPS · FIXED STEP 240 HZ`;
      telemetry();frames=0;lastReport=now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);$('error').hidden=false;$('error').textContent=`Could not initialize the stadium. Enable WebGL 2 and reload. ${error.message}`;
});
