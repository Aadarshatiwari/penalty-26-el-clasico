import * as T from 'three';

const numbers={
  'Cristiano Ronaldo':7,'Lionel Messi':10,'Lamine Yamal':19,'Kylian Mbappé':10,
  'Zinedine Zidane':5,'Ronaldo Nazário':9,'Jude Bellingham':5,'Ronaldinho':10,
  'Vinícius Júnior':7,'Thibaut Courtois':1,'Iker Casillas':1
};

const baseGeometry=new T.CylinderGeometry(.51,.48,.17,48);
const rimGeometry=new T.CylinderGeometry(.49,.51,.043,48);
const faceGeometry=new T.CircleGeometry(.456,48);
const baseHeight=.085;

function numberFace(number,club,keeper,alternate){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');
  const light=club.badge==='RM'&&!alternate&&!keeper;
  const background=keeper?(alternate?'#dba24a':'#15795d'):light?'#f1eedf':alternate?'#8f3152':'#383477';
  const highlight=keeper?(alternate?'#fff1c4':'#8fe1be'):light?'#fffdf2':alternate?'#c66a8d':'#6c67ae';
  const gradient=c.createLinearGradient(0,0,256,256);
  gradient.addColorStop(0,highlight);gradient.addColorStop(.74,background);
  c.fillStyle=gradient;c.fillRect(0,0,256,256);
  c.beginPath();c.arc(128,128,112,0,Math.PI*2);
  c.strokeStyle=light?'#2e386339':'#ffffff4a';c.lineWidth=3;c.stroke();
  c.beginPath();c.arc(128,128,105,0,Math.PI*2);
  c.strokeStyle=light?'#ffffffb3':'#12132682';c.lineWidth=2;c.stroke();
  c.textAlign='center';c.textBaseline='middle';c.font='900 145px system-ui, sans-serif';
  c.fillStyle=light||keeper&&alternate?'#192545':'#fffae4';
  c.fillText(String(number),128,135,184);
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

export function playerDisc(player,club,keeper=false,alternate=false){
  const group=new T.Group();
  const number=numbers[player.name]??(keeper?1:2+player.id%23);
  const texture=numberFace(number,club,keeper,alternate);
  const side=keeper?(alternate?0x6e4723:0x194135):alternate?0x44192b:club.trim;
  const trim=keeper?(alternate?0xeabe73:0x82c8a6):club.badge==='RM'&&!alternate?0xb3a66b:0x9d4d77;
  const baseMaterial=new T.MeshStandardMaterial({color:side,roughness:.37,metalness:.25});
  const rimMaterial=new T.MeshStandardMaterial({color:trim,roughness:.34,metalness:.39});
  const faceMaterial=new T.MeshStandardMaterial({map:texture,roughness:.69});
  const base=new T.Mesh(baseGeometry,baseMaterial);
  const rim=new T.Mesh(rimGeometry,rimMaterial);
  const face=new T.Mesh(faceGeometry,faceMaterial);
  base.castShadow=true;
  rim.position.y=.101;
  face.position.y=.124;
  face.rotation.x=-Math.PI/2;
  group.add(base,rim,face);
  const scale=keeper?1.24:1.16;
  group.scale.setScalar(scale);

  function poseKeeper(parts){
    const {x,y,z,angle}=parts[0];
    const tilt=angle*.19;
    const edgeLift=Math.abs(Math.sin(tilt))*.52*scale;
    group.position.set(x,baseHeight*scale+edgeLift+Math.max(0,y-player.height*.62)*.55,z);
    group.rotation.z=tilt;
  }

  function poseShooter(t,celebrate=0,foot=player.foot){
    const side=foot==='Left'?1:-1;
    const run=T.MathUtils.clamp(t,0,1);
    const distance=1-run;
    const arc=player.runup==='Arc'?1.02:.72;
    const bounce=celebrate?Math.abs(Math.sin(t*8))*.19:0;
    group.position.set(side*(.48+distance*arc),baseHeight*scale+bounce,11.37+distance*1.24);
    group.rotation.y=celebrate?Math.sin(t*4)*.45:0;
  }

  return {group,poseKeeper,poseShooter,dispose(){
    group.removeFromParent();
    texture.dispose();baseMaterial.dispose();rimMaterial.dispose();faceMaterial.dispose();
  }};
}
