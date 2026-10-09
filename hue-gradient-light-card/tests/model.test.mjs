import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, capabilities, gradientDisplay, AppearanceTracker, currentColors, colorLayer, validSnapshot, SUBTITLE_DEFAULTS, subtitleValues, subtitleFields, nextColor, rgbHsv } from "../src/model.js";
import { markerPosition, paletteColor, connectorPath, separateMarkers } from "../src/palette.js";
const attrs={supported_color_modes:["xy","color_temp"],color_mode:"xy",rgb_color:[255,0,0],xy_color:[.6,.3],
  gradient_capable:true,gradient_points_capable:4,gradient_modes:["interpolated_palette","segmented_palette"],gradient_mode:"interpolated_palette",
  gradient_colors_xy:[[.6,.3],[.2,.1]],gradient_colors_rgb:[[255,0,0],[0,0,255]]};
const hass={states:{"light.strip":{state:"on",attributes:attrs}},entities:{"light.strip":{platform:"hue"}},services:{hue_gradient_controller:{set_gradient:{}}}};
test("configuration defaults, overrides and validation",()=>{
  assert.deepEqual(normalizeConfig({entity:"light.strip",name:"",icon:" "}),{entity:"light.strip",design:"tile",presets_expansion:"remember",show_brightness_slider:false,protect_when_off:false,color_background:true,icon_gradient_background:false,color_background_opacity:70,...SUBTITLE_DEFAULTS});
  for (const editor of [false,true]) {
    assert.equal(normalizeConfig({entity:"light.strip"},editor).protect_when_off,false);
    assert.equal(normalizeConfig({entity:"light.strip",protect_when_off:true},editor).protect_when_off,true);
    assert.throws(()=>normalizeConfig({entity:"light.strip",protect_when_off:"true"},editor));
  }
  assert.equal(normalizeConfig({entity:"light.strip",name:" Custom "}).name,"Custom");
  assert.equal(normalizeConfig({entity:"light.strip"},true).embedded,false);
  assert.equal(normalizeConfig({entity:"light.strip",show_brightness_slider:true}).show_brightness_slider,true);
  assert.throws(()=>normalizeConfig({entity:"light.strip",show_brightness_slider:"yes"}));
  for(const bad of [{entity:"sensor.x"},{entity:"light.x",design:"oops"},{entity:"light.x",color_background_opacity:101},{entity:"light.x",color_background_opacity:"70"},{entity:"light.x",show_mode:"true"},{entity:"light.x",color_background:1},{entity:"light.x",icon_gradient_background:"yes"},{entity:"light.x",state_content:42},{entity:"light.x",state_content:["state","state"]}])assert.throws(()=>normalizeConfig(bad));
});
test("new colors oppose the last hue and stay unique across repeated additions",()=>{
  assert.deepEqual(nextColor([[255,0,0]]),[0,255,255]);
  const colors=[[255,0,0],[0,255,255]];
  const next=nextColor(colors);
  assert.ok(Math.abs(rgbHsv(next)[0])<=1);
  assert.ok(!colors.some(rgb=>String(rgb)===String(next)));
  for(const initial of [[255,255,255],[0,0,0],[254,255,255],[255,130,10]]){
    const palette=[initial];
    for(let i=0;i<7;i++)palette.push(nextColor(palette));
    assert.equal(new Set(palette.map(String)).size,palette.length);
  }
});
test("editor background follows embedding by default and accepts independent overrides",()=>{
  for(const embedded of [true,false]){
    assert.equal(normalizeConfig({entity:"light.strip",embedded},true).card_background,!embedded);
    for(const card_background of [true,false])assert.equal(normalizeConfig({entity:"light.strip",embedded,card_background},true).card_background,card_background);
  }
  assert.throws(()=>normalizeConfig({entity:"light.strip",card_background:"true"},true),/card_background/);
});
test("subtitle picker preserves order, legacy options, empty selection and native attributes",()=>{
  assert.deepEqual(subtitleFields({show_state:false,show_mode:true}),["brightness","hgc_gradient_mode"]);
  const config=normalizeConfig({entity:"light.strip",state_content:["hgc_gradient_mode","hgc_color_count","state","xy_color"]});
  assert.deepEqual(Object.keys(subtitleValues(hass,config,true)),config.state_content);
  assert.deepEqual(subtitleValues(hass,{...config,state_content:[]},true),{});
  assert.deepEqual(normalizeConfig({entity:"light.strip",state_content:"state"}).state_content,["state"]);
});
test("subtitle options are independent and reflect reported capabilities and gradient appearance",()=>{
  const config=normalizeConfig({entity:"light.strip",show_color_count:true,show_mode:true});
  const state={...hass.states["light.strip"],entity_id:"light.strip",attributes:{...attrs,brightness:128}};
  const source={...hass,states:{"light.strip":state},formatEntityState:s=>s.state==="on"?"On":"Off"};
  assert.deepEqual(subtitleValues(source,config,true),{state:"On",brightness:"50%",hgc_color_count:"2 colors",hgc_gradient_mode:"Blended"});
  for(const [option,key] of [["show_state","state"],["show_brightness","brightness"],["show_color_count","hgc_color_count"],["show_mode","hgc_gradient_mode"]]){
    assert.equal(Object.hasOwn(subtitleValues(source,{...config,[option]:false},true),key),false);
  }
  assert.deepEqual(subtitleValues(source,config,false),{state:"On",brightness:"50%",hgc_color_count:"1 color"});
  const off={...source,states:{"light.strip":{...state,state:"off",attributes:{...state.attributes,brightness:null}}}};
  assert.equal(subtitleValues(off,config,true).brightness,"0%");
  const basic={...source,states:{"light.strip":{...state,attributes:{supported_color_modes:["onoff"]}}}};
  assert.deepEqual(subtitleValues(basic,config,false),{state:"On"});
  assert.deepEqual(subtitleValues(source,{...config,show_state:false,show_brightness:false,show_color_count:false,show_mode:false},true),{});
});
test("eligibility uses selected native attributes, modes, services and registry",()=>{
  assert.equal(capabilities(hass,"light.strip").gradient,true);
  for(const change of [{gradient_capable:false},{gradient_points_capable:1},{gradient_modes:[]},{entity_id:["light.member"]}]){
    assert.equal(capabilities({...hass,states:{"light.strip":{state:"on",attributes:{...attrs,...change}}}},"light.strip").gradient,false);
  }
  assert.equal(capabilities({...hass,services:{}},"light.strip").gradient,false);
  assert.equal(capabilities({...hass,entities:{"light.strip":{platform:"group"}}},"light.strip").gradient,false);
});
test("ordinary light capability combinations require reported support",()=>{
  for(const [modes,color,brightness] of [[["onoff"],false,false],[["brightness"],false,true],[["hs"],true,true],[["xy"],true,true],[["rgbw"],true,true],[["rgbww"],true,true],[["color_temp"],false,true]]){
    const caps=capabilities({states:{"light.x":{state:"on",attributes:{supported_color_modes:modes}}}},"light.x");
    assert.equal(caps.color,color);assert.equal(caps.brightness,brightness);assert.equal(caps.gradient,false);
  }
  assert.equal(capabilities({states:{"light.x":{state:"on",attributes:{supported_color_modes:["color_temp"],min_color_temp_kelvin:2000,max_color_temp_kelvin:6500}}}},"light.x").temperature,true);
});
test("authoritative xy boundaries and stale gradient/native temperature transitions",()=>{
  assert.equal(gradientDisplay({...attrs,gradient_colors_xy:[]}).length,0);
  assert.equal(gradientDisplay({...attrs,gradient_colors_rgb:[[0,0,0]]}).length,0);
  const tracker=new AppearanceTracker();const state={state:"on",attributes:attrs};
  assert.equal(tracker.observe(state),true);
  const solid={state:"on",attributes:{...attrs,xy_color:[.3,.3],rgb_color:[255,255,255]}};
  assert.equal(tracker.observe(solid),false);assert.deepEqual(currentColors(solid,false),[[255,255,255]]);
  const changed={state:"on",attributes:{...attrs,gradient_colors_xy:[[.1,.2],[.3,.4]]}};
  assert.equal(tracker.observe(changed),true);
  const off={state:"off",attributes:{...changed.attributes,color_mode:null,xy_color:null,rgb_color:null,hs_color:null}};
  assert.equal(tracker.observe(off),true);
  assert.equal(tracker.observe({state:"unavailable",attributes:{}}),false);
  assert.equal(tracker.observe(changed),true);
  assert.equal(tracker.observe({state:"on",attributes:{...changed.attributes,color_mode:"color_temp",color_temp_kelvin:3000}}),false);
});
test("opacity affects only color layer, including whites",()=>{
  assert.equal(colorLayer([[255,255,255]],0),"none");
  assert.match(colorLayer([[255,255,255]],70),/rgba\(255,255,255,0.7\)/);
  assert.match(colorLayer([[255,0,0],[0,0,255]],100),/rgba\(255,0,0,1\)/);
});
test("four Pixelated colors survive native display-color updates",()=>{
  const tracker=new AppearanceTracker();
  const palette={...attrs,gradient_mode:"random_pixelated",
    gradient_colors_xy:[[.191,.676],[.221,.167],[.363,.158],[.541,.389]],
    gradient_colors_rgb:[[60,255,72],[138,135,255],[240,64,255],[255,162,76]],
    xy_color:[.1909,.6831],rgb_color:[59,255,67],hs_color:[122.449,76.863]};
  const state={state:"on",attributes:palette};
  assert.equal(currentColors(state,tracker.observe(state)).length,4);
  const displayUpdate={...state,attributes:{...palette,rgb_color:[60,255,68],hs_color:[122.46,76.47]}};
  assert.equal(currentColors(displayUpdate,tracker.observe(displayUpdate)).length,4);
});
test("gradient mode updates recover retained points without changing their colors",()=>{
  const tracker=new AppearanceTracker();
  const state={state:"on",attributes:attrs};
  assert.equal(tracker.observe(state),true);
  // A whole-light XY command still suppresses unchanged retained points.
  const solid={...state,attributes:{...attrs,xy_color:[.3,.3],rgb_color:[255,255,255]}};
  assert.equal(tracker.observe(solid),false);
  const modeUpdate={...solid,attributes:{...solid.attributes,gradient_mode:"segmented_palette"}};
  assert.deepEqual(currentColors(modeUpdate,tracker.observe(modeUpdate)),attrs.gradient_colors_rgb);
});
test("derived RGB and HS changes alone do not suppress gradients in any supported mode",()=>{
  for(const gradient_mode of ["interpolated_palette","interpolated_palette_mirrored","random_pixelated","segmented_palette"]){
    const tracker=new AppearanceTracker(),state={state:"on",attributes:{...attrs,gradient_mode}};
    assert.equal(tracker.observe(state),true);
    assert.equal(tracker.observe({...state,attributes:{...state.attributes,rgb_color:[254,0,0],hs_color:[0,100]}}),true);
  }
});
test("rounded native first-point echoes preserve gradients; other XY still switches to solid",()=>{
  for(const gradient_mode of ["interpolated_palette","interpolated_palette_mirrored","random_pixelated","segmented_palette"]){
    const tracker=new AppearanceTracker(),state={state:"on",attributes:{...attrs,gradient_mode,
      gradient_colors_xy:[[.123456,.234567],[.5,.3]],xy_color:[.123456,.234567]}};
    assert.equal(tracker.observe(state),true);
    assert.equal(tracker.observe({...state,attributes:{...state.attributes,xy_color:[.1235,.2346]}}),true);
    assert.equal(tracker.observe({...state,attributes:{...state.attributes,xy_color:[.123,.235]}}),true);
    assert.equal(tracker.observe({...state,attributes:{...state.attributes,xy_color:[.3,.3]}}),false);
    assert.equal(tracker.observe({...state,attributes:{...state.attributes,xy_color:[.1235,.2346]}}),false);
  }
});
test("confirmed reapplication recovers identical retained points without overriding unrelated live state",()=>{
  const tracker=new AppearanceTracker(),state={state:"on",attributes:attrs};
  tracker.observe(state);
  const solid={...state,attributes:{...attrs,xy_color:[.3,.3]}};
  assert.equal(tracker.observe(solid),false);
  const applied={mode:attrs.gradient_mode,colors_xy:attrs.gradient_colors_xy};
  assert.equal(tracker.confirmGradient(solid,{...applied,mode:"segmented_palette"}),false);
  assert.equal(tracker.confirmGradient(solid,{...applied,colors_xy:[[.1,.1],[.2,.2]]}),false);
  assert.equal(tracker.confirmGradient({...solid,attributes:{...solid.attributes,color_mode:"color_temp"}},applied),false);
  assert.equal(tracker.confirmGradient(solid,applied),true);
});
test("both palettes preserve off-palette actual colors and order",()=>{
  const p=markerPosition([255,0,0]);assert.deepEqual(paletteColor(p.x,p.y),[255,0,0]);
  assert.equal(markerPosition([255,0,0],true).outside,true);
  assert.equal(markerPosition([255,255,255],true).outside,false);
  assert.ok(paletteColor(-.9,.2,true)[0]>paletteColor(-.9,.2,true)[2]);
  assert.ok(paletteColor(.9,.2,true)[2]>paletteColor(.9,.2,true)[0]);
});
test("curves form an open path inside disc, including coincident/opposite points",()=>{
  for(const points of [[{x:1,y:0},{x:-1,y:0}],[{x:0,y:0},{x:0,y:0}],[{x:0,y:-1},{x:1,y:0},{x:0,y:1}]]){
    const path=connectorPath(points);assert.equal((path.match(/[QC]/g)??[]).length,points.length-1);
    assert.ok(!/[LZ]|NaN|Infinity/.test(path));
    const values=path.match(/-?\d+\.\d+/g).map(Number);
    for(let i=0;i<values.length;i+=2)assert.ok(Math.hypot(values[i]-50,values[i+1]-50)<=46.001);
  }
});
test("snapshot is exact, entity-scoped, versioned and minimum two points",()=>{
  const snapshot={version:1,entities:{"light.strip":{colors_xy:[[.3,.3],[.2,.1]],mode:"interpolated_palette",on:true,brightness:70.125}},skipped:{}};
  assert.equal(validSnapshot(snapshot,"light.strip",capabilities(hass,"light.strip")),true);
  assert.equal(validSnapshot({...snapshot,version:2},"light.strip",capabilities(hass,"light.strip")),false);
  assert.equal(validSnapshot(snapshot,"light.other",capabilities(hass,"light.strip")),false);
});
test("coincident marker targets separate inside the disc without changing colors",()=>{
  const points=Array.from({length:4},()=>({x:-.9,y:0,outside:true}));
  const result=separateMarkers(points);
  assert.equal(result.length,4);
  for(let i=0;i<result.length;i++){
    assert.ok(Math.hypot(result[i].x,result[i].y)<=1.0001);
    for(let j=0;j<i;j++)assert.ok(Math.hypot(result[i].x-result[j].x,result[i].y-result[j].y)>.2);
  }
  assert.deepEqual(points,Array.from({length:4},()=>({x:-.9,y:0,outside:true})));
});
test("neutral Whites has a stable inverse and preserves an equally valid previous position",()=>{
  const neutral=markerPosition([255,255,255],true);
  assert.equal(neutral.x,0);assert.equal(neutral.y,0);
  const previous={x:0,y:.73};
  const restored=markerPosition([255,255,255],true,previous);
  assert.equal(restored.x,previous.x);assert.equal(restored.y,previous.y);
});
test("placing new coincident markers leaves existing drag positions untouched",()=>{
  const fixed=[{x:0,y:0},{x:.05,y:0}];
  const result=separateMarkers([...fixed,{x:0,y:0}],fixed.length);
  assert.deepEqual(result.slice(0,2),fixed);
  assert.ok(Math.hypot(result[2].x,result[2].y)>.2);
});
