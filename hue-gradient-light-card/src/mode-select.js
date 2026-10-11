import { LitElement, html, css, nothing } from "lit";
import { MODE_NAMES } from "./model.js";

// A native popover supplies light-dismiss/top-layer behavior. The listbox stays
// inside this component's theme and uses the same radius as its trigger.
export class HueGradientModeSelect extends LitElement {
  static properties={modes:{attribute:false},value:{},disabled:{type:Boolean},
    _open:{state:true},_active:{state:true}};
  constructor(){
    super();this.modes=[];this.value="";this.disabled=false;this._open=false;this._active=0;
    this._dismiss=()=>this._hide();
  }
  disconnectedCallback(){super.disconnectedCallback();this._hide();this._removeListeners();}
  updated(){
    if(this.disabled&&this._open)this._hide();
    if(this._active>=this.modes.length)this._active=Math.max(0,this.modes.indexOf(this.value));
  }
  _removeListeners(){
    window.removeEventListener("resize",this._dismiss);
    window.removeEventListener("scroll",this._dismiss,true);
  }
  _hide(){
    const menu=this.renderRoot.querySelector(".menu");
    if(menu?.matches(":popover-open"))menu.hidePopover();
    this._open=false;this._removeListeners();
  }
  _show(){
    if(this.disabled||!this.modes.length)return;
    const trigger=this.renderRoot.querySelector(".trigger"),menu=this.renderRoot.querySelector(".menu");
    this._active=Math.max(0,this.modes.indexOf(this.value));
    const rect=trigger.getBoundingClientRect();
    const measure=document.createElement("span");
    measure.style.cssText="position:absolute;visibility:hidden;pointer-events:none;width:var(--hgc-mode-menu-viewport-padding,8px);height:var(--hgc-mode-menu-gap,8px)";
    this.renderRoot.append(measure);const {width:gutter,height:gap}=measure.getBoundingClientRect();measure.remove();
    const width=Math.min(rect.width,window.innerWidth-2*gutter);
    menu.style.width=`${width}px`;
    menu.style.maxHeight=`min(var(--hgc-mode-menu-max-height,240px),${window.innerHeight-2*gutter}px)`;
    menu.showPopover();
    const height=menu.getBoundingClientRect().height;
    menu.style.left=`${Math.max(gutter,Math.min(rect.left,window.innerWidth-width-gutter))}px`;
    menu.style.top=`${Math.max(gutter,rect.bottom+height+gap>window.innerHeight-gutter?rect.top-height-gap:rect.bottom+gap)}px`;
    this._open=true;
    window.addEventListener("resize",this._dismiss);
    window.addEventListener("scroll",this._dismiss,true);
  }
  _choose(index){
    const value=this.modes[index];
    if(this.disabled||!value)return;
    this._hide();
    if(value!==this.value)this.dispatchEvent(new CustomEvent("mode-changed",{detail:{value},bubbles:true,composed:true}));
  }
  _key(event){
    const key=event.key;
    if(key==="Escape"&&this._open){event.preventDefault();event.stopPropagation();this._hide();return;}
    if(key==="Tab"){this._hide();return;}
    if(["Enter"," "].includes(key)){
      event.preventDefault();if(this._open)this._choose(this._active);else this._show();return;
    }
    if(["ArrowDown","ArrowUp","Home","End"].includes(key)){
      event.preventDefault();
      const wasOpen=this._open;if(!wasOpen)this._show();
      if(key==="Home")this._active=0;
      else if(key==="End")this._active=this.modes.length-1;
      else if(wasOpen)this._active=(this._active+(key==="ArrowDown"?1:-1)+this.modes.length)%this.modes.length;
      return;
    }
    if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const index=this.modes.findIndex(mode=>MODE_NAMES[mode].toLowerCase().startsWith(key.toLowerCase()));
      if(index>=0){event.preventDefault();if(!this._open)this._show();this._active=index;}
    }
  }
  render(){
    return html`<button class="trigger" role="combobox" aria-label="Gradient mode"
      aria-haspopup="listbox" aria-controls="mode-options" aria-expanded=${String(this._open)}
      aria-activedescendant=${this._open?`mode-option-${this._active}`:nothing} ?disabled=${this.disabled}
      @click=${()=>this._open?this._hide():this._show()} @keydown=${this._key}
      @blur=${()=>this._hide()}>
      <span>${MODE_NAMES[this.value]??"Select gradient mode"}</span><ha-icon icon="mdi:chevron-down" aria-hidden="true"></ha-icon>
    </button>
    <div class="menu" id="mode-options" role="listbox" aria-label="Gradient mode options" popover="auto"
      @toggle=${event=>{this._open=event.newState==="open";if(!this._open)this._removeListeners();}}
      @pointerdown=${event=>event.preventDefault()}>
      ${this.modes.map((mode,index)=>html`<div class=${`option${index===this._active?" active":""}`}
        id=${`mode-option-${index}`} role="option" aria-selected=${String(mode===this.value)}
        @pointermove=${()=>{this._active=index;}} @click=${()=>this._choose(index)}>
        <span>${MODE_NAMES[mode]}</span>${mode===this.value?html`<ha-icon icon="mdi:check" aria-hidden="true"></ha-icon>`:nothing}
      </div>`)}
    </div>`;
  }
  static styles=css`
    :host{display:block;color:var(--hgc-text-color,var(--primary-text-color));}
    *{box-sizing:border-box;}
    .trigger,.menu{font:inherit;color:inherit;background:var(--_control,var(--secondary-background-color));border:var(--hgc-control-border-width,1px) solid var(--_border,var(--divider-color));border-radius:var(--_radius,var(--ha-border-radius-lg,24px));}
    .trigger{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:var(--hgc-control-height,44px);padding:var(--hgc-select-padding,8px 16px);gap:var(--hgc-button-gap,8px);text-align:start;cursor:pointer;}
    .trigger:disabled{opacity:var(--hgc-disabled-opacity,.45);cursor:default;}
    .trigger:focus-visible{outline:var(--hgc-focus-width,3px) solid var(--hgc-focus-color,var(--primary-color));outline-offset:var(--hgc-focus-offset,3px);}
    ha-icon{--mdc-icon-size:var(--hgc-icon-size,24px);flex:none;}
    .menu{position:fixed;inset:auto;margin:0;padding:var(--hgc-mode-menu-padding,6px);max-height:var(--hgc-mode-menu-max-height,240px);overflow:auto;box-shadow:var(--hgc-mode-menu-shadow,var(--ha-card-box-shadow,0 4px 16px rgba(0,0,0,.2)));border-radius:var(--hgc-mode-menu-radius,var(--_radius,var(--ha-border-radius-lg,24px)));}
    .option{display:flex;align-items:center;justify-content:space-between;gap:var(--hgc-button-gap,8px);min-height:var(--hgc-control-height,44px);padding:var(--hgc-select-padding,8px 16px);border-radius:var(--hgc-mode-option-radius,var(--_radius,var(--ha-border-radius-lg,24px)));cursor:pointer;}
    .option.active{background:var(--hgc-mode-option-active,var(--ha-card-background,var(--card-background-color)));}
  `;
}
customElements.define("hgc-mode-select",HueGradientModeSelect);
