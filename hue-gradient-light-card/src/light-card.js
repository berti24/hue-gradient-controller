import { normalizeConfig, capabilities, currentColors, AppearanceTracker, colorLayer, subtitleValues } from "./model.js";
import { serialize } from "./writes.js";

const OPEN = { action:"fire-dom-event", hgc_open_popup:true };
const TILE_STYLES = `
  ha-card { background:var(--hgc-card-fill,var(--ha-card-background,var(--card-background-color))) !important; }
  ha-card.active { --tile-color:var(--hgc-active-foreground,var(--state-icon-color)) !important; }
  ha-card.active ha-tile-icon { --tile-icon-color:var(--hgc-icon-color,var(--state-light-active-color)) !important; }
  ha-card.active ha-tile-info { text-shadow:var(--hgc-card-text-shadow,0 1px 3px rgba(0,0,0,.25)); }
`;
const BRIGHTNESS_STYLES = `
  .container .slider .slider-track-background { background:var(--hgc-brightness-gradient,var(--control-slider-background)); }
  .container .slider .slider-track-bar {
    background:var(--hgc-brightness-gradient,var(--control-slider-color));
    transform:none !important;
    width:calc(var(--value,0) * (100% - 2 * var(--handle-margin) - var(--handle-size)) + 2 * var(--handle-margin) + var(--handle-size));
    transition:width .18s ease-in-out;
  }
  .container.pressed .slider .slider-track-bar { transition:none; }
`;
const BUBBLE_STYLES = `
  ha-card { border:0 !important; box-shadow:none !important; background:transparent !important; border-radius:var(--bubble-button-border-radius,var(--bubble-border-radius,32px)) !important; }
  .bubble-button-card-container { background:var(--hgc-card-fill,var(--bubble-main-background-color,var(--ha-card-background,var(--card-background-color)))) !important; }
  .bubble-background,.bubble-button-background { background:transparent !important; opacity:0 !important; }
  .bubble-name,.bubble-state { color:var(--hgc-active-foreground,var(--primary-text-color)) !important; }
  .bubble-icon { color:var(--hgc-icon-color,var(--primary-text-color)) !important; }
  .bubble-icon-container { background:var(--hgc-icon-gradient,none),linear-gradient(var(--bubble-icon-background-color,var(--secondary-background-color)),var(--bubble-icon-background-color,var(--secondary-background-color))) !important; }
  .bubble-name,.bubble-state { text-shadow:var(--hgc-card-text-shadow,0 1px 3px rgba(0,0,0,.25)); }
`;

