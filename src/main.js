import './style.css';
import {ready,HALF,BAR} from './physics.js';
import {clubs} from './players.js';
import {Stadium} from './render.js';
import {StadiumAudio} from './audio.js';
import {Game} from './game.js';
import {OnlineRoom,validRoom} from './online.js';
import {tiltAim} from './tilt.js';

const $=id=>document.getElementById(id);
const config={mode:'solo',clubs:['madrid','barca'],difficulty:'Pro',venue:'madrid',light:'Night'};
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
if(old?.clubs?.length===2&&old.clubs.every(club=>Object.hasOwn(clubs,club))){
  for(const key of Object.keys(config))if(Object.hasOwn(old,key))config[key]=old[key];
}
let game, stadium, audio, draft, room;
const invite=new URLSearchParams(location.search).get('room');
let joinId=validRoom(invite)?invite:null;
if(!['solo','local','practice'].includes(config.mode))config.mode='solo';
const tilt={status:'off',origin:null,previous:null,timer:null};
const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
const humanLabel=(side)=>game.online?side===game.onlineSide?'You':'Friend':game.mode==='local'?`Player ${side+1}`:side===0?'You':'CPU';

function button(id,fn){$(id).addEventListener('click',fn);}
function setup(){
  draft=structuredClone(config);
  $('difficulty').value=draft.difficulty;$('venue').value=draft.venue;$('light').value=draft.light;
  renderSetup();$('setup').showModal();
}
function renderSetup(){
  $('modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===draft.mode));
  $('lineups').innerHTML=draft.clubs.map((id,i)=>`<section class="lineup"><label>${i===0?'Player 1':draft.mode==='local'?'Player 2':'Opponent'} <select data-club="${i}" aria-label="Club for side ${i+1}">${Object.entries(clubs).map(([k,c])=>`<option value="${k}" ${k===id?'selected':''}>${c.name}</option>`).join('')}</select></label></section>`).join('');
}
function kickDots(kicks){
  const start=Math.max(0,kicks.length-7);
  return Array.from({length:Math.max(5,kicks.length-start)},(_,i)=>{
    const value=kicks[start+i];return `<i class="${value===undefined?'':value?'good':'bad'}" title="${value===undefined?'Pending':value?'Goal':'Missed'}"></i>`;
  }).join('');
}
function announce(tag,title,description){
  $('announcement').hidden=!title;
  if(title){
    $('announcement-tag').textContent=tag;$('announcement-title').textContent=title;$('announcement-description').textContent=description;
  }
}
function sync(){
  if(!game.config)return;
  if(!game.canAim&&(tilt.status==='on'||tilt.status==='waiting'))stopTilt();
  const {phase,shooter,attack,keeperPlayer,scores}=game;
  const {clubs:teams,venue,light}=game.config;
  for(const [i,label] of ['home','away'].entries()){
    const team=clubs[teams[i]];
    $(label+'-badge').textContent=team.badge;$(label+'-badge').className='crest '+(team.badge==='RM'?'madrid':'barca');
    $(label+'-short').textContent=team.short;$(label+'-kicks').innerHTML=game.isMatch?kickDots(scores.kicks[i]):'';
  }
  $('venue-label').textContent=`${clubs[venue].venue.toUpperCase()} · ${light.toUpperCase()}`;
  $('score').innerHTML=game.isMatch?`${scores.goals[0]} <i>–</i> ${scores.goals[1]}`:`${game.scored} <i>/</i> ${game.attempts}`;
  $('round-label').textContent=game.isMatch?(Math.max(...scores.kicks.map(k=>k.length))>=5&&Math.min(...scores.kicks.map(k=>k.length))>=5?'SUDDEN DEATH':`ROUND ${String(Math.min(5,Math.min(...scores.kicks.map(k=>k.length))+1)).padStart(2,'0')}`):'TRAINING';
  $('player-card').innerHTML=`<span class="rating">${shooter.rating}</span><span class="eyebrow">${humanLabel(attack).toUpperCase()} · PENALTY TAKER</span><h2>${shooter.name}</h2><p>${shooter.nation} · ${shooter.position}</p>`;
  const dock=$('control-dock');
  dock.classList.toggle('shot-dock',game.canAim);
  const leave=dock.contains(document.activeElement)?document.activeElement.id:'';
  if(phase==='result'){
    const winner=scores.winner;
    const info=winner!==null?`${humanLabel(winner)} · ${clubs[teams[winner]].name} · ${scores.goals.join('–')}`:
      `${shooter.name} against ${keeperPlayer.name}`;
    announce(winner!==null?'FINAL SCORE':'PENALTY RESULT',winner!==null?'VICTORY':game.outcome,info);
    dock.innerHTML=`<button id="replay" class="span-two">Slow-motion replay</button><button id="next" class="primary span-two">${winner!==null?'Rematch':game.isMatch?'Next penalty':'Take another kick'}</button>`;
  }else if(phase==='replay'){
    announce('','','');dock.innerHTML='<span class="eyebrow span-two">SLOW-MOTION REPLAY</span><button id="skip-replay" class="span-two">End replay</button>';
  }else{
    announce('','','');
    const defend=game.canDefend;
    if(defend){
      dock.innerHTML=`<span class="eyebrow span-two">${humanLabel(1-attack)} in goal</span><span class="span-two">${keeperPlayer.name}</span>
        <button data-dive="-1">Dive left</button><button data-dive="0">Jump</button><button data-dive="1">Dive right</button><button id="dive-low" aria-pressed="false">Low dive</button>
        <button data-move="-1" class="span-two">Move left</button><button data-move="1" class="span-two">Move right</button>`;
    }else if(phase==='ready'){
      dock.innerHTML=`<button id="tilt" ${touchDevice?'':'hidden'} aria-pressed="${tilt.status==='on'}">${tilt.status==='on'?'Tilt on':tilt.status==='waiting'?'Waiting for tilt…':tilt.status==='unavailable'?'Tilt unavailable':'Tilt to aim'}</button>
        <button class="primary shoot" id="shoot">Shoot</button>
        <span class="aim-help" id="aim-help" aria-live="polite">${touchDevice?'Swipe toward the goal and release to shoot.':'Click the goal or use WASD to aim.'}</span>`;
    }else if(phase==='run'){
      dock.innerHTML='<span class="eyebrow span-two">RUN-UP</span>';
    }else{
      dock.innerHTML='<span class="eyebrow span-two">BALL IN PLAY</span><span class="span-two">Watching the goal line</span>';
    }
  }
  if(leave && $(leave) && leave!=='shoot')$(leave).focus({preventScroll:true});
  $('hint').innerHTML=game.canDefend?'MOVE <kbd>A</kbd><kbd>D</kbd> &nbsp; DIVE <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> &nbsp; LOW <kbd>SHIFT</kbd>':
    'AIM <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp; SHOOT <kbd>SPACE</kbd>';
}

function tiltStatus(status,message){
  tilt.status=status;
  if($('tilt')){
    $('tilt').textContent={off:'Tilt to aim',waiting:'Waiting for tilt…',on:'Tilt on',unavailable:'Tilt unavailable'}[status];
    $('tilt').setAttribute('aria-pressed',status==='on');
  }
  if($('aim-help'))$('aim-help').textContent=message;
}

function stopTilt(message='Swipe toward the goal and release to shoot.'){
  window.removeEventListener('deviceorientation',handleTilt);
  clearTimeout(tilt.timer);
  tilt.origin=null;tilt.previous=null;
  tiltStatus('off',message);
}

function handleTilt(event){
  if(!game.canAim||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  const angle=screen.orientation?.angle??window.orientation??0;
  if(!tilt.origin||tilt.origin.angle!==angle){
    clearTimeout(tilt.timer);
    tilt.origin={beta:event.beta,gamma:event.gamma,x:game.input.x,y:game.input.y,angle};
    tilt.previous={y:game.input.y,time:performance.now()};
    tiltStatus('on','Tilt to aim. Flick forward quickly to shoot.');
    return;
  }
  const aim=tiltAim(tilt.origin,event,angle);
  const time=performance.now();
  const elapsed=time-tilt.previous.time;
  const movement=aim.y-tilt.previous.y;
  if(elapsed<=120&&movement>.18&&movement/Math.max(10,elapsed)>.012){
    game.press();
    return;
  }
  tilt.previous={y:aim.y,time};
  game.aim(aim.x,aim.y);
}

async function toggleTilt(){
  if(tilt.status==='on'||tilt.status==='waiting'){stopTilt();return;}
  audio.start();
  const sensor=window.DeviceOrientationEvent;
  if(!sensor){tiltStatus('unavailable','Swipe to shoot. This device has no orientation sensor.');return;}
  try{
    if(typeof sensor.requestPermission==='function'&&await sensor.requestPermission()!=='granted'){
      tiltStatus('unavailable','Motion access denied. Swipe to shoot.');
      return;
    }
  }catch{
    tiltStatus('unavailable','Motion access is unavailable. Swipe to shoot.');
    return;
  }
  if(!game.canAim)return;
  tiltStatus('waiting','Hold your phone still to calibrate tilt.');
  window.addEventListener('deviceorientation',handleTilt);
  tilt.timer=setTimeout(()=>stopTilt('No motion data received. Swipe to shoot.'),2500);
}
function roomStatus(message){
  $('room-status').textContent=message;
}
function onlineDialog(message){
  roomStatus(message||(game.online?'You’re connected to your friend.':
    joinId?'Your friend invited you to a match.':'Create a room and send the link to your friend.'));
  $('room-action').textContent=joinId?'Join match':'Create room';
  $('room-action').hidden=Boolean(room);
  $('leave-room').hidden=!room;
  if(!room)$('room-invite').hidden=true;
  if(!$('online').open)$('online').showModal();
}
function endRoom(){
  room?.close();room=null;
  joinId=null;
  const url=new URL(location.href);
  if(url.searchParams.has('room')){
    url.searchParams.delete('room');history.replaceState(null,'',url);
  }
  $('open-online').textContent='Play online';
  game.setNetwork(null,null);
  if(game.online)game.start(config);
}
function connectRoom(){
  if(room)return;
  audio.start();
  const target=joinId;
  const session=new OnlineRoom({
    waiting(id){
      const link=new URL(location.pathname,location.origin);
      link.searchParams.set('room',id);
      $('room-link').value=link.href;
      $('room-invite').hidden=false;
      roomStatus('Waiting for your friend. Keep this tab open and share the invite link.');
    },
    connected(host){
      $('open-online').textContent='Online match';
      game.setNetwork(host?0:1,message=>session.send(message));
      if(host){
        game.start({...config,mode:'online'});
        $('online').close();
      }else roomStatus('Connected. Waiting for the match to start…');
    },
    message(message){
      if(session.host&&message.type==='command')game.receiveCommand(message);
      if(!session.host&&message.type==='state'&&game.receiveState(message)){
        session.started();
        if($('online').open&&$('room-status').textContent.startsWith('Connected.'))$('online').close();
      }
    },
    ended(message){
      if(room!==session)return;
      endRoom();onlineDialog(message);
    }
  });
  room=session;
  onlineDialog(target?'Joining your friend…':'Creating your room…');
  session.open(target).catch(()=>session.fail('The online service could not start. Try again.'));
}

function bind(){
  button('open-setup',setup);
  button('open-online',()=>onlineDialog());
  button('room-action',connectRoom);
  button('close-online',()=>$('online').close());
  button('leave-room',()=>{endRoom();$('online').close();});
  button('copy-room',async()=>{
    const link=$('room-link');
    try{
      await navigator.clipboard.writeText(link.value);
      roomStatus('Invite copied. Send it to your friend.');
    }catch{
      link.focus();link.select();roomStatus('Copy the selected link and send it to your friend.');
    }
  });
  $('online').addEventListener('close',()=>{if(room&&!game.online)endRoom();});
  button('open-settings',()=>$('settings').showModal());
  $('modes').addEventListener('click',e=>{if(e.target.dataset.mode){draft.mode=e.target.dataset.mode;renderSetup();}});
  $('lineups').addEventListener('change',e=>{
    const side=Number(e.target.dataset.club);if(!Number.isInteger(side))return;
    draft.clubs[side]=e.target.value;
  });
  $('setup-form').addEventListener('submit',e=>{
    if(e.submitter?.value!=='start')return;
    if(room)endRoom();
    Object.assign(config,draft,{difficulty:$('difficulty').value,venue:$('venue').value,light:$('light').value});
    audio.start();game.start(config);save();
  });
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
  let low=false;
  dock.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const actions={tilt:toggleTilt,shoot:()=>game.press(),replay:()=>game.replay(),next:()=>game.next(),'skip-replay':()=>game.stopReplay(),'dive-low':()=>{low=!low;b.setAttribute('aria-pressed',low);}};
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
  let gesture=null;
  function aimPointer(event){
    const target=stadium.pitchAim(event.clientX,event.clientY);
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(target&&Math.abs(target.x)<=HALF+.25&&target.y>=0&&target.y<=BAR+.25){
      game.aim(target.x,target.y);
    }else if(gesture.touch&&Math.hypot(dx,dy)>=12){
      const span=Math.max(75,Math.min(canvas.clientWidth,canvas.clientHeight)*.29);
      game.aim(dx/span*HALF,BAR*.47-dy/span*BAR*.75);
    }else if(!gesture.touch&&target){
      game.aim(target.x,target.y);
    }
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!game.canAim||gesture||event.button!==0)return;
    if(tilt.status==='on'||tilt.status==='waiting')stopTilt();
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,touch:event.pointerType!=='mouse'};
    canvas.setPointerCapture(event.pointerId);
    if(!gesture.touch)aimPointer(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(game.canAim&&event.pointerId===gesture?.id)aimPointer(event);
  });
  canvas.addEventListener('pointerup',event=>{
    if(event.pointerId!==gesture?.id)return;
    if(game.canAim){
      aimPointer(event);
      if(gesture.touch&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>=12)game.press();
    }
    gesture=null;
  });
  function cancelGesture(event){
    if(event.pointerId===gesture?.id)gesture=null;
  }
  canvas.addEventListener('pointercancel',cancelGesture);
  canvas.addEventListener('lostpointercapture',cancelGesture);
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
  if(joinId)onlineDialog();
  let before=performance.now();
  function frame(now){
    const dt=Math.min(.05,(now-before)/1000);before=now;
    if(game.online||!document.querySelector('dialog[open]'))game.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch(error=>{
  console.error(error);$('error').hidden=false;$('error').textContent=`Could not initialize the stadium. Enable WebGL 2 and reload. ${error.message}`;
});
