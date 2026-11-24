export class StadiumAudio {
  constructor(settings){this.settings=settings;}
  start(){
    if(!this.ctx){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      this.ctx=new Audio();
      this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);
      const size=this.ctx.sampleRate*3;
      this.noise=this.ctx.createBuffer(1,size,this.ctx.sampleRate);
      const signal=this.noise.getChannelData(0);
      let filtered=0;
      for(let i=0;i<size;i++){filtered=filtered*.91+(Math.random()*2-1)*.09;signal[i]=filtered;}
      const bed=this.ctx.createBufferSource();bed.buffer=this.noise;bed.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=610;filter.Q.value=.48;
      this.crowd=this.ctx.createGain();this.crowd.gain.value=.19;
      bed.connect(filter).connect(this.crowd).connect(this.master);bed.start();
      const chant=this.ctx.createOscillator(), envelope=this.ctx.createGain(), level=this.ctx.createGain();
      chant.type='sine';chant.frequency.value=.62;level.gain.value=.065;
      chant.connect(level).connect(envelope.gain);
      filter.connect(envelope).connect(this.master);chant.start();
    }
    this.master.gain.value=this.settings.mute?0:this.settings.volume;
    this.ctx.resume().catch(()=>{});
  }
  play(type){
    if(!this.ctx)return;
    const now=this.ctx.currentTime;
    const effects={kick:[.18,.56,145],ground:[.09,.14,100],net:[.48,.22,460],frame:[.42,.23,680],keeper:[.19,.37,240],goal:[1.8,1.1,730],miss:[.8,.30,390],whistle:[.35,.12,2020]};
    const spec=effects[type];if(!spec)return;
    const [duration,volume,frequency]=spec;
    const gain=this.ctx.createGain();gain.gain.setValueAtTime(.001,now);
    gain.gain.exponentialRampToValueAtTime(volume,now+.025);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);gain.connect(this.master);
    if(type==='frame'||type==='whistle'){
      const wave=this.ctx.createOscillator();wave.type=type==='frame'?'triangle':'sine';
      wave.frequency.setValueAtTime(frequency,now);wave.frequency.exponentialRampToValueAtTime(frequency*.85,now+duration);
      wave.connect(gain);wave.start(now);wave.stop(now+duration);
    }else{
      const source=this.ctx.createBufferSource();source.buffer=this.noise;
      const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;
      source.connect(filter).connect(gain);source.start(now);source.stop(now+duration);
    }
  }
  reaction(outcome){
    if(!this.ctx||this.settings.mute)return;
    const now=this.ctx.currentTime;
    const boo=outcome!=='GOAL';
    const duration=boo?2.45:2.9;
    const bus=this.ctx.createGain();
    bus.gain.setValueAtTime(.001,now);
    bus.gain.exponentialRampToValueAtTime(boo?.16:.20,now+.22);
    bus.gain.exponentialRampToValueAtTime(.001,now+duration);
    bus.connect(this.master);
    const low=this.ctx.createBiquadFilter(),high=this.ctx.createBiquadFilter();
    low.type=high.type='bandpass';low.frequency.value=boo?365:735;high.frequency.value=boo?785:1390;
    low.Q.value=.95;high.Q.value=1.8;
    low.connect(bus);high.connect(bus);
    for(let i=0;i<14;i++){
      const voice=this.ctx.createOscillator(), level=this.ctx.createGain(),start=now+i*.027;
      voice.type=i%3===0?'sawtooth':'triangle';
      const pitch=(boo?97:132)+i*(boo?4.7:7.1);
      voice.frequency.setValueAtTime(pitch,start);
      voice.frequency.linearRampToValueAtTime(pitch*(boo?.79:1.19),start+.25+i*.013);
      voice.frequency.exponentialRampToValueAtTime(pitch*(boo?.68:.81),now+duration);
      level.gain.setValueAtTime(.001,start);
      level.gain.exponentialRampToValueAtTime(.15,start+.18);
      level.gain.exponentialRampToValueAtTime(.001,now+duration-.14);
      voice.connect(level);level.connect(low);level.connect(high);
      voice.start(start);voice.stop(now+duration+.02);
    }
    this.crowd.gain.cancelScheduledValues(now);
    this.crowd.gain.setTargetAtTime(boo?.42:.78,now,.12);
    this.crowd.gain.setTargetAtTime(.19,now+1.1,.78);
  }
  announce(line){
    if(this.settings.mute||!this.settings.commentary||!window.speechSynthesis)return;
    const speech=new SpeechSynthesisUtterance(line);speech.lang='en-GB';speech.rate=1.04;speech.volume=this.settings.volume;
    window.speechSynthesis.cancel();window.speechSynthesis.speak(speech);
  }
}
