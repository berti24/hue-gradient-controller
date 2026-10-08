import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveWriter,serialize } from "../src/writes.js";
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
test("drag coalescing, final flush, and older completion cannot settle new edits",async()=>{
  const sent=[],settled=[];let release;
  const writer=new LiveWriter("light.x",async(value)=>{sent.push(value);if(value===1)await new Promise((r)=>{release=r;});},(error,revision)=>settled.push([error,revision]),5);
  const first=writer.enqueue(1,true);await wait(0);
  writer.enqueue(2);writer.enqueue(3);writer.flush();release();await first;await wait(20);
  assert.deepEqual(sent,[1,3]);assert.equal(settled.length,1);assert.equal(settled[0][1],3);writer.dispose();
});
test("different control channels do not drop final palette or brightness",async()=>{
  const sent=[];const writer=new LiveWriter("light.x",async(v)=>sent.push(v),(e)=>assert.equal(e,undefined),5);
  writer.enqueue({key:"color",value:1});writer.enqueue({key:"brightness",value:2});writer.enqueue({key:"color",value:3});
  await writer.flush();assert.deepEqual(sent.map((v)=>v.value),[2,3]);writer.dispose();
});
test("coalesced brightness zero and later on edit keep only the final intent",async()=>{
  const sent=[];const writer=new LiveWriter("light.x",async(v)=>sent.push(v),()=>{},5);
  writer.enqueue({key:"brightness",service:"turn_on",data:{brightness:100}});
  writer.enqueue({key:"brightness",service:"turn_off",data:{}});
  writer.enqueue({key:"brightness",service:"turn_on",data:{brightness:150}});
  await writer.flush();assert.deepEqual(sent,[{key:"brightness",service:"turn_on",data:{brightness:150}}]);
  writer.enqueue({key:"color",service:"turn_on",data:{}});
  writer.enqueue({key:"power",service:"turn_off",data:{}});
  writer.enqueue({key:"color",service:"turn_on",data:{}});
  await writer.flush();assert.deepEqual(sent.slice(-2).map(v=>v.service),["turn_off","turn_on"]);writer.dispose();
});
test("shared entity lanes serialize separate cards; errors do not poison lane",async()=>{
  const order=[];
  const first=serialize("light.x",async()=>{order.push(1);await wait(10);throw Error("rejected");});
  const next=serialize("light.x",async()=>order.push(2));
  await assert.rejects(first);await next;assert.deepEqual(order,[1,2]);
});
test("disconnect cancels pending writes and callbacks",async()=>{
  const sent=[],settled=[];const writer=new LiveWriter("light.x",async(v)=>sent.push(v),(e)=>settled.push(e),5);
  writer.enqueue(1);writer.dispose();await wait(15);assert.deepEqual(sent,[]);assert.deepEqual(settled,[]);
});
test("cancel invalidates a flushed batch waiting in another card's lane",async()=>{
  let release;
  const blocker=serialize("light.blocked",()=>new Promise(resolve=>{release=resolve;}));
  await wait(0);
  const sent=[],settled=[];
  const writer=new LiveWriter("light.blocked",async(command)=>sent.push(command),error=>settled.push(error));
  writer.enqueue({key:"color",value:"old"});
  const flushed=writer.flush();
  writer.cancelPending();
  writer.enqueue({key:"power",value:"off"},true);
  release();await blocker;await flushed;
  assert.deepEqual(sent,[{key:"power",value:"off"}]);
  assert.deepEqual(settled,[undefined]);writer.dispose();
});
test("cancel drops the unsent remainder of an in-flight batch without recalling its accepted request",async()=>{
  let release;
  const sent=[];
  const writer=new LiveWriter("light.running",async(command)=>{
    sent.push(command);if(command.value==="accepted")await new Promise(resolve=>{release=resolve;});
  },()=>{});
  writer.enqueue({key:"color",value:"accepted"});writer.enqueue({key:"brightness",value:"unsent"});
  const flushed=writer.flush();await wait(0);
  writer.cancelPending();writer.enqueue({key:"power",value:"off"},true);
  release();await flushed;
  assert.deepEqual(sent.map(command=>command.value),["accepted","off"]);writer.dispose();
});
