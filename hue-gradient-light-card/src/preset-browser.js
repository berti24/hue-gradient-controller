import { LitElement, html, css, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { colorLayer } from "./model.js";
import { subscribePresets, orderedPresets, presetReason, activePreset, PRESET_PREFIX } from "./presets.js";

export class PresetBrowser extends LitElement {
  static properties = {
    hass:{}, entity:{}, caps:{}, canApply:{}, canSave:{}, expansion:{}, selectedId:{}, editingId:{},
    _data:{state:true}, _expanded:{state:true}, _library:{state:true}, _form:{state:true},
    _error:{state:true}, _busy:{state:true}, _name:{state:true},
  };
  constructor() {
    super(); this._data={presets:[],favorites:[],available:false}; this._name=""; this._error="";
    this._expanded=false; this._library=false; this._busy=false; this._scroll=0;
    this._wheelHandler={handleEvent:event=>this._wheel(event),passive:false};
  }
  connectedCallback() { super.connectedCallback(); this._connect(); }
  disconnectedCallback() {
    super.disconnectedCallback(); this._unsubscribe?.(); this._unsubscribe=undefined;
    this._connection=undefined; this._generation=(this._generation??0)+1;
    this._busy=false;this._form=undefined;this._error="";
    this._endPan();
  }
  updated(changed) {
    if (changed.has("hass")) this._connect();
    if (changed.has("entity") || changed.has("expansion")) {
      this._expanded=this.expansion==="expanded" || (this.expansion!=="collapsed" && Boolean(this._data.expanded));
      if (changed.has("entity")) { this._form=undefined; this._error=""; this._library=false; this._scroll=0; }
    }
  }
  _connect() {
    if (!this.isConnected || !this.hass?.connection) return;
    const connection=this.hass.connection, user=this.hass.user?.id;
    if(this._connection===connection && this._user===user)return;
    this._unsubscribe?.(); this._connection=connection; this._user=user;
    this._unsubscribe=subscribePresets(this.hass, data=>{
      this._data=data;
      if((this.expansion??"remember")==="remember")this._expanded=Boolean(data.expanded);
    });
  }
  get presets() { return orderedPresets(this._data.presets,this._data.favorites); }
  _pointerDown(event) {
    if(event.button!==0)return;
    this._start={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,id:event.pointerId,type:event.pointerType};
    this._swipe=false;
  }
  _pointerMove(event) {
    const start=this._start;
    if(!start||event.pointerId!==start.id)return;
    if(start.type!=="touch"&&event.buttons!==1){this._endPan();return;}
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.hypot(dx,dy)>8)this._swipe=true;
    // Native touch scrolling keeps its momentum and vertical page scrolling.
    if(this._library||start.type==="touch"||!this._swipe||Math.abs(dx)<Math.abs(dy))return;
    const list=event.currentTarget;
    if(!this._panning) {
      this._panning=list;list.classList.add("panning");list.setPointerCapture(event.pointerId);
    }
    event.preventDefault();list.scrollLeft=start.left-dx;
  }
  _endPan() {
    const list=this._panning,id=this._start?.id;
    if(list) {
      if(list.hasPointerCapture(id))list.releasePointerCapture(id);
      list.classList.remove("panning");
    }
    this._panning=undefined;this._start=undefined;
  }
  _wheel(event) {
    const list=event.currentTarget;
    if(this._library||event.ctrlKey||event.deltaX||!event.deltaY)return;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?list.clientWidth:1);
    const next=Math.max(0,Math.min(list.scrollWidth-list.clientWidth,list.scrollLeft+delta));
    if(next===list.scrollLeft)return;
    event.preventDefault();list.scrollBy({left:delta,behavior:"smooth"});
  }
  async _command(operation, fields) {
    if(this._busy || !this._data.available)return;
    this._busy=true; this._error="";
    const generation=this._generation??0;
    try {
      const result=await this.hass.callWS({type:PRESET_PREFIX+operation,...fields});
      if(!this.isConnected || generation!==(this._generation??0))return;
      return result??{};
    } catch(error) {
      if(this.isConnected && generation===(this._generation??0))this._error=error.message||"Preset change failed";
    } finally { if(generation===(this._generation??0))this._busy=false; }
  }
  async _toggle() {
    this._expanded=!this._expanded;
    if((this.expansion??"remember")==="remember") {
      const result=await this._command("preferences",{expanded:this._expanded});
      if(!result)this._expanded=Boolean(this._data.expanded);
    }
  }
  _showLibrary() {
    this._scroll=this.renderRoot.querySelector(".carousel")?.scrollLeft??this._scroll;
    this._library=true; this._form=undefined;
    this.dispatchEvent(new CustomEvent("preset-view-changed",{detail:{library:true},bubbles:true,composed:true}));
    this.updateComplete.then(()=>this.renderRoot.querySelector(".back")?.focus());
  }
  _back() {
    this._library=false; this._form=undefined;
    this.dispatchEvent(new CustomEvent("preset-view-changed",{detail:{library:false},bubbles:true,composed:true}));
    this.updateComplete.then(()=>{
      const carousel=this.renderRoot.querySelector(".carousel");if(carousel)carousel.scrollLeft=this._scroll;
      this.renderRoot.querySelector(".see-all")?.focus();
    });
  }
  _apply(preset,event) {
    if((this._swipe&&event.detail!==0) || this._busy || !this.canApply || !this._data.available || presetReason(preset,this.caps))return;
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("preset-apply",{detail:{preset},bubbles:true,composed:true}));
  }
  _openSave() {
    const preset=this._data.presets.find(item=>item.id===this.editingId&&item.can_edit);
    this._name=preset?.name??"";this._form={operation:"save",preset};
    this.updateComplete.then(()=>this.renderRoot.querySelector("input")?.focus());
  }
  async _save(update=false) {
    if(!this.canSave || !this._name.trim())return;
    const preset=this._form.preset;
    const result=await this._command("save",{name:this._name.trim(),source_entity_id:this.entity,
      ...update&&preset?{preset_id:preset.id,revision:preset.revision}:{}});
    if(result)this._form=undefined;
  }
  async _manage() {
    const {preset,operation}=this._form;
    const result=await this._command(operation,{preset_id:preset.id,revision:preset.revision,
      ...operation==="rename"?{name:this._name.trim()}:{}});
    if(result)this._form=undefined;
  }
  _tile(preset) {
    const reason=presetReason(preset,this.caps), favorite=this._data.favorites.includes(preset.id);
    const selected=this.selectedId===preset.id && Boolean(activePreset(this.hass,this.entity,true,[preset]));
    return html`<li class="preset" data-preset-id=${preset.id}>
      <button class=${`apply${selected?" selected":""}`} title=${reason||preset.name}
        aria-label=${`Apply ${preset.name}, ${preset.preview_rgb.length} colors${reason?`. ${reason}`:""}`}
        aria-pressed=${String(selected)}
        ?disabled=${!this.canApply||this._busy||!this._data.available||Boolean(reason)} @click=${e=>this._apply(preset,e)}>
        <span class="swatch" style=${`background:${colorLayer(preset.preview_rgb,100)}`}></span>
        <span class="name">${preset.name}</span><span class="count">${preset.preview_rgb.length} colors</span>
        ${this._library&&reason?html`<span class="reason">${reason}</span>`:nothing}
      </button>
      <button class=${`star${favorite?" favorite":""}`} aria-label=${`${favorite?"Unfavorite":"Favorite"} ${preset.name}`}
        aria-pressed=${String(favorite)} ?disabled=${this._busy||!this._data.available}
        @click=${event=>{if(!this._swipe||event.detail===0)this._command("favorite",{preset_id:preset.id,favorite:!favorite});}}>
        <span class="star-visual"><ha-icon icon=${favorite?"mdi:star":"mdi:star-outline"}></ha-icon></span>
      </button>
      ${this._library&&preset.can_edit?html`<div class="manage">
        <button aria-label=${`Rename ${preset.name}`} @click=${()=>{this._name=preset.name;this._form={operation:"rename",preset};}}>Rename</button>
        <button aria-label=${`Delete ${preset.name}`} @click=${()=>{this._form={operation:"delete",preset};}}>Delete</button>
      </div>`:nothing}
    </li>`;
  }
  _renderForm() {
    if(!this._form)return nothing;
    const {operation,preset}=this._form;
    return html`<form @submit=${e=>{e.preventDefault();operation==="save"?this._save():this._manage();}}>
      ${operation==="delete"?html`<p>Delete “${preset.name}” for everyone? This cannot be undone.</p>`:html`
        <label>Preset name<input maxlength="80" required .value=${this._name}
          @input=${e=>{this._name=e.target.value;}}></label>`}
      <div class="actions">
        <button type="submit" ?disabled=${this._busy||!this._data.available||(operation!=="delete"&&!this._name.trim())||(operation==="save"&&!this.canSave)}>${operation==="save"?"Save new":operation==="delete"?"Delete preset":"Rename preset"}</button>
        ${operation==="save"&&preset?html`<button type="button" ?disabled=${this._busy||!this.canSave||!this._name.trim()} @click=${()=>this._save(true)}>Update preset</button>`:nothing}
        <button type="button" ?disabled=${this._busy} @click=${()=>{this._form=undefined;}}>Cancel</button>
      </div>
    </form>`;
  }
  render() {
    const presets=this.presets;
    return html`<section aria-label="Gradient presets">
      ${this._library?html`<div class="heading"><button class="back" @click=${this._back}><ha-icon icon="mdi:chevron-left"></ha-icon>Back to editor</button><span>Presets</span></div>`:html`
        <div class="heading"><button class="disclosure" aria-expanded=${String(this._expanded)} aria-controls="preset-list"
          @click=${this._toggle} ?disabled=${this._busy}><ha-icon icon=${this._expanded?"mdi:chevron-up":"mdi:chevron-down"}></ha-icon>Presets</button>
          <button class="see-all" @click=${this._showLibrary}>See all</button></div>`}
      ${this._library||this._expanded?html`
        ${!this._data.available?html`<p role="status">${this._data.error||"Loading preset library…"}</p>`:nothing}
        <ul id="preset-list" class=${this._library?"grid":"carousel"} aria-label="Presets"
          @pointerdown=${this._pointerDown} @pointermove=${this._pointerMove}
          @pointerup=${this._endPan} @pointercancel=${()=>{this._swipe=true;this._endPan();}}
          @lostpointercapture=${this._endPan} @wheel=${this._wheelHandler}
          @dragstart=${event=>event.preventDefault()}>
          ${repeat(presets,preset=>preset.id,preset=>this._tile(preset))}
        </ul>
        <div class="footer"><button ?disabled=${!this.canSave||this._busy||!this._data.available} @click=${this._openSave}><ha-icon icon="mdi:plus"></ha-icon>Save current</button>
          ${!this._library?html`<div class="arrows"><button aria-label="Previous presets" @click=${()=>this.renderRoot.querySelector(".carousel")?.scrollBy({left:-200,behavior:"smooth"})}><ha-icon icon="mdi:chevron-left"></ha-icon></button><button aria-label="Next presets" @click=${()=>this.renderRoot.querySelector(".carousel")?.scrollBy({left:200,behavior:"smooth"})}><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>`:nothing}
        </div>`:nothing}
      ${this._renderForm()}${this._error?html`<p role="alert">${this._error}</p>`:nothing}
    </section>`;
  }
  static styles=css`
    .carousel{user-select:none;cursor:grab}.carousel.panning{scroll-snap-type:none;cursor:grabbing}
    .star.star{background:transparent;align-items:flex-start;justify-content:flex-end;padding:4px}
    .star-visual{display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border-radius:8px;background:rgba(0,0,0,.48)}
    .star-visual ha-icon{display:flex;align-items:center;justify-content:center;line-height:0;width:16px;height:16px;--mdc-icon-size:16px}
    :host{display:block;color:inherit;font:inherit;--preset-gap:8px;margin-bottom:16px}
    *{box-sizing:border-box}button,input{font:inherit;color:inherit}button{cursor:pointer;min-height:44px;border:1px solid var(--hgc-border-color,var(--divider-color));background:var(--hgc-control-surface,var(--secondary-background-color));border-radius:var(--hgc-control-radius,24px);padding:8px 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
    button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid var(--hgc-focus-color,var(--primary-color));outline-offset:2px}ha-icon{--mdc-icon-size:20px}
    .heading,.footer,.actions{display:flex;align-items:center;gap:8px;justify-content:space-between}.heading button{border:0;background:transparent;padding:4px 0}.see-all{color:var(--hgc-focus-color,var(--primary-color))}.disclosure{font-weight:500}.footer{margin-top:12px}.arrows{display:flex;gap:4px}.arrows button{padding:6px;width:44px}
    ul{list-style:none;padding:0;margin:8px 0 0}.carousel{display:flex;gap:var(--preset-gap);overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;touch-action:pan-x pan-y pinch-zoom;padding:3px 0}.carousel::-webkit-scrollbar{display:none}.carousel .preset{flex:0 0 calc((100% - 24px)/3.5);scroll-snap-align:start;min-width:0}.preset{position:relative}
    .apply{position:relative;display:flex;flex-direction:column;align-items:stretch;text-align:start;width:100%;padding:0;border:0;background:transparent;border-radius:12px;gap:3px}.swatch{height:52px;border-radius:12px;border:1px solid var(--hgc-border-color,var(--divider-color));display:block}.selected .swatch{outline:2px solid var(--hgc-focus-color,var(--primary-color));outline-offset:1px}.name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;padding:0 2px}.count,.reason{color:var(--hgc-secondary-text-color,var(--secondary-text-color));font-size:11px;padding:0 2px}.star{position:absolute;inset-inline-end:0;top:0;width:44px;height:44px;padding:0;border:0;background:rgba(0,0,0,.48);color:white;border-radius:12px}.favorite{color:#ffe082}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px}.grid .swatch{height:72px}.grid .name{font-size:14px}.grid .reason{white-space:normal}.manage{display:flex;gap:8px;margin-top:4px}.manage button{font-size:12px;min-height:44px;padding:4px 8px}
    form{border-top:1px solid var(--divider-color);margin-top:12px;padding-top:12px}label{display:block}input{display:block;width:100%;margin:6px 0 12px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--hgc-control-surface,var(--secondary-background-color))}.actions{flex-wrap:wrap;justify-content:flex-start}p{font-size:13px;color:var(--secondary-text-color)}[role=alert]{color:var(--error-color)}
  `;
}
customElements.define("hgc-preset-browser",PresetBrowser);
