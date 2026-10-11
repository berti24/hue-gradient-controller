import { hsvRgb, rgbHsv } from "./model.js";

export function discPoint(x, y) {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}
export function paletteColor(x, y, whites = false) {
  [x, y] = discPoint(x, y);
  if (!whites) return hsvRgb(240 - Math.atan2(y, x) * 180 / Math.PI, Math.hypot(x, y));
  const depth=(y+1)/2;
  const upper=x<0?[255,224,158]:[213,229,255];
  const lower=x<0?[246,172,112]:[106,164,248];
  const tint=upper.map((n,i)=>n+(lower[i]-n)*depth);
  const amount = Math.min(1, Math.abs(x) * (0.65 + depth * .35));
  return tint.map((n) => Math.round(255 + (n - 255) * amount));
}
export function markerPosition(rgb, whites = false, preferred) {
  if (!whites) {
    const [h, s] = rgbHsv(rgb), angle = (240 - h) * Math.PI / 180;
    return { x: Math.cos(angle) * s, y: Math.sin(angle) * s, outside: false };
  }
  const origin=preferred ?? {x:0,y:0};
  let best = { x: origin.x, y: origin.y, distance: Infinity, score: Infinity };
  const consider=(x,y)=>{
    const distance=paletteColor(x,y,true).reduce((sum,n,i)=>sum+(n-rgb[i])**2,0);
    // White RGB values are rounded and neutral white has many valid positions.
    // Prefer the preceding position among visually equivalent inverse matches.
    const score=distance+3*((x-origin.x)**2+(y-origin.y)**2);
    if(score<best.score)best={x,y,distance,score};
  };
  consider(origin.x,origin.y);
  // Inversion affects only marker display, never the ordered color payload.
  for (let y = -1; y <= 1; y += 1 / 32) {
    for (let x = -1; x <= 1; x += 1 / 32) {
      if (x*x + y*y > 1) continue;
      consider(x,y);
    }
  }
  return { ...best, outside: best.distance > 30 ** 2 };
}

export function connectorPath(points) {
  if (points.length < 2) return "";
  const at = (p) => `${(50 + p.x * 46).toFixed(3)} ${(50 + p.y * 46).toFixed(3)}`;
  const edges=points.slice(1).map((point,index)=>{
    const dx=point.x-points[index].x,dy=point.y-points[index].y,length=Math.hypot(dx,dy);
    return {x:length?dx/length:0,y:length?dy/length:0,length};
  });
  // Share the direction and handle length on both sides of each interior
  // marker. Short, distance-scaled handles avoid separate radial bows/kinks.
  const handles=points.map((point,index)=>{
    const incoming=edges[index-1],outgoing=edges[index];
    const dx=(incoming?.x??0)+(outgoing?.x??0),dy=(incoming?.y??0)+(outgoing?.y??0);
    const norm=Math.hypot(dx,dy),x=norm?dx/norm:0,y=norm?dy/norm:0;
    const desired=Math.min(incoming?.length??Infinity,outgoing?.length??Infinity)*.25;
    const dot=point.x*x+point.y*y;
    const root=Math.sqrt(Math.max(0,dot*dot+1-point.x*point.x-point.y*point.y));
    // Bound control points along this direction, preserving tangent continuity
    // while keeping the entire Bezier in the convex wheel disc.
    const limit=Math.min(incoming?root+dot:Infinity,outgoing?root-dot:Infinity);
    const length=norm?Math.max(0,Math.min(desired,limit))*.98:0;
    return {x:x*length,y:y*length};
  });
  let path = `M ${at(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const first={x:a.x+handles[i-1].x,y:a.y+handles[i-1].y};
    const second={x:b.x-handles[i].x,y:b.y-handles[i].y};
    path += ` C ${at(first)} ${at(second)} ${at(b)}`;
  }
  return path;
}

export function separateMarkers(points, fixedCount = 0) {
  const result=[];
  for(const [index,point] of points.entries()){
    if(index<fixedCount){result.push({...point});continue;}
    let best={...point},clearance=-1;
    for(let ring=0;ring<=4;ring++){
      const count=ring===0?1:24;
      for(let step=0;step<count;step++){
        const angle=step/count*Math.PI*2;
        const [x,y]=discPoint(point.x+Math.cos(angle)*ring*.12,point.y+Math.sin(angle)*ring*.12);
        const distance=result.length?Math.min(...result.map((p)=>Math.hypot(p.x-x,p.y-y))):1;
        if(distance>clearance){best={...point,x,y};clearance=distance;}
        if(distance>=.23)break;
      }
      if(clearance>=.23)break;
    }
    result.push(best);
  }
  return result;
}
