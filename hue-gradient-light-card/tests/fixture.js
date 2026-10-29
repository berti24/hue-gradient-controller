// Hass and service responses are simulated. Native HA and Bubble renderers
// are unmodified published assets, loaded from the pinned compatibility cache.
window.latestJS=true;
// Test-only bootstrap skips HA authentication startup. Renderer modules and
// their dependencies remain byte-for-byte from the published frontend wheel.
await import("/frontend_latest/hgc-test-runtime.js");
const ha=window.__hgcHaRequire;
const moduleMap=await fetch("/.cache/ha-module-map.json").then((r)=>r.json());
const visited=new Set();
window.preparedModules=visited;
async function prepare(id){
  if(visited.has(String(id)))return;visited.add(String(id));
  if(!ha.m[id]&&moduleMap[id])await ha.e(moduleMap[id]);
  const source=ha.m[id]?.toString();if(!source)return;
  const requireName=source.match(/^\d+\(\w+,\w+,(\w+)\)/)?.[1];
  if(!requireName)return;
  const pattern=new RegExp(`\\b${requireName}\\((\\d+)\\)`,"g");
  for(const match of source.matchAll(pattern))await prepare(match[1]);
}
// HA normally installs these globals during application startup, which the
// fixture skips. Load the same published styles and dark theme, rather than
// approximate tokens that leave native icons and form controls unstyled.
await prepare(26497);
const nativeTheme=document.createElement("style");
const darkTheme={...ha(88254).hY,...ha(5740).qF};
nativeTheme.textContent=ha(26497).Q;
document.head.prepend(nativeTheme);
function applyFixtureTheme(){
  const dark=!document.body.classList.contains("light");
  // Some dark-only legacy variables have their light defaults in the global
  // stylesheet rather than the exported defaults object. Remove old overrides.
  for(const key of Object.keys(darkTheme))document.documentElement.style.removeProperty(`--${key}`);
  for(const [key,value] of Object.entries({...ha(26497).I,...(dark?darkTheme:{})})){
    document.documentElement.style.setProperty(`--${key}`,value);
  }
  return dark;
}
applyFixtureTheme();
await prepare(59782);
window.tilePrepared=true;
console.info("HA Tile dependencies prepared",visited.size);
await ha(59782);
window.tileRegistered=true;
console.info("HA Tile registered");
await prepare(835);
await ha(835);
window.loadCardHelpers=async()=>({createCardElement(config){
  const tag=config.type==="tile"?"hui-tile-card":config.type.startsWith("custom:")?config.type.slice(7):`hui-${config.type}-card`;
  const card=document.createElement(tag);card.setConfig(config);return card;
}});
await import("/custom_components/hue_gradient_controller/www/hue-gradient-light-card.js");
const params=new URLSearchParams(location.search);
if(!params.has("noBubble"))await import(`/.cache/bubble-card-${params.get("bubble")||"3.4.1"}.js`);
const helpers=await window.loadCardHelpers();
window.calls=[];
const presetCatalogue=await fetch("/custom_components/hue_gradient_controller/preset_catalogue.json").then(r=>r.json());
const fixturePresets=presetCatalogue.map(item=>({id:item.id,name:item.name,brightness_pct:item.brightness_pct,mode:"interpolated_palette",builtin:true,revision:1,
  preview_rgb:item.colors.map(color=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16))),can_edit:false}));
window.presetStore={presets:fixturePresets,users:{}};
window.presetSubscribers=new Set();
function presetView(){const user=hass.user.id,prefs=presetStore.users[user]??{favorites:[],expanded:false};
  return {available:true,presets:presetStore.presets.map(item=>({...item,can_edit:!item.builtin&&(item.creator_id===user||hass.user.is_admin)})),...prefs};}
