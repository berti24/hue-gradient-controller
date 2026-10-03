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
  let path = `M ${at(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
    const mid = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
    let direction = [mid.x, mid.y];
    // Opposite points have no outward midpoint; choose a stable perpendicular.
    if (Math.hypot(...direction) < 0.001) direction = [-dy, dx];
    const norm = Math.hypot(...direction) || 1;
    const bow = Math.min(0.48, distance * 0.4);
    const control = discPoint(mid.x + direction[0] / norm * bow, mid.y + direction[1] / norm * bow);
    // Quadratic Beziers stay in the convex disc when all control points are in it.
    path += ` Q ${at({ x: control[0], y: control[1] })} ${at(b)}`;
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
