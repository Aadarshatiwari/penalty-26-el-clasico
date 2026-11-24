const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;

export class Keeper {
  constructor(player, difficulty, human = false) {
    this.player = player;
    this.human = human;
    this.level = { Rookie:0, Pro:1, Legend:2 }[difficulty] ?? 1;
    this.delay = .30-this.level*.052-(player.reflex-80)*.0023;
    this.reset();
  }
  reset() {
    this.x=0;
    this.desired=0;
    this.diveTime=null;
    this.direction=0;
    this.high=false;
  }
  command(x,high,time) {
    if (this.diveTime!==null) return;
    this.direction=clamp(x,-1,1);
    this.high=high;
    this.diveTime=time;
  }
  update(time,dt,position,velocity,move=0) {
    if (this.human && this.diveTime===null) {
      this.x=clamp(this.x+move*dt*2.3,-2.9,2.9);
    } else if (!this.human && time>=this.delay && this.diveTime===null && velocity.z<-1) {
      const remaining=clamp(position.z/(-velocity.z),0,.9);
      const estimate=position.x+velocity.x*remaining + Math.sin(position.x*7+this.player.id)*(.62-this.level*.225);
      const height=position.y+velocity.y*remaining-4.905*remaining**2;
      this.desired=clamp(estimate*(.25+this.player.positioning*.0032),-.85,.85);
      this.x=lerp(this.x,this.desired,dt*8);
      if (remaining < .46 + this.level*.035) this.command(clamp((estimate-this.x)/1.42,-1,1),height>1.1,time);
    }
    return this.pose(time);
  }
  pose(time) {
    const t=this.diveTime===null?0:clamp((time-this.diveTime)/.62,0,1);
    const flight=Math.sin(Math.PI*t);
    const direction=this.direction;
    const slide=(1-(1-t)**3)*direction*(.9+this.player.dive*.014);
    const angle=-direction*Math.min(1.33,t*3.1);
    const x=this.x+slide;
    const y=Math.max(.37,this.player.height*.62 - Math.abs(direction)*t*.69 + flight*(this.high?.76:.20));
    const extension=(this.diveTime===null?0:Math.min(1,t*6))*(.81+this.player.reach*.0023);
    const c=Math.cos(angle),s=Math.sin(angle);
    const point=(px,py,a=0)=>({x:x+px*c-py*s,y:Math.max(.12,y+px*s+py*c),z:.09,angle:angle+a});
    return [
      point(0,0),point(-.32-extension*.28,.09+extension*.23,.80+extension*.38),
      point(.32+extension*.28,.09+extension*.23,-.80-extension*.38),
      point(-.49-extension*.38,-.08+extension*.63),point(.49+extension*.38,-.08+extension*.63),
      point(0,.47),point(-.15,-.53,-.12),point(.15,-.53,.12)
    ];
  }
}