window.pushPresets=()=>{for(const listener of presetSubscribers)listener(structuredClone(presetView()));};
async function presetRequest(request){
  const op=request.type.split("/").at(-1),user=hass.user.id;
  const prefs=presetStore.users[user]??={favorites:[],expanded:false};
  let preset=presetStore.presets.find(item=>item.id===request.preset_id);
  if(op==="preferences")prefs.expanded=request.expanded;
  else if(op==="favorite")prefs.favorites=request.favorite?[...new Set([...prefs.favorites,request.preset_id])]:prefs.favorites.filter(id=>id!==request.preset_id);
  else if(op==="save"){
    if(preset&&preset.revision!==request.revision)throw Error("Preset changed. Review it and try again");
    const attrs=hass.states[request.source_entity_id].attributes;
    preset={...preset,id:preset?.id??`custom:fixture-${presetStore.presets.length}`,name:request.name,builtin:false,
      creator_id:preset?.creator_id??user,revision:(preset?.revision??0)+1,colors_xy:structuredClone(attrs.gradient_colors_xy),
      preview_rgb:structuredClone(attrs.gradient_colors_rgb),mode:attrs.gradient_mode,can_edit:true};
    presetStore.presets=presetStore.presets.filter(item=>item.id!==preset.id).concat(preset);
  }else if(op==="rename"){preset.name=request.name;preset.revision++;}
  else if(op==="delete"){
    presetStore.presets=presetStore.presets.filter(item=>item.id!==preset.id);
    for(const value of Object.values(presetStore.users))value.favorites=value.favorites.filter(id=>id!==preset.id);
  }
  pushPresets();return {preset_id:preset?.id};
}
const gradient={supported_color_modes:["xy","color_temp"],color_mode:"xy",friendly_name:"Living room strip",brightness:179,
  icon:"mdi:lightbulb",rgb_color:[255,119,0],xy_color:[.55,.4],supported_features:32,
  gradient_capable:true,gradient_points_capable:7,gradient_modes:["interpolated_palette","interpolated_palette_mirrored","random_pixelated","segmented_palette"],gradient_mode:"interpolated_palette",
  gradient_colors_rgb:[[255,130,10],[255,20,140],[143,10,255],[0,74,255]],gradient_colors_xy:[[.55,.4],[.4,.2],[.25,.1],[.16,.12]]};
