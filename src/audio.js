import goalUrl from './assets/goal.wav';
import savedUrl from './assets/saved.wav';

const calls={GOAL:goalUrl,SAVED:savedUrl};
const effects={
  kick:[.15,.35,150],ground:[.08,.08,105],net:[.34,.15,410],
  frame:[.29,.12,570],keeper:[.16,.24,235],whistle:[.22,.05,1690]
};
const crowdIdle=.10;

function makeMusic(context){
  const rate=22050,bar=6;
  const chords=[[48,55,62,64],[45,55,60,64],[41,53,60,67],[43,55,62,69]];
  const buffer=context.createBuffer(1,rate*bar*chords.length,rate);
  const samples=buffer.getChannelData(0);
  for(const [index,chord] of chords.entries()){
    const frequencies=chord.map(note=>2*Math.PI*440*2**((note-69)/12));
    for(let i=0;i<bar*rate;i++){
      const t=i/rate;
      const envelope=Math.sin(Math.PI*t/bar)**1.15;
      const bass=Math.sin(frequencies[0]*t)*.36;
      const pad=frequencies.slice(1).reduce((sum,f,j)=>sum+Math.sin(f*t+j*.7)*(.18-j*.026),0);
      samples[index*bar*rate+i]=(bass+pad)*envelope*.32;
    }
  }
  return buffer;
}

export class StadiumAudio {
  constructor(settings){this.settings=settings;}

  start(){
    if(!this.ctx){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      this.ctx=new Audio();
      this.master=this.ctx.createGain();
      const limiter=this.ctx.createDynamicsCompressor();
      limiter.threshold.value=-14;
      limiter.ratio.value=5;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate);
      const signal=this.noise.getChannelData(0);
      let filtered=0;
      for(let i=0;i<signal.length;i++){
        filtered=filtered*.91+(Math.random()*2-1)*.09;
        signal[i]=filtered;
      }
      const bed=this.ctx.createBufferSource();
      bed.buffer=this.noise;
      bed.loop=true;
      const filter=this.ctx.createBiquadFilter();
      filter.type='bandpass';filter.frequency.value=495;filter.Q.value=.54;
      this.crowd=this.ctx.createGain();
      this.crowd.gain.value=crowdIdle;
      bed.connect(filter).connect(this.crowd).connect(this.master);
      bed.start();
      const music=this.ctx.createBufferSource();
      music.buffer=makeMusic(this.ctx);
      music.loop=true;
      this.music=this.ctx.createGain();
      music.connect(this.music).connect(this.master);
      music.start();
      this.voices=Object.fromEntries(Object.entries(calls).map(([type,url])=>[
        type,fetch(url).then(response=>{
          if(!response.ok)throw new Error('Voice clip unavailable');
          return response.arrayBuffer();
        }).then(bytes=>this.ctx.decodeAudioData(bytes)).catch(()=>null)
      ]));
    }
    const now=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.mute?0:this.settings.volume,now,.025);
    this.music.gain.setTargetAtTime(this.settings.music?.32:0,now,.09);
    if(this.settings.mute)window.speechSynthesis?.cancel();
    this.ctx.resume().catch(()=>{});
  }

  play(type){
    if(!this.ctx||!effects[type])return;
    const now=this.ctx.currentTime;
    const [duration,volume,frequency]=effects[type];
    const gain=this.ctx.createGain();
    gain.gain.setValueAtTime(.001,now);
    gain.gain.exponentialRampToValueAtTime(volume,now+.025);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    gain.connect(this.master);
    if(type==='frame'||type==='whistle'){
      const wave=this.ctx.createOscillator();
      wave.type=type==='frame'?'triangle':'sine';
      wave.frequency.setValueAtTime(frequency,now);
      wave.frequency.exponentialRampToValueAtTime(frequency*.88,now+duration);
      wave.connect(gain);wave.start(now);wave.stop(now+duration);
    }else{
      const source=this.ctx.createBufferSource();
      source.buffer=this.noise;
      const filter=this.ctx.createBiquadFilter();
      filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;
      source.connect(filter).connect(gain);source.start(now);source.stop(now+duration);
    }
  }

  reaction(outcome){
    if(!this.ctx||this.settings.mute)return;
    const now=this.ctx.currentTime;
    this.crowd.gain.cancelScheduledValues(now);
    this.crowd.gain.setTargetAtTime(outcome==='GOAL'?.36:outcome==='SAVED'?.24:.16,now,.11);
    this.crowd.gain.setTargetAtTime(crowdIdle,now+.85,.48);
    if(this.voices[outcome])void this.playCall(outcome);
  }

  async playCall(outcome){
    const buffer=await this.voices[outcome];
    if(this.settings.mute)return;
    if(!buffer){
      this.speak(outcome==='GOAL'?'Goal!':'Saved!',.72);
      return;
    }
    window.speechSynthesis?.cancel();
    this.call?.stop();
    const now=this.ctx.currentTime;
    const voice=this.call=this.ctx.createBufferSource();
    voice.buffer=buffer;
    const direct=this.ctx.createGain();
    direct.gain.value=.74;
    voice.connect(direct).connect(this.master);
    const echo=this.ctx.createDelay(.2);
    echo.delayTime.value=.091;
    const softened=this.ctx.createBiquadFilter();
    softened.type='lowpass';softened.frequency.value=1850;
    const reflection=this.ctx.createGain();
    reflection.gain.value=.14;
    voice.connect(echo).connect(softened).connect(reflection).connect(this.master);
    voice.onended=()=>{if(this.call===voice)this.call=null;};
    voice.start(now);
  }

  speak(line,rate){
    if(!window.speechSynthesis||typeof SpeechSynthesisUtterance!=='function')return;
    const speech=new SpeechSynthesisUtterance(line);
    speech.lang='en-GB';speech.rate=rate;speech.volume=this.settings.volume;
    window.speechSynthesis.cancel();window.speechSynthesis.speak(speech);
  }

  announce(line){
    if(this.settings.mute||!this.settings.commentary)return;
    this.speak(line,1.04);
  }
}
