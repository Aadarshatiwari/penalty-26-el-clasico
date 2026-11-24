import * as T from 'three';
import {HALF,BAR,R,SPOT} from './physics.js';
import {athlete} from './animations.js';

const rand=(i)=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const lineColor=0xd5e3cb;
function grass() {
  const size=256, data=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++){
    const n=rand(i)*23;
    data.set([39+n*.65,84+n,54+n*.65,255],i*4);
  }
  const tex=new T.DataTexture(data,size,size);
  tex.colorSpace=T.SRGBColorSpace;
  tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.repeat.set(37,44);tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
  return tex;
}
function ballTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e8e8dd';ctx.fillRect(0,0,512,256);
  for(let y=0;y<5;y++) for(let x=-1;x<8;x++){
    const cx=x*75+(y%2)*37,cy=y*56+15;
    ctx.beginPath();
    for(let k=0;k<6;k++){const a=k*Math.PI/3;ctx[k?'lineTo':'moveTo'](cx+37*Math.cos(a),cy+30*Math.sin(a));}
    ctx.closePath();ctx.strokeStyle='#676c72';ctx.lineWidth=2;ctx.stroke();
    if((x+y*2)%3===0){ctx.fillStyle=(x+y)%2?'#192236':'#59305c';ctx.fill();}
  }
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function material(color,options={}) {return new T.MeshStandardMaterial({color,roughness:.87,...options});}