window.hass={
  states:{"light.strip":{entity_id:"light.strip",state:"on",attributes:gradient,context:{id:"fixture"},last_changed:new Date().toISOString(),last_updated:new Date().toISOString()},
    "light.basic":{entity_id:"light.basic",state:"off",attributes:{friendly_name:"Ceiling light",supported_color_modes:["onoff"]}}},
  entities:{"light.strip":{entity_id:"light.strip",platform:"hue",name:"Living room strip",original_name:"Living room strip"},"light.basic":{entity_id:"light.basic",platform:"demo",name:"Ceiling light",original_name:"Ceiling light"}},
  devices:{},areas:{},floors:{},themes:{darkMode:true,default_theme:"default",themes:{}},
  config:{unit_system:{temperature:"°C"},version:"2026.7.2",components:[]},
  locale:{language:"en",number_format:"language",time_format:"24",first_weekday:"monday"},language:"en",
  user:{id:"test",name:"Test",is_admin:true},
  services:{hue_gradient_controller:{set_gradient:{},snapshot_gradient:{},restore_gradient:{}},light:{turn_on:{},turn_off:{}}},
  localize:(key)=>({"component.light.entity_component._.state.on":"On","component.light.entity_component._.state.off":"Off","state.default.on":"On","state.default.off":"Off",
    "ui.panel.lovelace.editor.card.generic.content":"Content",
    "ui.panel.lovelace.editor.card.generic.interactions":"Interactions",
    "ui.panel.lovelace.editor.card.generic.features":"Features",
    "ui.panel.lovelace.editor.card.tile.features_position":"Features position",
    "ui.panel.lovelace.editor.card.tile.features_position_options.bottom":"Below",
    "ui.panel.lovelace.editor.card.tile.features_position_options.inline":"Inline",
    "ui.panel.lovelace.editor.card.tile.features_position_options.bottom_description":"Show the slider below the name.",
    "ui.panel.lovelace.editor.card.tile.features_position_options.inline_description":"Show the slider beside the name, on the right.",
  }[key]??key.split(".").at(-1)),
  formatEntityState:(s)=>s.state==="on"?"On":s.state==="off"?"Off":s.state,
  formatEntityName:(s)=>s.attributes.friendly_name||s.entity_id,
  formatEntityAttributeName:(_s,key)=>key,
  formatEntityAttributeValue:(s,key)=>key==="brightness"?`${Math.round(s.attributes[key]/255*100)}%`:String(s.attributes[key]??""),
  hassUrl:(path)=>path,auth:{data:{access_token:"fixture-only"}},
  connection:{subscribeMessage:async(callback,message)=>{
    if(message?.type!=="hue_gradient_controller/presets/subscribe")return ()=>{};
    if(params.has("noPresets"))throw Error("Preset library unavailable");
    presetSubscribers.add(callback);callback(structuredClone(presetView()));return ()=>presetSubscribers.delete(callback);
  },sendMessagePromise:async()=>[]},
  callApi:async()=>[],fetchWithAuth:async()=>new Response("[]"),
  callService:async(domain,service,data,target)=>{
    window.calls.push({domain,service,data:structuredClone(data),target});
    if(window.rejectNext){window.rejectNext=false;throw Error("Backend rejected test command");}
    if(!params.has("noEcho"))simulateLightUpdate(domain,service,data,target);
  },
  callWS:async(request)=>{
    if(request.type.startsWith("hue_gradient_controller/presets/"))return presetRequest(request);
    if(request.type==="frontend/get_icons")return {resources:{light:{default:"mdi:lightbulb"}}};
    if(request.type!=="call_service")return {};
    window.calls.push(request);
    if(window.rejectNext){window.rejectNext=false;throw Error("Backend rejected test command");}
    if(request.service==="apply_preset"){
      const preset=presetStore.presets.find(item=>item.id===request.service_data.preset_id);
      const xy=preset.colors_xy??preset.preview_rgb.map(simulatedXy),entity=request.target.entity_id;
      if(!params.has("noEcho"))updateHass({states:{...hass.states,[entity]:{...hass.states[entity],state:"on",
        attributes:{...hass.states[entity].attributes,...Number.isFinite(preset.brightness_pct)?{brightness:Math.round(preset.brightness_pct*255/100)}:{},color_mode:"xy",gradient_colors_xy:xy,
          gradient_colors_rgb:preset.preview_rgb,gradient_mode:preset.mode,rgb_color:preset.preview_rgb[0],xy_color:xy[0]}}}});
      return {response:{applied:{[entity]:{colors_xy:xy,mode:preset.mode,...Number.isFinite(preset.brightness_pct)?{brightness_pct:preset.brightness_pct}:{}}},skipped:{}}};
    }
    return {response:{version:1,entities:{"light.strip":{colors_xy:gradient.gradient_colors_xy,mode:gradient.gradient_mode,on:true,brightness:70.123}},skipped:{}}};
  },
};
// Interactive preview only: echo successful edits into simulated hass state.
// Regression tests can retain an unchanged/rejected backend via ?noEcho=1.
// These deterministic xy values are fixture identifiers, not color conversion.
const simulatedXy=rgb=>[.1+.4*rgb[0]/255,.1+.4*rgb[1]/255];
const powerMemory=new Map();
function simulateLightUpdate(domain,service,data,target){
  const entity=target?.entity_id,state=hass.states[entity];
  if(!state||!["light","hue_gradient_controller"].includes(domain))return;
  let attrs={...state.attributes},power=state.state;
  if(service==="turn_off"){
    powerMemory.set(entity,attrs);power="off";
    attrs={...attrs,color_mode:null,brightness:null,rgb_color:null,xy_color:null,hs_color:null};
  }else if(service==="turn_on"){
    if(power==="off")attrs={...attrs,...powerMemory.get(entity)};
    power="on";
    if(data.brightness!==undefined)attrs.brightness=data.brightness;
    if(data.rgb_color)Object.assign(attrs,{rgb_color:data.rgb_color,xy_color:simulatedXy(data.rgb_color),color_mode:"rgb"});
    if(data.color_temp_kelvin)Object.assign(attrs,{color_temp_kelvin:data.color_temp_kelvin,color_mode:"color_temp"});
  }else if(service==="set_gradient"){
    if(data.turn_on)power="on";
    Object.assign(attrs,{color_mode:"xy",rgb_color:data.colors[0],xy_color:simulatedXy(data.colors[0])});
    if(data.colors.length>1)Object.assign(attrs,{gradient_colors_rgb:structuredClone(data.colors),
      gradient_colors_xy:data.colors.map(simulatedXy),gradient_mode:data.mode});
  }else return;
  updateHass({states:{...hass.states,[entity]:{...state,state:power,attributes:attrs,last_updated:new Date().toISOString()}}});
}
const subscribers=new Map();
const contextValue=(key)=>({
  states:hass.states,entities:hass.entities,
  hassConnection:hass.connection,
  hassRegistries:{entities:hass.entities,devices:hass.devices,areas:hass.areas,floors:hass.floors,labels:{}},
  hassConfig:{config:hass.config,user:hass.user,themes:hass.themes,auth:hass.auth,userData:{},panels:{}},
  hassInternationalization:{localize:hass.localize,language:"en",locale:hass.locale,
    translationMetadata:{translations:{en:{isRTL:false}}},loadBackendTranslation:async()=>{},loadFragmentTranslation:async()=>{}},
  related:{entities:new Set(),devices:new Set(),areas:new Set()},
})[key];
document.addEventListener("context-request",(event)=>{
  const value=contextValue(event.context);
  if(value===undefined)return;event.stopPropagation();
  if(event.subscribe){const entry={key:event.context,callback:event.callback};subscribers.set(event.callback,entry);}
  event.callback(value,()=>subscribers.delete(event.callback));
});
document.addEventListener("show-dialog",async(event)=>{
  event.stopPropagation();
  const detail=event.detail;
  const module=detail.dialogImport?.toString().match(/bind\([^,]*,\s*(\d+)\)/)?.[1];
  if(module)await prepare(module);
  await detail.dialogImport?.();
  const dialog=document.createElement(detail.dialogTag);dialog.hass=hass;document.body.append(dialog);
  dialog.addEventListener("dialog-closed",()=>dialog.remove());
  dialog.showDialog(detail.dialogParams);
});
window.updateHass=(patch={})=>{
  window.hass={...window.hass,...patch};
  window.hass.themes={...window.hass.themes,darkMode:applyFixtureTheme()};
  for(const {key,callback} of subscribers.values())callback(contextValue(key),()=>subscribers.delete(callback));
  for(const element of document.querySelectorAll("hue-gradient-light-card,hue-gradient-editor,hui-tile-card,bubble-card,hue-gradient-light-card-config-editor,hue-gradient-editor-config-editor"))element.hass=window.hass;
};
window.makeCard=(type,config,parent="cards")=>{
  const card=type==="tile"?helpers.createCardElement({type,...config}):document.createElement(type);
  if(type!=="tile")card.setConfig(config);
  card.hass=window.hass;document.getElementById(parent).append(card);return card;
};
window.originalTile=makeCard("tile",{entity:"light.strip",state_content:["state","brightness"]});
console.info("Original Tile mounted");
window.tile=makeCard("hue-gradient-light-card",{entity:"light.strip"});
console.info("Wrapped Tile mounted");
if(!params.has("noBubble")&&!params.has("noOriginal"))window.originalBubble=makeCard("bubble-card",{type:"custom:bubble-card",card_type:"button",button_type:"switch",entity:"light.strip",show_state:true,show_attribute:true,attribute:"brightness"});
if(!params.has("noWrapper"))window.bubble=makeCard("hue-gradient-light-card",{entity:"light.strip",design:"bubble"});
console.info("Bubble mounted");
window.colors=makeCard("hue-gradient-editor",{entity:"light.strip"},"editors");
window.whites=makeCard("hue-gradient-editor",{entity:"light.strip"},"editors");whites._switchPalette();
console.info("Editors mounted");
window.configEditor=makeCard("hue-gradient-light-card-config-editor",{type:"custom:hue-gradient-light-card",entity:"light.strip"},"config");
configEditor.addEventListener("config-changed",event=>{
  tile.setConfig(event.detail.config);
  if(window.bubble)bubble.setConfig({...event.detail.config,design:"bubble"});
});
// A real HA application consumes this event to open its native entity dialog.
document.addEventListener("hass-more-info",event=>{window.moreInfoEntity=event.detail.entityId;});
customElements.get("hui-tile-card").getConfigElement().catch(console.error);
document.addEventListener("hass-action",(e)=>{
  const action=e.detail?.config?.[`${e.detail.action}_action`];
  if(action?.action==="navigate"){location.hash=action.navigation_path;window.dispatchEvent(new Event("location-changed"));}
});
window.fixtureReady=true;
console.info("Fixture ready");
