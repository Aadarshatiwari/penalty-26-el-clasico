const roomPattern=/^p26-[0-9a-f]{32}$/;
export const validRoom=id=>typeof id==='string'&&roomPattern.test(id);

export class OnlineRoom {
  constructor(events){
    this.events=events;
  }
  async open(id){
    const {default:Peer}=await import('peerjs');
    if(this.closed)return;
    this.host=!id;
    this.id=id||'p26-'+crypto.randomUUID().replaceAll('-','');
    this.peer=this.host?new Peer(this.id):new Peer();
    this.timer=setTimeout(()=>this.fail('Connection timed out. Check the invite and keep both browsers open.'),18000);
    this.peer.on('open',()=>{
      if(this.host){
        clearTimeout(this.timer);
        this.events.waiting(this.id);
      }else this.attach(this.peer.connect(this.id,{label:'penalty26-v1',serialization:'json',reliable:true}));
    });
    this.peer.on('connection',connection=>{
      if(this.host&&connection.label==='penalty26-v1'&&!this.connection)this.attach(connection);
      else connection.close();
    });
    this.peer.on('error',error=>{
      if(this.connection?.open&&error.type==='network')return;
      const message=error.type==='peer-unavailable'?'Room unavailable. Ask your friend to create a new link.':
        'Could not connect. Check your connection or try another network.';
      this.fail(message);
    });
    this.peer.on('disconnected',()=>{
      if(!this.connection?.open)this.fail('Lost contact with the room service. Try creating or joining again.');
    });
  }
  attach(connection){
    this.connection=connection;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.fail('The browsers could not reach each other. Try another network.'),18000);
    connection.on('data',message=>{
      if(!this.closed&&message&&typeof message==='object')this.events.message(message);
    });
    connection.on('open',()=>{
      clearTimeout(this.timer);
      this.events.connected(this.host);
      if(!this.host)this.timer=setTimeout(()=>this.fail('The room did not start. Ask your friend for a fresh link.'),12000);
    });
    connection.on('close',()=>this.fail('Your friend left the room. Create a new room to play again.'));
    connection.on('error',()=>this.fail('The connection to your friend was interrupted.'));
  }
  send(message){
    if(this.connection?.open&&!this.closed)this.connection.send(message);
  }
  started(){
    clearTimeout(this.timer);
  }
  fail(message){
    if(this.closed)return;
    this.close();
    this.events.ended(message);
  }
  close(){
    if(this.closed)return;
    this.closed=true;
    clearTimeout(this.timer);
    this.peer?.destroy();
  }
}
