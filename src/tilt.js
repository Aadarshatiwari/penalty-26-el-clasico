export function tiltAim(origin, reading, screenAngle=0){
  const radians=screenAngle*Math.PI/180;
  const roll=reading.gamma-origin.gamma;
  const pitch=((reading.beta-origin.beta+540)%360)-180;
  return {
    x:origin.x+.17*(roll*Math.cos(radians)-pitch*Math.sin(radians)),
    y:origin.y-.08*(pitch*Math.cos(radians)+roll*Math.sin(radians))
  };
}
