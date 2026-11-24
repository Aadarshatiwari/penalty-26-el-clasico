import * as T from 'three';

const shirtNumbers={
  'Cristiano Ronaldo':7,'Lionel Messi':10,'Lamine Yamal':19,'Kylian Mbappé':10,
  'Zinedine Zidane':5,'Ronaldo Nazário':9,'Jude Bellingham':5,'Ronaldinho':10,
  'Vinícius Júnior':7,'Thibaut Courtois':1,'Iker Casillas':1
};

function fabric(player,club,keeper,alternate){
  const base=keeper?(alternate?0xffb84c:0x49c393):alternate?0xb13758:club.color;
  const trim=keeper?0x184537:club.trim;
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=512;
  const c=canvas.getContext('2d');
  c.fillStyle=new T.Color(base).getStyle();
  c.fillRect(0,0,1024,512);
  if(club.badge==='BC'&&!keeper&&!alternate){
    c.fillStyle=new T.Color(trim).getStyle();
    for(let x=0;x<1024;x+=128)c.fillRect(x,0,52,512);
  }
  for(let y=0;y<512;y+=4){
    c.fillStyle=y%8?'#ffffff15':'#00000012';
    c.fillRect(0,y,1024,1);
  }
  for(let x=0;x<1024;x+=257){
    c.fillStyle='#12152229';c.fillRect(x,36,3,460);
  }
  c.fillStyle=new T.Color(trim).getStyle();
  c.fillRect(0,0,1024,16);
  c.fillRect(0,500,1024,6);
  const number=shirtNumbers[player.name]??(keeper?1:2+player.id%23);
  const ink=keeper&&!alternate?'#163c30':keeper?'#292139':club.badge==='RM'&&!alternate?'#232d56':'#f9e4a3';
  c.fillStyle=ink;c.textAlign='center';
  c.font='800 34px sans-serif';
  c.fillText(player.name.toUpperCase(),256,158,235);
  c.font='900 154px sans-serif';
  c.fillText(String(number),256,321);
  c.font='900 31px sans-serif';
  c.fillText(club.badge,714,157);
  c.font='900 59px sans-serif';
  c.fillText(String(number),768,258);
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  return {texture,base,trim};
}

function torsoGeometry(){
  // Elliptical cross sections taper from the shoulders to the neck opening.
  const rings=[
    [-.35,.232,.119],[-.31,.236,.126],[-.13,.218,.133],
    [.07,.238,.143],[.24,.265,.131],[.31,.240,.103],[.37,.106,.086]
  ];
  const count=48, positions=[], uvs=[], indices=[];
  for(const [row,[y,width,depth]] of rings.entries()){
    for(let i=0;i<=count;i++){
      const u=i/count,angle=(u-.25)*Math.PI*2;
      const fold=.006*Math.cos(angle*11+row*.46)*Math.sin(row*.71);
      const neckline=row===rings.length-1?.045*Math.max(0,-Math.cos(angle))**3:0;
      positions.push(Math.sin(angle)*(width+fold),y-neckline,Math.cos(angle)*(depth+fold));
      uvs.push(u,(y+.35)/.72);
      if(row&&i){
        const d=row*(count+1)+i,c=d-1,b=d-count-1,a=b-1;
        indices.push(a,b,d,a,d,c);
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

const torsoShape=torsoGeometry();
const sleeveShape=new T.CylinderGeometry(.096,.122,.252,20,3,true);
const cuffShape=new T.CylinderGeometry(.098,.10,.034,20,1,true);

export function jersey(player,club,keeper=false,alternate=false){
  const group=new T.Group();
  const {texture,base,trim}=fabric(player,club,keeper,alternate);
  const shirt=new T.MeshStandardMaterial({map:texture,roughness:.82,side:T.DoubleSide});
  const sleeveMaterial=new T.MeshStandardMaterial({color:base,roughness:.86,side:T.DoubleSide});
  const cuffMaterial=new T.MeshStandardMaterial({color:trim,roughness:.80,side:T.DoubleSide});
  const torso=new T.Mesh(torsoShape,shirt);
  torso.castShadow=true;
  group.add(torso);
  const sleeves=[-1,1].map(sign=>{
    const sleeve=new T.Group();
    sleeve.position.set(sign*.296,.17,0);
    const cloth=new T.Mesh(sleeveShape,sleeveMaterial);
    const cuff=new T.Mesh(cuffShape,cuffMaterial);
    cloth.castShadow=true;
    cuff.position.y=.115;
    sleeve.add(cloth,cuff);torso.add(sleeve);
    return sleeve;
  });
  group.scale.setScalar((player.height/1.82)*1.16);

  function swing(left,right){
    sleeves[0].rotation.z=left;
    sleeves[1].rotation.z=right;
  }

  function poseKeeper(parts){
    const {x,y,z,angle}=parts[0];
    group.position.set(x,y+.04,z);
    group.rotation.set(0,Math.PI,-angle);
    const extension=Math.min(.48,Math.abs(angle)*.37);
    swing(2.16-extension,-2.16+extension);
  }

  function poseShooter(t,celebrate=0,foot=player.foot){
    const side=foot==='Left'?1:-1;
    const run=T.MathUtils.clamp(t,0,1);
    const stride=Math.sin(run*Math.PI*(player.runup==='Stutter'?9:6))*Math.sin(run*Math.PI);
    const follow=Math.sin(T.MathUtils.clamp((t-.83)/.37,0,1)*Math.PI);
    const arc=player.runup==='Arc'?1.65:1.05;
    const bounce=celebrate?Math.abs(Math.sin(t*8))*.14:.06*Math.abs(stride);
    const cheer=celebrate?.42+.20*Math.sin(t*8):0;
    const salute=celebrate&&player.celebration==='Salute'?.59:0;
    group.position.set(side*(.3+(1-run)*arc),1.27+bounce,10.96+(1-run)*2.42);
    group.rotation.set(-.14*follow,-side*(.12+.18*(1-run)),side*(.09*stride+.20*follow));
    swing(2.23+.16*stride-cheer-salute,-2.23+.16*stride+cheer);
  }

  return {group,poseKeeper,poseShooter,dispose(){
    group.removeFromParent();texture.dispose();shirt.dispose();sleeveMaterial.dispose();cuffMaterial.dispose();
  }};
}
