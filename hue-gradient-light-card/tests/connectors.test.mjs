import {test} from "node:test";
import assert from "node:assert/strict";
import {connectorPath} from "../src/palette.js";

function segments(path) {
  let start;
  const result=[];
  for(const match of path.matchAll(/([MQC])\s+([^MQC]+)/g)) {
    const values=match[2].trim().split(/\s+/).map(Number),pairs=[];
    for(let index=0;index<values.length;index+=2)pairs.push(values.slice(index,index+2));
    if(match[1]==="M"){start=pairs[0];continue;}
    result.push({start,controls:pairs.slice(0,-1),end:pairs.at(-1)});start=pairs.at(-1);
  }
  return result;
}
test("the screenshot's five-point connector has continuous direction at each marker",()=>{
  const points=[{x:-.416,y:.04},{x:-.166,y:.324},{x:.191,y:.718},{x:.469,y:.623},{x:.68,y:.373}];
  const curve=segments(connectorPath(points));assert.equal(curve.length,4);
  for(let index=1;index<curve.length;index++) {
    const previous=curve[index-1],next=curve[index];
    const incoming=previous.end.map((value,i)=>value-previous.controls.at(-1)[i]);
    const outgoing=next.controls[0].map((value,i)=>value-next.start[i]);
    const agreement=incoming.reduce((sum,value,i)=>sum+value*outgoing[i],0)/(Math.hypot(...incoming)*Math.hypot(...outgoing));
    assert.ok(agreement>.999,`Visible kink at marker ${index+1}: tangent agreement ${agreement}`);
  }
});
test("connections stay finite, ordered and inside the wheel for boundary and crowded layouts",()=>{
  const layouts=[[],[{x:0,y:0}],[{x:1,y:0},{x:-1,y:0}],
    [{x:0,y:0},{x:0,y:0},{x:.001,y:0},{x:0,y:0}],
    [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}],
    [{x:.9,y:0},{x:-.8,y:.1},{x:.85,y:-.1},{x:-.9,y:0}]];
  let seed=12345;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let run=0;run<128;run++)layouts.push(Array.from({length:2+run%6},()=>{
    const angle=random()*Math.PI*2,radius=Math.sqrt(random());return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};
  }));
  for(const points of layouts) {
    const path=connectorPath(points);assert.equal(path,connectorPath(points));
    assert.ok(!/NaN|Infinity|[LZ]/.test(path));
    const curve=segments(path);assert.equal(curve.length,Math.max(0,points.length-1));
    for(const segment of curve) {
      for(const point of [segment.start,...segment.controls,segment.end])assert.ok(Math.hypot(point[0]-50,point[1]-50)<=46.001);
      for(let sample=0;sample<=20;sample++) {
        const t=sample/20,u=1-t;
        const control=segment.controls;
        const point=control.length===1?segment.start.map((value,i)=>u*u*value+2*u*t*control[0][i]+t*t*segment.end[i]):
          segment.start.map((value,i)=>u*u*u*value+3*u*u*t*control[0][i]+3*u*t*t*control[1][i]+t*t*t*segment.end[i]);
        assert.ok(Math.hypot(point[0]-50,point[1]-50)<=46.001);
      }
    }
  }
});
