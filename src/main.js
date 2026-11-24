import './style.css';
import {ready} from './physics.js';
import {clubs,players,squad,eligible,validLineup} from './players.js';
import {Stadium} from './render.js';
import {StadiumAudio} from './audio.js';
import {Game} from './game.js';
import {tiltAim} from './tilt.js';

const $=id=>document.getElementById(id);
const config={mode:'solo',clubs:['madrid','barca'],lineups:[squad('madrid'),squad('barca')],difficulty:'Pro',venue:'madrid',light:'Night'};
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
if(!['solo','local','practice'].includes(config.mode))config.mode='solo';
const tilt={status:'off',origin:null,timer:null};
const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const options=values=>values.map(v=>`<option>${v}</option>`).join('');
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const humanLabel=(side)=>game.mode==='local'?`Player ${side+1}`:side===0?'You':'CPU';

function button(id,fn){$(id).addEventListener('click',fn);}
function setup(){
  draft=structuredClone(config);
  $('difficulty').value=draft.difficulty;$('venue').value=draft.venue;$('light').value=draft.light;
  renderSetup();$('setup').showModal();
}
function renderSetup(){
  $('modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===draft.mode));
  $('lineups').innerHTML=draft.clubs.map((id,i)=>`<section class="lineup"><label>${i===0?'Player 1':draft.mode==='local'?'Player 2':'Opponent'} <select data-club="${i}" aria-label="Club for side ${i+1}">${Object.entries(clubs).map(([k,c])=>`<option value="${k}" ${k===id?'selected':''}>${c.name}</option>`).join('')}</select></label><div class="slots">${draft.lineups[i].slice(0,1).map((pid,slot)=>`<button type="button" class="slot" data-side="${i}" data-slot="${slot}"><span class="slot-index">${slot||'GK'}</span>${players[pid].name}<b>${players[pid].rating}</b></button>`).join('')}</div></section>`).join('');
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
const range=(id,label,value,min,max,step)=>`<label><span>${label} <output id="${id}-value">${Number(value)}%</output></span><input id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
function announce(tag,title,description){
  $('announcement').hidden=!title;
  if(title){
    $('announcement-tag').textContent=tag;$('announcement-title').textContent=title;$('announcement-description').textContent=description;
  }
}
function sync(){
  if(!game.config)return;
  if(!game.canAim&&(tilt.status==='on'||tilt.status==='waiting'))stopTilt();
  const {phase,shooter,input,attack,keeperPlayer,scores}=game;
  const {clubs:teams,venue,light}=game.config;
  for(const [i,label] of ['home','away'].entries()){
    const team=clubs[teams[i]];
    $(label+'-badge').textContent=team.badge;$(label+'-badge').className='crest '+(team.badge==='RM'?'madrid':'barca');
    $(label+'-short').textContent=team.short;$(label+'-kicks').innerHTML=game.isMatch?kickDots(scores.kicks[i]):'';
  }
  $('venue-label').textContent=`${clubs[venue].venue.toUpperCase()} · ${light.toUpperCase()}`;
  $('score').innerHTML=game.isMatch?`${scores.goals[0]} <i>–</i> ${scores.goals[1]}`:`${game.scored} <i>/</i> ${game.attempts}`;
  $('round-label').textContent=game.isMatch?(Math.max(...scores.kicks.map(k=>k.length))>=5&&Math.min(...scores.kicks.map(k=>k.length))>=5?'SUDDEN DEATH':`ROUND ${String(Math.min(5,Math.min(...scores.kicks.map(k=>k.length))+1)).padStart(2,'0')}`):'TRAINING';
  $('player-card').innerHTML=shooter?`<span class="rating">${shooter.rating}</span><span class="eyebrow">${humanLabel(attack).toUpperCase()} · PENALTY TAKER</span><h2>${shooter.name}</h2><p>${shooter.nation} · ${shooter.position}</p>`:`<span class="eyebrow">${humanLabel(attack).toUpperCase()}</span><h2>Pick your taker</h2><p>${clubs[teams[attack]].name}</p>`;
  const dock=$('control-dock');
  dock.classList.toggle('shot-dock',game.canAim);
  const leave=dock.contains(document.activeElement)?document.activeElement.id:'';
  if(phase==='result'){
    const winner=scores.winner;
    const info=winner!==null?`${humanLabel(winner)} · ${clubs[teams[winner]].name} · ${scores.goals.join('–')}`:
      `${shooter.name} against ${keeperPlayer.name}`;
    announce(winner!==null?'FINAL SCORE':'PENALTY RESULT',winner!==null?'VICTORY':game.outcome,info);
    dock.innerHTML=`<button id="replay" class="span-two">Slow-motion replay</button><button id="next" class="primary span-two">${winner!==null?'Rematch':game.isMatch?'Next penalty':'Take another kick'}</button>`;
  }else if(phase==='select'){
    announce('','','');
    dock.innerHTML=`<label class="span-two">Penalty taker <select id="pick-taker"><option value="">Choose a player</option>${game.availableTakers.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label><button id="confirm-taker" class="primary span-two" disabled>Select taker</button>`;
  }else if(phase==='replay'){
    announce('','','');dock.innerHTML='<span class="eyebrow span-two">SLOW-MOTION REPLAY</span><button id="skip-replay" class="span-two">End replay</button>';
  }else{
    announce('','','');
    const defend=game.keeper.human && (game.aiShot||game.active);
    if(defend){
      dock.innerHTML=`<span class="eyebrow span-two">${humanLabel(1-attack)} in goal</span><span class="span-two">${keeperPlayer.name}</span>
        <button data-dive="-1">Dive left</button><button data-dive="0">Jump</button><button data-dive="1">Dive right</button><button id="dive-low" aria-pressed="false">Low dive</button>
        <button data-move="-1" class="span-two">Move left</button><button data-move="1" class="span-two">Move right</button>`;
    }else if(phase==='ready'){
      dock.innerHTML=`<label>Foot <select id="foot">${options(['Right','Left'])}</select></label>
        ${range('power','Power',input.power,30,100,1)}
        <button id="tilt" ${touchDevice?'':'hidden'} aria-pressed="${tilt.status==='on'}">${tilt.status==='on'?'Tilt on':tilt.status==='waiting'?'Waiting for tilt…':tilt.status==='unavailable'?'Tilt unavailable':'Tilt to aim'}</button>
        <button class="primary shoot" id="shoot">Shoot</button>
        <span class="aim-help" id="aim-help" aria-live="polite">Aim at the goal by touching the pitch or using WASD.</span>`;
      $('foot').value=input.foot;
    }else if(phase==='run'){
      dock.innerHTML='<span class="eyebrow span-two">RUN-UP</span>';
    }else{
      dock.innerHTML='<span class="eyebrow span-two">BALL IN PLAY</span><span class="span-two">Watching the goal line</span>';
    }
  }
  if(leave && $(leave) && leave!=='shoot')$(leave).focus({preventScroll:true});
  $('hint').innerHTML=game.keeper.human&&(game.aiShot||game.active)?'MOVE <kbd>A</kbd><kbd>D</kbd> &nbsp; DIVE <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> &nbsp; LOW <kbd>SHIFT</kbd>':
    game.phase==='select'?'CHOOSE YOUR PENALTY TAKER':'AIM <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp; SHOOT <kbd>SPACE</kbd>';
}

function tiltStatus(status,message){
  tilt.status=status;
  if($('tilt')){
    $('tilt').textContent={off:'Tilt to aim',waiting:'Waiting for tilt…',on:'Tilt on',unavailable:'Tilt unavailable'}[status];
    $('tilt').setAttribute('aria-pressed',status==='on');
  }
  if($('aim-help'))$('aim-help').textContent=message;
}

function stopTilt(message='Tap the pitch or use WASD to aim.'){
  window.removeEventListener('deviceorientation',handleTilt);
  clearTimeout(tilt.timer);
  tilt.origin=null;
  tiltStatus('off',message);
}

function handleTilt(event){
  if(!game.canAim||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  const angle=screen.orientation?.angle??window.orientation??0;
  if(!tilt.origin||tilt.origin.angle!==angle){
    clearTimeout(tilt.timer);
    tilt.origin={beta:event.beta,gamma:event.gamma,x:game.input.x,y:game.input.y,angle};
    tiltStatus('on','Tilt your phone to move the aim marker.');
    return;
  }
  const aim=tiltAim(tilt.origin,event,angle);
  game.aim(aim.x,aim.y);
}

async function toggleTilt(){
  if(tilt.status==='on'||tilt.status==='waiting'){stopTilt();return;}
  const sensor=window.DeviceOrientationEvent;
  if(!sensor){tiltStatus('unavailable','Tap the pitch to aim. This device has no orientation sensor.');return;}
  try{
    if(typeof sensor.requestPermission==='function'&&await sensor.requestPermission()!=='granted'){
      tiltStatus('unavailable','Motion access denied. Tap the pitch to aim.');
      return;
    }
  }catch{
    tiltStatus('unavailable','Motion access is unavailable. Tap the pitch to aim.');
    return;
  }
  if(!game.canAim)return;
  tiltStatus('waiting','Hold your phone still to calibrate tilt.');
  window.addEventListener('deviceorientation',handleTilt);
  tilt.timer=setTimeout(()=>stopTilt('No motion data received. Tap the pitch to aim.'),2500);
}
function bind(){
  button('open-setup',setup);
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
    Object.assign(config,draft,{difficulty:$('difficulty').value,venue:$('venue').value,light:$('light').value});
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
  const dock=$('control-dock');
  dock.addEventListener('input',e=>{
    const k=e.target.id;
    if(k==='pick-taker'){$('confirm-taker').disabled=e.target.value==='';return;}
    if(!['foot','power'].includes(k)||!game.canAim)return;
    game.input[k]=k==='power'?Number(e.target.value):e.target.value;
    if(k==='power')$('power-value').textContent=e.target.value+'%';
  });
  let low=false;
  dock.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const actions={'confirm-taker':()=>game.selectTaker(Number($('pick-taker').value)),tilt:toggleTilt,shoot:()=>game.press(),replay:()=>game.replay(),next:()=>game.next(),'skip-replay':()=>game.stopReplay(),'dive-low':()=>{low=!low;b.setAttribute('aria-pressed',low);}};
    if(actions[b.id])actions[b.id]();
    if(b.dataset.dive!==undefined)game.defend(Number(b.dataset.dive),!low);
  });
  let pointer=null;
  dock.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.move!==undefined){
      e.preventDefault();const key=b.dataset.move==='1'?'KeyD':'KeyA';
      pointer={id:e.pointerId,kind:key};dock.setPointerCapture(e.pointerId);game.keys.add(key);
    }
  });
  function release(e){
    if(pointer?.id!==e.pointerId)return;
    game.keys.delete(pointer.kind);
    pointer=null;
  }
  dock.addEventListener('pointerup',release);dock.addEventListener('pointercancel',release);
  dock.addEventListener('lostpointercapture',release);
  const canvas=$('stadium');
  const pointAim=e=>{
    if(!game.canAim)return;
    const p=stadium.pitchAim(e.clientX,e.clientY);
    if(p){
      if(tilt.status==='on'||tilt.status==='waiting')stopTilt();
      game.aim(p.x,p.y);
    }
  };
  canvas.addEventListener('pointerdown',e=>{
    if(game.canAim){canvas.setPointerCapture(e.pointerId);pointAim(e);}
  });
  canvas.addEventListener('pointermove',e=>{if(canvas.hasPointerCapture(e.pointerId))pointAim(e);});
  const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  window.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
    if(movement.includes(e.code)){e.preventDefault();if(tilt.status==='on')stopTilt();game.keys.add(e.code);}
    if(e.code==='Space'&&(!e.target.closest('button')||e.target.id==='shoot')){
      e.preventDefault();if(!e.repeat)game.press();
    }
    if(!e.repeat&&['KeyJ','KeyK','KeyL'].includes(e.code))game.defend({KeyJ:-1,KeyK:0,KeyL:1}[e.code],!e.shiftKey);
    if(e.code==='Enter'&&game.phase==='result'&&!e.target.closest('button'))game.next();
  });
  window.addEventListener('keyup',e=>game.keys.delete(e.code));
  window.addEventListener('blur',()=>game.keys.clear());
}

async function boot(){
  await ready;
  stadium=new Stadium($('stadium'));
  stadium.quality(preferences.quality);
  audio=new StadiumAudio(preferences);
  game=new Game(stadium,audio,sync);
  bind();game.start(config);
  let before=performance.now();
  function frame(now){
    const dt=Math.min(.05,(now-before)/1000);before=now;
    if(!document.querySelector('dialog[open]'))game.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);$('error').hidden=false;$('error').textContent=`Could not initialize the stadium. Enable WebGL 2 and reload. ${error.message}`;
});
