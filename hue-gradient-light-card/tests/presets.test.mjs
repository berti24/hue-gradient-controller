import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeConfig} from "../src/model.js";
import {orderedPresets,presetReason,subscribePresets,rememberPreset,activePreset} from "../src/presets.js";

test("preset opening defaults and strict configuration",()=>{
  for(const editor of [false,true]){
    assert.equal(normalizeConfig({entity:"light.strip"},editor).presets_expansion,"remember");
    for(const value of ["remember","collapsed","expanded"])assert.equal(normalizeConfig({entity:"light.strip",presets_expansion:value},editor).presets_expansion,value);
    assert.throws(()=>normalizeConfig({entity:"light.strip",presets_expansion:true},editor));
  }
});
test("favorites partition without changing catalogue order or hiding incompatibility",()=>{
  const presets=[{id:"a",preview_rgb:[[1,2,3],[3,2,1]],mode:"blended"},{id:"b"},{id:"c"}];
  assert.deepEqual(orderedPresets(presets,["c","a","deleted"]).map(p=>p.id),["a","c","b"]);
  assert.equal(presetReason(presets[0],{gradient:true,capacity:2,modes:["blended"]}),"");
  assert.match(presetReason(presets[0],{gradient:true,capacity:1,modes:["blended"]}),/supports 1/);
  assert.match(presetReason(presets[0],{gradient:true,capacity:2,modes:[]}),/Mode/);
});
test("active identity survives editor disposal but stays scoped to user, connection, entity and live appearance",()=>{
  const preset={id:"a",mode:"blended",colors_xy:[[.123456,.234567],[.5,.3]]};
  const hass={connection:{},user:{id:"alice"},states:{"light.strip":{attributes:{color_mode:"xy",gradient_mode:"blended",gradient_colors_xy:[[.123,.235],[.5,.3]]}}}};
  rememberPreset(hass,"light.strip",preset);
  assert.equal(activePreset(hass,"light.strip",true).id,"a");
  assert.equal(activePreset(hass,"light.strip",false),undefined);
  assert.equal(activePreset(hass,"light.other",true),undefined);
  assert.equal(activePreset({...hass,user:{id:"bob"}},"light.strip",true),undefined);
  assert.equal(activePreset({...hass,connection:{}},"light.strip",true),undefined);
  for(const change of [{gradient_mode:"pixelated"},{color_mode:"color_temp"},{gradient_colors_xy:[[.3,.3],[.5,.3]]},{gradient_colors_xy:[[.123,.235]]}]){
    assert.equal(activePreset({...hass,states:{"light.strip":{attributes:{...hass.states["light.strip"].attributes,...change}}}},"light.strip",true),undefined);
  }
  rememberPreset(hass,"light.strip",undefined);assert.equal(activePreset(hass,"light.strip",true),undefined);
});
test("selection checks the current shared recipe without clearing rename-only or built-in matches",()=>{
  const preset={id:"custom:palette",mode:"interpolated_palette",colors_xy:[[.5,.4],[.2,.1]]};
  const hass={connection:{},user:{id:"alice"},states:{"light.strip":{attributes:{color_mode:"xy",
    gradient_mode:preset.mode,gradient_colors_xy:preset.colors_xy}}}};
  const recipe={...preset,builtin:false,name:"Original",revision:1};
  rememberPreset(hass,"light.strip",preset);
  const selected=entry=>activePreset(hass,"light.strip",true,entry?[entry]:[]);
  assert.equal(selected(recipe).id,preset.id);
  assert.equal(selected({...recipe,name:"Renamed",revision:2}).id,preset.id);
  assert.equal(selected({...recipe,colors_xy:[[.6,.3],[.3,.2]],revision:2}),undefined);
  assert.equal(selected({...recipe,mode:"segmented_palette",revision:2}),undefined);
  assert.equal(selected(undefined),undefined);
  const builtin={id:"builtin:ocean",mode:preset.mode,preview_rgb:[[0,0,255],[0,255,255]],builtin:true};
  rememberPreset(hass,"light.strip",{...preset,id:builtin.id});
  assert.equal(selected(builtin).id,builtin.id);
});
test("subscriptions share a connection and clean up even before acquisition completes",async()=>{
  let resolve,emit,starts=0,stops=0;
  const connection={subscribeMessage(callback){starts++;emit=callback;return new Promise(r=>resolve=r);}};
  const hass={connection,user:{id:"alice"}},seen=[];
  const first=subscribePresets(hass,value=>seen.push(value));
  const second=subscribePresets(hass,value=>seen.push(value));
  await Promise.resolve();assert.equal(starts,1);
  emit({available:true});assert.equal(seen.length,2);
  first();second();resolve(()=>stops++);
  await new Promise(r=>setImmediate(r));assert.equal(stops,1);
  const third=subscribePresets(hass,()=>{});await Promise.resolve();assert.equal(starts,2);
  resolve(()=>stops++);await new Promise(r=>setImmediate(r));third();assert.equal(stops,2);
});