export class HueGradientLightCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:"open"}); this._tracker=new AppearanceTracker(); this._generation=0;
    const style=document.createElement("style");
    style.textContent=":host{display:block;height:100%;min-width:0} #renderer{display:block;height:100%} #renderer>*{height:100%;display:block} .error{color:var(--error-color);padding:16px}";
    this._mount=document.createElement("div");this._mount.id="renderer";this.shadowRoot.append(style,this._mount);
    this._openEvent=(e)=> {if(e.detail?.hgc_open_popup){e.stopPropagation();this.openPopup();}};
    this._bubbleClick=(e)=> {
      // Bubble forwards actions to HA as hass-action. Opening is scoped to this
      // owned renderer; no global more-info or action listeners are installed.
      if(e.detail?.config?.tap_action?.hgc_open_popup || e.detail?.action?.hgc_open_popup){e.stopPropagation();this.openPopup();}
    };
  }
  setConfig(input) {
    const config=normalizeConfig(input);
    if(config.entity!==this._config?.entity){this._tracker=new AppearanceTracker();this.closePopup();}
    this._config=config;this._renderNative();
  }
  set hass(value) {
    this._hass=value;
    if(this._config){this._gradientActive=this._tracker.observe(value?.states?.[this._config.entity]);}
    if(this._card){this._updateRendererState();this._styleSurface();}
    if(this._editor)this._editor.hass=value;
  }
  get hass(){return this._hass;}
  set layout(value){this._layout=value;if(this._card)this._card.layout=value;}
  get layout(){return this._layout;}
  connectedCallback(){
    this.addEventListener("ll-custom",this._openEvent);
    this.addEventListener("hass-action",this._bubbleClick);
    this._connected=true;
    if(this._config)this._renderNative();
    this._resize=new ResizeObserver(()=>this._styleSurface());this._resize.observe(this);
    // Late-loading Bubble upgrades the Tile fallback without changing config.
    customElements.whenDefined("bubble-card").then(()=> {if(this.isConnected&&this._config?.design==="bubble")this._renderNative();});
  }
  disconnectedCallback(){
    this._connected=false;this._generation++;
    this.removeEventListener("ll-custom",this._openEvent);this.removeEventListener("hass-action",this._bubbleClick);
    this._resize?.disconnect();this.closePopup();
  }
  async _renderNative(){
    if(!this._config)return;
    const generation=++this._generation;
    const {entity,name,icon,design,grid_options}=this._config;
    const bubble=design==="bubble"&&Boolean(customElements.get("bubble-card"));
    const base={entity,...name?{name}:{},...icon?{icon}:{},...grid_options?{grid_options}:{}};
    const config=bubble ? {type:"custom:bubble-card",card_type:"button",button_type:"switch",...base,
      show_state:true,show_attribute:false,button_action:{tap_action:OPEN},tap_action:{action:"fire-dom-event",hgc_power:true},
      styles:BUBBLE_STYLES}
      : {type:"tile",...base,state_content:["state","brightness"],tap_action:OPEN,
        ...design==="tile"&&this._config.show_brightness_slider?{features:[{type:"light-brightness"}],features_position:"bottom"}:{},
        icon_tap_action:{action:"fire-dom-event",hgc_power:true}};
    try{
      let card;
      if(bubble){card=document.createElement("bubble-card");card.setConfig(config);}
      else{
        const helpers=await window.loadCardHelpers?.();
        if(helpers)card=helpers.createCardElement(config);
        else if(customElements.get("hui-tile-card")){card=document.createElement("hui-tile-card");card.setConfig(config);}
        else throw Error("Home Assistant Tile renderer is not loaded. Open the dashboard again.");
      }
      if(generation!==this._generation)return;
      this._card=card;this._isBubble=bubble;this._nativeConfig=config;this._subtitleSignature=undefined;
      card.layout=this.layout;this._updateRendererState();
      this._mount.replaceChildren(card);
      card.addEventListener("ll-custom",(e)=>{
        if(e.detail?.hgc_power){e.stopPropagation();this._power();}
      });
      if(bubble){
        // Bubble's action API dispatches hass-action for HA's action executor.
        // Capture only the owned card's main tap, leaving its native icon toggle.
        card.addEventListener("hass-action",(event)=>{
          const action=event.detail?.config?.[`${event.detail.action}_action`] ?? event.detail?.config;
          if(action?.hgc_open_popup){event.stopPropagation();this.openPopup();}
          else if(action?.hgc_power){event.stopPropagation();this._power();}
        });
      }
      await card.updateComplete;
      if(generation!==this._generation)return;
      if(!bubble&&card.shadowRoot&&!card.shadowRoot.querySelector("style[data-hgc]")){
        const style=document.createElement("style");style.dataset.hgc="surface";style.textContent=TILE_STYLES;card.shadowRoot.append(style);
      }
      this._styleSurface();
    }catch(error){
      if(generation!==this._generation)return;
      const p=document.createElement("p");p.className="error";p.textContent=error.message;this._mount.replaceChildren(p);
    }
  }
  _updateRendererState(){
    if(!this._card||!this.hass)return;
    const values=subtitleValues(this.hass,this._config,this._gradientActive);
    const keys=Object.keys(values),signature=JSON.stringify(keys);
    if(signature!==this._subtitleSignature){
      this._subtitleSignature=signature;
      const presentation=this._isBubble?{show_state:keys.length>0}:{state_content:keys,hide_state:keys.length===0};
      this._card.setConfig({...this._nativeConfig,...presentation});
    }
    const entity=this._config.entity,state=this.hass.states[entity],source=this.hass;
    // Renderer-scoped presentation data keeps native subtitle markup and sizing.
    // No state is published or changed in Home Assistant's real hass object.
    const attributes={...state?.attributes};
    for(const key of ["hgc_color_count","hgc_gradient_mode"])if(Object.hasOwn(values,key))attributes[key]=values[key];
    if(state?.state==="off"&&values.brightness)attributes.brightness=0;
    const states=state?{...source.states,[entity]:{...state,attributes}}:source.states;
    this._card.hass={...source,states,
      // Native brightness interaction stays native; only its writes join the
      // same entity lane as popup edits and discard requests after disconnect.
      callService:(domain,service,data,...args)=>{
        if(!this._isBubble&&this._config.show_brightness_slider&&domain==="light"&&service==="turn_on"&&
          (Object.hasOwn(data??{},"brightness")||Object.hasOwn(data??{},"brightness_pct"))){
          return serialize(entity,()=>{
            const caps=capabilities(this.hass,entity);
            if(!this.isConnected||this._config.entity!==entity||this._config.design!=="tile"||!this._config.show_brightness_slider||!caps.available||!caps.brightness)return;
            return source.callService(domain,service,data,...args);
          });
        }
        return source.callService(domain,service,data,...args);
      },
      formatEntityState:s=>this._isBubble&&s.entity_id===entity?Object.values(values).join(" · "):source.formatEntityState(s),
      formatEntityAttributeValue:(s,key,...args)=>s.entity_id===entity&&Object.hasOwn(values,key)?values[key]:source.formatEntityAttributeValue(s,key,...args),
    };
  }
  _styleSurface(){
    if(!this._config||!this._card)return;
    const state=this.hass?.states?.[this._config.entity];
    const on=state?.state==="on";
    const colors=on?currentColors(state,this._gradientActive&&capabilities(this.hass,this._config.entity).gradient):[];
    if(colors.length)this._card.style.setProperty("--hgc-brightness-gradient",colorLayer(colors,100));
    else this._card.style.removeProperty("--hgc-brightness-gradient");
    const opacity=this._config.color_background?this._config.color_background_opacity:0;
    if(colors.length)this._card.style.setProperty("--hgc-icon-color",`rgb(${colors[0].join(",")})`);
    else this._card.style.removeProperty("--hgc-icon-color");
    if(on&&colors.length&&this._config.icon_gradient_background)this._card.style.setProperty("--hgc-icon-gradient",colorLayer(colors,this._isBubble?35:100));
    else this._card.style.removeProperty("--hgc-icon-gradient");
    // Tile's icon background lives in its own shadow root. Keep this styling
    // scoped to our renderer and retain its native dimensions and interactions.
    if(!this._isBubble)this._styleTile(this._card);
    let layer=colorLayer(colors,opacity);
    if(on&&!colors.length&&opacity>0){
      layer=`linear-gradient(color-mix(in srgb,var(--state-light-active-color,var(--amber-color)) ${opacity}%,transparent),color-mix(in srgb,var(--state-light-active-color,var(--amber-color)) ${opacity}%,transparent))`;
    }
    const surface=this._isBubble?"var(--bubble-main-background-color,var(--ha-card-background,var(--card-background-color)))":"var(--ha-card-background,var(--card-background-color))";
    this._card.style.setProperty("--hgc-card-fill",`${layer}, linear-gradient(${surface},${surface})`);
    // Use luminance of the composited stops and theme surface to select readable
    // text. Resolve CSS custom properties in the current theme on every hass update.
    this._card.style.removeProperty("--hgc-active-foreground");
    if(colors.length&&opacity>0){
      const probe=document.createElement("span");probe.style.color=surface;
      this.shadowRoot.append(probe);const resolved=getComputedStyle(probe).color;probe.remove();
      const bg=resolved.match(/[\d.]+/g)?.slice(0,3).map(Number)??[127,127,127];
      const luminances=colors.map((rgb)=>rgb.map((n,i)=>(n*opacity/100+bg[i]*(1-opacity/100))/255)
        .map((n)=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0));
      const dark=Math.min(...luminances)>.22;
      this._card.style.setProperty("--hgc-active-foreground",dark?"var(--hgc-card-dark-text,#111)":"var(--hgc-card-light-text,#fff)");
      this._card.style.setProperty("--primary-text-color","var(--hgc-active-foreground)");
      this._card.style.setProperty("--secondary-text-color","var(--hgc-active-foreground)");
    }else{
      this._card.style.removeProperty("--primary-text-color");this._card.style.removeProperty("--secondary-text-color");
    }
  }
  async _styleTile(card){
    await card.updateComplete;
    if(card!==this._card||!this.isConnected)return;
    const root=card.shadowRoot?.querySelector("ha-tile-icon")?.shadowRoot;
    if(root&&!root.querySelector("style[data-hgc]")){
      const style=document.createElement("style");style.dataset.hgc="icon";
      style.textContent=".container.background::before{background:var(--hgc-icon-gradient,var(--tile-icon-color)) !important}";root.append(style);
    }
    if(this._config.design!=="tile"||!this._config.show_brightness_slider)return;
    // Guard each owned shadow root; HA loads features asynchronously. Keep all
    // feature sizing, focus, pointer/keyboard handling and tooltips native.
    const features=card.shadowRoot?.querySelector("hui-card-features");
    await features?.updateComplete;
    const wrapper=features?.shadowRoot?.querySelector("hui-card-feature");
    if(!wrapper)return;
    await customElements.whenDefined("hui-light-brightness-card-feature");
    await wrapper.updateComplete;
    const feature=wrapper.shadowRoot?.querySelector("hui-light-brightness-card-feature");
    await feature?.updateComplete;
    const slider=feature?.shadowRoot?.querySelector("ha-control-slider");
    await slider?.updateComplete;
    if(card!==this._card||!this.isConnected)return;
    if(slider?.shadowRoot&&!slider.shadowRoot.querySelector("style[data-hgc]")){
      const style=document.createElement("style");style.dataset.hgc="brightness";style.textContent=BRIGHTNESS_STYLES;slider.shadowRoot.append(style);
    }
  }
  async _power(){
    if(!capabilities(this.hass,this._config.entity).available)return;
    const entity=this._config.entity;
    const service=this.hass.states[entity].state==="on"?"turn_off":"turn_on";
    try{await serialize(entity,()=>{
      if(!this.isConnected||this._config.entity!==entity||!capabilities(this.hass,entity).available)return;
      return this.hass.callService("light",service,{}, {entity_id:entity});
    });}
    catch(error){
      if(this.isConnected&&this._config.entity===entity){this.openPopup();this._editor._error=error.message;}
    }
  }
  openPopup(){
    if(this._dialog||!this._config||!this.hass)return;
    // Native modal dialog supplies focus containment, Escape and top-layer
    // rendering. It lives under the card, so dynamic HA theme variables inherit.
    const dialog=document.createElement("dialog");
    dialog.setAttribute("aria-label",`${this._config.name||this.hass.states[this._config.entity]?.attributes.friendly_name||this._config.entity} light controls`);
    dialog.style.cssText="border:0;padding:0;background:transparent;color:var(--primary-text-color);width:min(var(--hgc-popup-width,352px),calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border-radius:var(--hgc-popup-radius,var(--bubble-pop-up-border-radius,var(--ha-card-border-radius,28px)));";
    const style=document.createElement("style");style.textContent="dialog::backdrop{background:var(--hgc-backdrop-color,rgba(0,0,0,.5))}";dialog.append(style);
    const editor=document.createElement("hue-gradient-editor");editor.popup=true;
    editor.appearanceSource=()=>this._gradientActive;
    editor.setConfig({type:"custom:hue-gradient-editor",entity:this._config.entity,icon_gradient_background:this._config.icon_gradient_background,...this._config.name?{name:this._config.name}:{},...this._config.icon?{icon:this._config.icon}:{}});
    editor.hass=this.hass;dialog.append(editor);this.shadowRoot.append(dialog);
    this._dialog=dialog;this._editor=editor;
    dialog.addEventListener("hgc-close",()=>this.closePopup());
    dialog.addEventListener("cancel",(e)=>{e.preventDefault();this.closePopup();});
    dialog.addEventListener("click",(e)=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.closePopup();}});
    dialog.showModal();editor.updateComplete.then(()=>editor.shadowRoot.querySelector("button")?.focus());
  }
  closePopup(){
    if(!this._dialog)return;
    this._dialog.close();this._dialog.remove();this._dialog=undefined;this._editor=undefined;
    this._card?.focus?.();
  }
  getCardSize(){return this._card?.getCardSize?.()??1;}
  getGridOptions(){return this._card?.getGridOptions?.()??(this._config?.design==="bubble"&&customElements.get("bubble-card")?{columns:12,rows:"auto"}:{columns:6,rows:this._config?.design==="tile"&&this._config.show_brightness_slider?2:1,min_columns:6,min_rows:this._config?.design==="tile"&&this._config.show_brightness_slider?2:1});}
  static getConfigElement(){return document.createElement("hue-gradient-light-card-config-editor");}
  static getStubConfig(hass){return {entity:Object.keys(hass?.states??{}).find((id)=>id.startsWith("light."))??"light.example",design:"tile",color_background_opacity:70};}
}
customElements.define("hue-gradient-light-card",HueGradientLightCard);
