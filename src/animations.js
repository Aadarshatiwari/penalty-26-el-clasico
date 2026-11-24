import * as T from 'three';

const sphere=new T.SphereGeometry(1,16,12);
const capsule=new T.CapsuleGeometry(.5,1,5,10);
const segment=(material,width,height,depth)=>{
  const mesh=new T.Mesh(capsule,material);
  mesh.scale.set(width,height/2,depth);
  mesh.castShadow=true;
  return mesh;
};
const oval=(material,x,y,z)=>{
  const mesh=new T.Mesh(sphere,material);
  mesh.scale.set(x,y,z);
  mesh.castShadow=true;
  return mesh;
};
const mat=color=>new T.MeshStandardMaterial({color,roughness:.84});
function kitTexture(player, club, keeper, alternate) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');
  const base=new T.Color(keeper?(alternate?0xf8ad39:0x52b994):alternate?0xb13758:club.color);
  const trim=new T.Color(keeper?0x184537:club.trim);
  c.fillStyle=base.getStyle();c.fillRect(0,0,512,256);
  if(club.badge==='BC'&&!keeper&&!alternate){
    c.fillStyle=trim.getStyle();
    for(let x=24;x<512;x+=95)c.fillRect(x,0,35,256);
  }
  for(let y=0;y<256;y+=3){
    c.fillStyle=y%6?'#ffffff13':'#00000014';c.fillRect(0,y,512,1);
  }
  c.fillStyle=trim.getStyle();c.fillRect(0,0,512,33);c.fillRect(0,224,512,7);
  const ink=keeper?'#fff9d4':club.badge==='RM'&&!alternate?'#232d56':'#f9e4a3';
  const number={'Cristiano Ronaldo':7,'Lionel Messi':10,'Lamine Yamal':19,'Kylian Mbappé':10,'Zinedine Zidane':5,'Ronaldo Nazário':9,'Jude Bellingham':5,'Ronaldinho':10,'Vinícius Júnior':7}[player.name]??(keeper?1:2+player.id%23);
  c.fillStyle=ink;c.textAlign='center';c.font='900 76px sans-serif';c.fillText(String(number),128,177);
  c.font='800 14px sans-serif';
  c.fillText(player.name.toUpperCase(),128,98,150);
  c.font='900 11px sans-serif';c.fillText(club.badge,365,116);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function athlete(player,club,keeper=false,alternate=false) {
  const group=new T.Group();
  const texture=kitTexture(player,club,keeper,alternate);
  const shirt=new T.MeshStandardMaterial({map:texture,roughness:.82});
  const socks=mat(keeper?0x397e66:alternate?0x8e3050:club.color);
  const sleeveMaterial=mat(keeper?0x52b994:alternate?0xb13758:club.color);
  const shorts=mat(keeper?0x183b42:alternate?0x2a182a:club.trim);
  const skin=mat([0xbb7959,0xe1ad86,0x765040,0x9a6048,0xc58f70][player.id%5]);
  const hair=mat([0x201713,0x423029,0x151618,0x684934][player.id%4]);
  const glove=mat(0xf5e6a6);
  const boots=mat(0x171b26);
  const build=.92+player.weight/1000;
  const torso=segment(shirt,.54*build,.66,.32);
  const head=oval(skin,.114,.146,.113);
  const hairMesh=oval(hair,.115,.075,.116);
  const hips=segment(shorts,.38,.28,.26);
  const neck=oval(skin,.071,.095,.071);
  neck.position.set(0,-.005,0);
  // Facial features use world-size offsets on an unscaled parent.
  const face=new T.Group();
  const eyeWhite=mat(0xe4d6c9), iris=mat(0x292229);
  for(const sign of [-1,1]){
    const eye=oval(eyeWhite,.021,.011,.006);eye.position.set(sign*.044,.019,-.098);
    const pupil=oval(iris,.009,.009,.005);pupil.position.set(sign*.044,.019,-.104);
    const brow=oval(hair,.024,.006,.007);brow.position.set(sign*.044,.038,-.096);
    face.add(eye,pupil,brow);
    const ear=oval(skin,.025,.039,.025);ear.position.set(sign*.108,-.002,0);face.add(ear);
  }
  const nose=oval(skin,.022,.033,.026);nose.position.set(0,-.013,-.107);
  const mouth=oval(iris,.034,.004,.007);mouth.position.set(0,-.055,-.099);
  face.add(nose,mouth);
  const collar=oval(shorts,.10,.035,.093);
  const sleeves=[-1,1].map(sign=>{
    const sleeve=oval(sleeveMaterial,.125,.16,.115);sleeve.position.set(sign*.237,1.416,0);return sleeve;
  });
  const arms=[0,1].map(()=>segment(sleeveMaterial,.18,.55,.18));
  const hands=[0,1].map(()=>oval(keeper?glove:skin,.095,.10,.078));
  const legs=[0,1].map(()=>segment(shorts,.22,.58,.22));
  const calves=[0,1].map(()=>segment(socks,.16,.48,.16));
  const knees=[0,1].map(()=>oval(skin,.098,.126,.101));
  const feet=[0,1].map(()=>oval(boots,.093,.068,.154));
  group.add(torso,head,face,neck,collar,hairMesh,hips,...sleeves,...arms,...hands,...legs,...calves,...knees,...feet);
  const place=(mesh,point)=>{mesh.position.set(point.x,point.y,point.z);mesh.rotation.z=point.angle;};
  const poseKeeper=parts=>{
    place(torso,parts[0]);
    place(hips,{...parts[0],y:parts[0].y-.24});
    place(head,parts[5]);place(face,parts[5]);
    place(neck,{...parts[5],y:parts[5].y-.14});place(collar,{...parts[5],y:parts[5].y-.22});
    place(hairMesh,{...parts[5],y:parts[5].y+.095});
    for(let i=0;i<2;i++){
      place(arms[i],parts[i+1]);
      place(sleeves[i],{...parts[i+1],y:parts[i+1].y+.11});
      place(hands[i],parts[i+3]);
      place(legs[i],parts[i+6]);
      place(calves[i],{...parts[i+6],y:Math.max(.18,parts[i+6].y-.29)});
      place(feet[i],{...parts[i+6],y:Math.max(.08,parts[i+6].y-.49)});
      place(knees[i],{...parts[i+6],y:Math.max(.26,parts[i+6].y-.16)});
    }
  };
  const poseShooter=(t,celebrate=0)=>{
    const side=player.foot==='Left'?1:-1;
    const run=Math.min(1,Math.max(0,t));
    const offset=player.runup==='Arc'?1.65:1.05;
    group.position.set(side*(.30+(1-run)*offset),0,11-.04+(1-run)*2.42);
    group.rotation.y=-side*(.12+.18*(1-run));
    group.scale.setScalar(player.height/1.82);
    const stride=Math.sin(run*Math.PI*(player.runup==='Stutter'?9:6))*Math.sin(run*Math.PI);
    const follow=Math.sin(Math.min(1,Math.max(0,t-.83)/.37)*Math.PI);
    const bounce=celebrate===1?Math.abs(Math.sin(t*9))*.13:Math.abs(stride)*.065;
    torso.position.set(0,1.28+bounce,0);
    torso.rotation.z=side*(.08*stride+.15*follow);
    hips.position.set(0,.92+bounce,0);
    head.position.set(0,1.70+bounce,0);face.position.copy(head.position);
    neck.position.set(0,1.553+bounce,0);collar.position.set(0,1.51+bounce,0);
    hairMesh.position.set(0,1.79+bounce,0);
    for(let i=0;i<2;i++){
      const sign=i===0?-1:1;
      const strike=(side===sign?follow:0);
      legs[i].position.set(sign*.14,.69+bounce,stride*sign*.15-strike*.19);
      legs[i].rotation.x=stride*sign*.67-strike*1.14;
      calves[i].position.set(sign*.14,.32+bounce+strike*.2,stride*sign*.27-strike*.43);
      calves[i].rotation.x=stride*sign*.45-strike*1.32;
      knees[i].position.lerpVectors(legs[i].position,calves[i].position,.58);
      sleeves[i].position.y=1.411+bounce;
      feet[i].position.set(sign*.14,.084+bounce+strike*.37,stride*sign*.34-strike*.60);
      const gesture=celebrate===1?(player.celebration==='Arms wide'?1:player.celebration==='Salute'?(i===0?1.75:.15):1.25+Math.sin(t*13)*.53):0;
      arms[i].position.set(sign*(.30+gesture*.09),1.22+bounce+gesture*.09,stride*sign*.14);
      arms[i].rotation.z=sign*(.31+gesture);
      arms[i].rotation.x=stride*sign*.45;
      hands[i].position.set(sign*(.37+gesture*.21),.96+bounce+gesture*.30,stride*sign*.26);
    }
  };
  return {group,poseKeeper,poseShooter,dispose(){group.removeFromParent();texture.dispose();[shirt,sleeveMaterial,socks,shorts,skin,hair,glove,boots,eyeWhite,iris].forEach(m=>m.dispose());}};
}