export class Stadium {
  constructor(canvas){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.28;
    this.scene=new T.Scene();
    this.camera=new T.PerspectiveCamera(43,1,.08,180);
    this.camera.position.set(3.65,3.40,18.4);
    this.camera.lookAt(0,1.20,1);
    this.hemi=new T.HemisphereLight(0xc2d7ff,0x566449,2.15);this.scene.add(this.hemi);
    this.key=new T.DirectionalLight(0xffebe3,3.25);this.key.position.set(-12,17,4);this.key.castShadow=true;
    Object.assign(this.key.shadow.camera,{left:-12,right:12,top:16,bottom:-14,near:1,far:48});
    this.key.shadow.mapSize.set(1024,1024);this.key.shadow.normalBias=.033;this.key.target.position.set(0,0,5);
    this.scene.add(this.key,this.key.target);
    const rally=new T.DirectionalLight(0xa4c0ff,1.5);rally.position.set(8,11,-9);this.scene.add(rally);
    this.buildPitch();
    this.buildGoal();
    this.buildBowl();
    this.ball=new T.Mesh(new T.SphereGeometry(R,28,18),material(0xffffff,{map:ballTexture(),roughness:.61}));
    this.ball.castShadow=true;this.scene.add(this.ball);
    this.marker=new T.Mesh(new T.RingGeometry(.10,.14,32),new T.MeshBasicMaterial({color:0xe9ff78,side:T.DoubleSide,depthTest:false}));
    this.marker.renderOrder=5;this.scene.add(this.marker);
    const confettiGeometry=new T.BufferGeometry();
    this.confettiBuffer=new Float32Array(330*3);
    this.confettiBuffer.fill(-30);
    confettiGeometry.setAttribute('position',new T.BufferAttribute(this.confettiBuffer,3));
    confettiGeometry.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:330},(_,i)=>new T.Color([0xe5fc77,0xffffff,0x56cfad,0xf57391][i%4]).toArray()).flat(),3));
    this.confetti=new T.Points(confettiGeometry,new T.PointsMaterial({size:.09,vertexColors:true}));
    this.confetti.frustumCulled=false;this.scene.add(this.confetti);
    this.resize();new ResizeObserver(()=>this.resize()).observe(canvas);
    this.environment('Night','madrid');
    this.ball.position.set(0,R,SPOT);
  }
  resize(){
    const {clientWidth:w,clientHeight:h}=this.renderer.domElement;
    if(!w||!h)return;
    this.camera.aspect=w/h;
    this.camera.fov=w/h<1.2?53:43;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }
  quality(value){
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='High'?1.75:value==='Medium'?1.25:1));
    this.renderer.shadowMap.enabled=value!=='Low';this.resize();
  }
  environment(time,venue){
    const day=time==='Day';this.scene.background=new T.Color(day?0x85aec7:0x081326);
    this.scene.fog=new T.FogExp2(day?0xa6bac7:0x111e37,.016);
    this.hemi.intensity=day?2.8:1.63;this.key.intensity=day?3.5:3.1;
    this.bowls.forEach((b,i)=>b.visible= (venue==='barca'?i===1:i===0));
  }
  buildPitch(){
    const turf=new T.Mesh(new T.PlaneGeometry(72,102),material(0xffffff,{map:grass()}));
    turf.rotation.x=-Math.PI/2;turf.position.z=28;turf.receiveShadow=true;this.scene.add(turf);
    const shade=new T.MeshBasicMaterial({color:0x152f22,transparent:true,opacity:.20,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    for(let z=-.1;z<72;z+=7.2){
      const strip=new T.Mesh(new T.PlaneGeometry(68,3.6),shade);
      strip.rotation.x=-Math.PI/2;strip.position.set(0,.008,z+1.8);this.scene.add(strip);
    }
    const paint=new T.MeshBasicMaterial({color:lineColor,transparent:true,opacity:.88,depthWrite:false});
    const fieldLine=(x,z,w,h)=>{
      const m=new T.Mesh(new T.PlaneGeometry(w,h),paint);m.rotation.x=-Math.PI/2;m.position.set(x,.016,z);this.scene.add(m);
    };
    fieldLine(0,.027,68,.09);
    for(const [w,d] of [[40.32,16.5],[18.32,5.5]]){
      fieldLine(0,d,w,.085);
      for(const sign of [-1,1])fieldLine(sign*w/2,d/2,.085,d);
    }
    for(const x of [-34,34])fieldLine(x,35,.09,70);
    const arc=new T.Mesh(new T.RingGeometry(9.11,9.19,68,1,Math.asin(5.5/9.15),Math.PI-2*Math.asin(5.5/9.15)),paint);
    arc.rotation.x=Math.PI/2;arc.position.set(0,.018,11);paint.side=T.DoubleSide;this.scene.add(arc);
    const spot=new T.Mesh(new T.CircleGeometry(.105,24),paint);spot.rotation.x=-Math.PI/2;spot.position.set(0,.019,SPOT);this.scene.add(spot);
  }
  buildGoal(){
    const white=material(0xfbfbef,{roughness:.38,metalness:.28});
    const tube=(x,y,z,length,radius,angle=0)=>{
      const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,18),white);
      mesh.position.set(x,y,z);mesh.rotation.z=angle;mesh.castShadow=true;this.scene.add(mesh);
    };
    for(const side of [-1,1]) tube(side*(HALF+.06),BAR/2,0,BAR,.06);
    tube(0,BAR+.06,0,2*(HALF+.06),.06,Math.PI/2);
    const pairs=[];
    const edge=(a,b)=>pairs.push(...a,...b);
    const w=HALF+.12,h=2.56,d=-2.12;
    for(let i=0;i<=48;i++){
      const x=-w+2*w*i/48;edge([x,0,d],[x,h,d]);edge([x,h,d],[x,h,0]);
    }
    for(let i=0;i<=17;i++){
      const y=h*i/17;
      edge([-w,y,d],[w,y,d]);for(const x of [-w,w])edge([x,y,d],[x,y,0]);
    }
    for(let i=0;i<=14;i++){
      const z=d*i/14;edge([-w,h,z],[w,h,z]);for(const x of [-w,w])edge([x,0,z],[x,h,z]);
    }
    // Split long spans so the mesh can deform locally.
    const segments=[];
    for(let i=0;i<pairs.length;i+=6){
      const a=pairs.slice(i,i+3),b=pairs.slice(i+3,i+6);
      const point=t=>a.map((v,j)=>v+(b[j]-v)*t);
      for(let s=0;s<20;s++)segments.push(...point(s/20),...point((s+1)/20));
    }
    this.rest=Float32Array.from(segments);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(this.rest.slice(),3));
    this.net=new T.LineSegments(geo,new T.LineBasicMaterial({color:0xe4ecff,transparent:true,opacity:.48,depthWrite:false}));
    this.scene.add(this.net);
  }
  buildBowl(){
    const crowdGeo=new T.CapsuleGeometry(.147,.27,2,5);
    const headGeo=new T.IcosahedronGeometry(.10,0);
    const crowdMat=material(0xffffff);
    const palette=[0x27334f,0x43536c,0x182336,0x778399,0x6d354a,0xaab1bc,0x334274,0x2a3850];
    const dummy=new T.Object3D();
    this.bowls=[0,1].map(venue=>{
      const bowl=new T.Group();this.scene.add(bowl);
      const people=new T.InstancedMesh(crowdGeo,crowdMat,30*385);let count=0;
      const heads=new T.InstancedMesh(headGeo,crowdMat,30*385);
      for(let row=0;row<30;row++){
        const tier=Math.floor(row/10);
        const rx=37+row*.57,rz=27+row*.51+(venue?2:0),y=.60*row+tier*.62+1;
        const rim=new T.Mesh(new T.TorusGeometry(1,.009,5,120),material(tier%2?0x283553:0x34425a));
        rim.rotation.x=Math.PI/2;rim.scale.set(rx,rz,30);rim.position.set(0,y-.32,18);bowl.add(rim);
        for(let i=0;i<385;i++){
          const phase=i/385*Math.PI*2,seed=row*385+i+venue*11550;
          if(rand(seed)<.09 || i%48===0)continue;
          dummy.position.set(rx*Math.cos(phase),y+rand(seed+8)*.30,18+rz*Math.sin(phase));
          dummy.rotation.y=-phase;
          dummy.scale.set(1,1+rand(seed+7)*.52,1);
          dummy.updateMatrix();people.setMatrixAt(count,dummy.matrix);
          people.setColorAt(count,new T.Color(palette[Math.floor(rand(seed+31)*palette.length)]));
          dummy.position.y+=.32;dummy.scale.set(1,1,1);dummy.updateMatrix();
          heads.setMatrixAt(count,dummy.matrix);
          heads.setColorAt(count++,new T.Color([0xaa795d,0x68504a,0xc6a68d,0x856356][seed%4]));
        }
      }
      people.count=heads.count=count;bowl.add(people,heads);
      bowl.userData.crowd=[people,heads];
      const fascia=material(venue?0x222653:0x2c3953);
      const flash=new T.MeshBasicMaterial({color:0xe8efff,toneMapped:false});
      const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=64;
      const paint=haloCanvas.getContext('2d');const gradient=paint.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'rgba(210,228,255,.85)');gradient.addColorStop(.14,'rgba(168,203,255,.37)');gradient.addColorStop(1,'rgba(108,150,245,0)');
      paint.fillStyle=gradient;paint.fillRect(0,0,64,64);
      const halo=new T.SpriteMaterial({map:new T.CanvasTexture(haloCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending});
      for(let j=0;j<18;j++){
        const angle=j*Math.PI/9;
        const frame=new T.Mesh(new T.BoxGeometry(8,.72,1.05),fascia);
        frame.position.set(Math.cos(angle)*51,19+(venue?1:0),18+Math.sin(angle)*39);
        frame.rotation.y=Math.PI/2-angle;bowl.add(frame);
        for(let k=0;k<9;k++){
          const bulb=new T.Mesh(new T.BoxGeometry(.46,.21,.12),flash);bulb.position.set(k*.78-3.12,.03,.6);frame.add(bulb);
          if(k%4===0){
            const sprite=new T.Sprite(halo);
            bulb.getWorldPosition(sprite.position);sprite.scale.set(4.5,4.5,1);bowl.add(sprite);
          }
        }
      }
      const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=64;
      const c=labelCanvas.getContext('2d');c.fillStyle='#18223a';c.fillRect(0,0,1024,64);
      c.fillStyle='#dfe6fe';c.font='bold 30px sans-serif';c.textAlign='center';
      c.fillText(venue?'LES CORTS  /  PENALTY 26  /  LES CORTS':'CHAMARTÍN  /  PENALTY 26  /  CHAMARTÍN',512,43);
      const texture=new T.CanvasTexture(labelCanvas);texture.colorSpace=T.SRGBColorSpace;
      const sign=new T.Mesh(new T.PlaneGeometry(33,1.10),new T.MeshBasicMaterial({map:texture}));
      sign.position.set(0,.62,-8);bowl.add(sign);
      return bowl;
    });
  }
  lineup(shooter,club,keeper,opponent,alternate){
    this.shooter?.dispose();this.keeper?.dispose();
    this.shooter=shooter?athlete(shooter,club,false,alternate):null;
    this.keeper=athlete(keeper,opponent,true,alternate);
    if(this.shooter)this.scene.add(this.shooter.group);
    this.scene.add(this.keeper.group);
  }
  cameraView(name,ball,t){
    const portrait=this.camera.aspect<1.15;
    const map={Broadcast:portrait?[-3.0,2.95,17.6,-.08,.82,7.15]:[-2.75,2.73,17.2,-.08,.82,6.7],Player:[-1.15,2.06,15.9,-.65,1.07,10.6],Center:[0,2.65,18.8,0,1.24,2],Goal:[-5,2.9,-3.9,0,.9,8],Sideline:[11,4,7,0,1,4],Replay:[7,3.1,8-t*3,ball.x*.6,.76,Math.max(0,ball.z-2)]};
    const [x,y,z,tx,ty,tz]=map[name]||map.Broadcast;
    this.camera.position.set(x,y,z);this.camera.lookAt(tx,ty,tz);
  }
  pitchAim(clientX,clientY){
    const {left,top,width,height}=this.renderer.domElement.getBoundingClientRect();
    const ray=new T.Raycaster();
    ray.setFromCamera(new T.Vector2(2*(clientX-left)/width-1,1-2*(clientY-top)/height),this.camera);
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),-.21),new T.Vector3());
  }
  draw(frame,view,visual){
    const {p,q,pose,run=0,celebrate=0,impact,elapsed=0}=frame;
    this.ball.position.copy(p);if(q)this.ball.quaternion.copy(q);else this.ball.quaternion.identity();
    const since=impact?elapsed-impact.time:99;
    const compression=since>=0&&since<.09?Math.sin(since/.09*Math.PI)*.15:0;
    const worldNormal=impact?new T.Vector3(impact.normal.x,impact.normal.y,impact.normal.z):new T.Vector3(0,1,0);
    const localNormal=worldNormal.applyQuaternion(this.ball.quaternion.clone().invert());
    this.ball.scale.set(1+compression*(.45-1.45*Math.abs(localNormal.x)),1+compression*(.45-1.45*Math.abs(localNormal.y)),1+compression*(.45-1.45*Math.abs(localNormal.z)));
    this.marker.visible=Boolean(visual.aim);
    if(visual.aim)this.marker.position.set(visual.aim.x,visual.aim.y,.21);
    this.keeper?.poseKeeper(pose);this.shooter?.poseShooter(run,celebrate);
    const attr=this.net.geometry.attributes.position;
    const netHit=visual.net;
    if(netHit || this.netActive){
      for(let i=0;i<this.rest.length;i+=3){
        const x=this.rest[i],y=this.rest[i+1],z=this.rest[i+2];
        const age=netHit?elapsed-netHit.time:4;
        const dist=netHit?Math.hypot(x-netHit.p.x,y-netHit.p.y,z-netHit.p.z):0;
        const wave=age>=0&&age<1.4?.32*Math.sin(age*31-dist*4)*Math.exp(-age*3-dist*1.8):0;
        attr.array[i+2]=z+wave*Math.min(1,Math.abs(z));
      }
      attr.needsUpdate=true;
      this.netActive=Boolean(netHit);
    }
    const stand=this.bowls.find(b=>b.visible);
    if(stand){
      const bounce=visual.crowd ? Math.sin(visual.crowd*12)*.045*Math.exp(-visual.crowd) : 0;
      stand.userData.crowd.forEach(mesh=>mesh.position.y=bounce);
    }
    this.confetti.visible=Boolean(visual.confetti);
    if(visual.confetti){
      const time=visual.confetti;
      for(let i=0;i<330;i++){
        this.confettiBuffer[i*3]=(rand(i+10)-.5)*16+(rand(i+1)-.5)*time;
        this.confettiBuffer[i*3+1]=7+rand(i+20)*7-time*(1+rand(i+5)*1.4);
        this.confettiBuffer[i*3+2]=-1+rand(i+33)*12;
      }
      this.confetti.geometry.attributes.position.needsUpdate=true;
    }
    this.cameraView(view,p,elapsed);
    this.renderer.render(this.scene,this.camera);
  }
}
