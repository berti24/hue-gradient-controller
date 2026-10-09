import { LitElement, html, svg, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { normalizeConfig, capabilities, AppearanceTracker, currentColors, validSnapshot, nextColor, colorLayer, sameXy } from "./model.js";
import { discPoint, paletteColor, markerPosition, connectorPath, separateMarkers } from "./palette.js";
import { LiveWriter, serialize } from "./writes.js";
import { editorStyles } from "./editor-styles.js";
import { rememberPreset, activePreset } from "./presets.js";
import "./mode-select.js";
import "./preset-browser.js";

let pointId = 0;
export class HueGradientEditor extends LitElement {
  static properties = {
    _config: { state: true }, _points: { state: true }, _selected: { state: true },
    _whites: { state: true }, _brightness: { state: true }, _kelvin: { state: true }, _mode: { state: true },
    _error: { state: true }, _snapshot: { state: true }, _menu: { state: true },
    _busyAction: { state: true }, _transition: { state: true }, _hass: { state: true },
    _touchReady: { state: true }, _powerIntent: { state: true },
    _presetLibrary: { state:true }, _presetOrigin: { state:true }, _presetApplied: { state:true },
  };
  constructor() {
    super(); this._points = []; this._selected = 0; this._whites = false;
    this._tracker = new AppearanceTracker(); this._transition = 0; this._error = "";
    // Touch listeners must be non-passive so an armed hold can own the drag.
    // Before arming, native scrolling and zooming remain available.
    this._touchHandlers = Object.fromEntries(["start", "move", "end", "cancel"].map(type => [type,
      { handleEvent: event => this[`_touch${type[0].toUpperCase()}${type.slice(1)}`](event), passive: false }]));
  }
  setConfig(input) {
    const config = normalizeConfig(input, true);
    if (this._config?.entity !== config.entity) {
      this._clearTouch(); this._drag = undefined; this._powerIntent = undefined; this._reportedColors = undefined;
      this._writer?.dispose(); this._writer = undefined; this._tracker = new AppearanceTracker();
      this._snapshot = undefined; this._points = []; this._lastState = undefined;
      this._presetLibrary=false;this._presetOrigin=undefined;this._presetApplied=undefined;
    }
    this._config = config;
    if (!config.protect_when_off) this._powerIntent = undefined;
    if (this.offProtected) this._cancelEdits();
    this._sync();
  }
  set hass(value) { this._hass = value; this._sync(); }
  get hass() { return this._hass; }
  get caps() { return capabilities(this.hass, this._config?.entity); }
  get state() { return this.hass?.states?.[this._config?.entity]; }
  get offProtected() { return Boolean(this._config?.protect_when_off && (this.state?.state !== "on" || this._powerIntent)); }
  get canEdit() { return this.caps.available && !this._busyAction && !this.offProtected; }
  get name() { return this._config?.name || (this.state && this.hass?.formatEntityName?.(this.state)) || this.state?.attributes.friendly_name || this._config?.entity; }
  get icon() { return this._config?.icon || this.hass?.entities?.[this._config?.entity]?.icon || this.state?.attributes.icon || "mdi:lightbulb"; }
  get points() { return this._points.map((point) => [...point.rgb]); }
  connectedCallback() { super.connectedCallback(); this._ensureWriter(); }
  disconnectedCallback() {
    super.disconnectedCallback(); this._writer?.dispose(); this._writer = undefined;
    clearTimeout(this._reconcileTimer); this._clearTouch(); this._drag = undefined; this._powerIntent = undefined;
    // A reused dashboard editor must not retain feedback whose timer was canceled.
    this._optimistic = false; this._adoptReported();
  }
  _ensureWriter() {
    if (!this.isConnected || !this._config || !this.hass || this._writer) return;
    const entity = this._config.entity;
    this._writer = new LiveWriter(entity, (command) => {
      const caps = this.caps;
      if (!caps.available) throw Error("Light is unavailable");
      if (this.offProtected && command.key !== "power" && command.service !== "turn_off") return;
      if (command.domain === "hue_gradient_controller" && !caps.gradient) throw Error("Gradient control is no longer available for this light");
      if(command.service==="apply_preset") {
        return this.hass.callWS({type:"call_service",domain:command.domain,service:command.service,
          service_data:command.data,target:{entity_id:entity},return_response:true}).then(result=>{
          const applied=result?.response?.applied?.[entity];
          if(!applied)throw Error(`Preset could not apply: ${result?.response?.skipped?.[entity]??"no confirmation"}`);
          rememberPreset(this.hass,entity,{id:command.data.preset_id,...applied});
          if(this._config.entity===entity) {
            if(this._tracker.confirmGradient(this.state,applied))this._gradientActive=true;
            this.gradientConfirmed?.(applied);
          }
          if(!this.isConnected||this._config.entity!==entity)return;
          this._presetOrigin=command.data.preset_id;
          this._presetApplied={id:command.data.preset_id,...applied};
        });
      }
      return this.hass.callService(command.domain, command.service, command.data, { entity_id: entity });
    }, (error) => {
      if (error) {
        this._powerIntent = undefined; this.powerIntentChanged?.();
        this._error = error.message || "Light command was rejected";
        this._optimistic = false; this._adoptReported();
      } else {
        // Response-less best-effort actions can skip targets. Never retain an
        // unconfirmed edit forever: return to authoritative hass state.
        clearTimeout(this._reconcileTimer);
        const reconcile=()=>{
          if(this._drag){this._reconcileTimer=setTimeout(reconcile,1800);return;}
          this._optimistic = false; this._adoptReported();
        };
        this._reconcileTimer = setTimeout(reconcile, Math.max(1800, this._transition * 1000 + 1200));
      }
      this.requestUpdate();
    });
  }
  _sync() {
    if (!this._config || !this.hass) return;
    if(!this.caps.gradient)this._presetLibrary=false;
    this._ensureWriter();
    const state = this.state;
    if (state === this._lastState) return;
    this._gradientActive = this._tracker.observe(state);
    if (this.appearanceSource) this._gradientActive = this.appearanceSource();
    const reportedColors = currentColors(state, this.caps.gradient && this._gradientActive);
    if (reportedColors.length) this._reportedColors = reportedColors;
    const before = this._lastState;
    this._lastState = state;
    if ((this._powerIntent === "off" && state?.state === "off") || (this._powerIntent === "on" && state?.state === "on")) this._powerIntent = undefined;
    if (state?.state !== before?.state) {
      // Power updates are authoritative even while a color edit is awaiting an
      // echo. Both palette views must show off immediately, without a timeout.
      this._optimistic = false; clearTimeout(this._reconcileTimer);
    }
    if (!this.caps.available || (this.offProtected && state?.state !== before?.state)) this._cancelEdits();
    if (this._optimistic) {
      // Intermediate echoes cannot move a marker underneath an active gesture.
      this._externalState = state;
      return;
    }
    if (state !== before) { this._optimistic = false; this._adoptReported(); }
  }
  _adoptReported() {
    if (!this._config) return;
    const colors = currentColors(this.state, this.caps.gradient && this._gradientActive);
    if (colors.length) this._reportedColors = colors;
    const actual = colors.length ? colors : this.offProtected && this._reportedColors?.length ? this._reportedColors : [[255,255,255]];
    const xy=this.caps.gradient&&this._gradientActive?this.state?.attributes.gradient_colors_xy:undefined;
    const confirmedPreset=activePreset(this.hass,this._config.entity,this._gradientActive);
    this._points = actual.map((rgb, index) => {
      const previous=this._points[index];
      const anchor=previous?.placementRgb??previous?.rgb;
      // Keep placement separate from live RGB. Hue's display conversion must
      // update swatches without re-inverting or re-spacing an unchanged color.
      const stable=previous?.picker&&(sameXy(previous.reportedXy,xy?.[index])||
        (confirmedPreset&&previous.previewPresetId===confirmedPreset.id)||anchor?.every((n,i)=>Math.abs(n-rgb[i])<=3));
      return {id:previous?.id ?? ++pointId,rgb,
        picker:stable?previous.picker:undefined,preferred:previous?.picker,
        placementRgb:stable?anchor:rgb,reportedXy:xy?.[index]?[...xy[index]]:undefined};
    });
    this._placePoints();
    this._selected = Math.min(this._selected, this._points.length - 1);
    this._brightness = this.state?.state === "off" ? 0 : Math.round((this.state?.attributes.brightness ?? 255) / 255 * 100);
    this._kelvin = this.state?.attributes.color_temp_kelvin ?? this.caps.minKelvin;
    this._mode = this.state?.attributes.gradient_mode;
  }
  _placePoints() {
    const placed=this._points.filter(point=>point.picker?.whites===this._whites).map(point=>point.picker);
    this._points=this._points.map(point=>{
      if(point.picker?.whites===this._whites)return point;
      const preferred=point.preferred?.whites===this._whites?point.preferred:undefined;
      const position=markerPosition(point.rgb,this._whites,preferred);
      const picker={...separateMarkers([...placed,position],placed.length).at(-1),whites:this._whites};
      placed.push(picker);
      return {...point,picker,preferred:undefined};
    });
  }
  _switchPalette() { this._whites=!this._whites; this._placePoints(); }
  _cancelEdits() {
    this._clearTouch(); this._drag = undefined; this._writer?.cancelPending();
    this._optimistic = false; clearTimeout(this._reconcileTimer); this._adoptReported();
  }
  _preparePower(service) {
    if (!this._config.protect_when_off) return;
    if (service === "turn_off") { this._cancelEdits(); this._brightness = 0; }
    this._powerIntent = service === "turn_off" ? "off" : "on";
    this.powerIntentChanged?.(service);
  }
  _queue(command, immediate = false) {
    if (!this.caps.available) return;
    if (this.offProtected && command.key !== "power" && command.service !== "turn_off") return;
    this._error = ""; this._optimistic = true; clearTimeout(this._reconcileTimer);
    command.key ??= command.data.colors || command.data.rgb_color || command.data.color_temp_kelvin ? "color"
      : command.data.brightness !== undefined ? "brightness" : "power";
    this._ensureWriter(); this._writer?.enqueue(command, immediate);
  }
  _colorCommand(immediate = false) {
    const caps = this.caps;
    if (!this.canEdit || !caps.color) return;
    this._presetApplied=undefined;
    rememberPreset(this.hass,this._config.entity,undefined);
    this._points=this._points.map(point=>({...point,previewPresetId:undefined}));
    const data = caps.transition || caps.gradient ? { transition: this._transition } : {};
    if (caps.gradient) {
      if (this._points.length > caps.capacity) { this._error = "The reported palette exceeds this light's capacity"; return; }
      if (this._points.length > 1 && !caps.modes.includes(this._mode)) {
        this._error = "Choose a supported gradient mode"; return;
      }
      Object.assign(data, { colors: this.points, turn_on: true });
      if (this._points.length > 1) data.mode = this._mode;
      this._queue({ domain: "hue_gradient_controller", service: "set_gradient", data }, immediate);
    } else {
      data.rgb_color = this.points[0];
      this._queue({ domain: "light", service: "turn_on", data }, immediate);
    }
  }
  _applyPreset(preset) {
    const caps=this.caps;
    if(!this.canEdit||!caps.gradient||preset.preview_rgb.length>caps.capacity||!caps.modes.includes(preset.mode))return;
    this._clearTouch();this._drag=undefined;
    this._points=preset.preview_rgb.map(rgb=>({id:++pointId,rgb:[...rgb],previewPresetId:preset.id}));
    this._placePoints();this._selected=0;this._mode=preset.mode;this._presetApplied=undefined;
    rememberPreset(this.hass,this._config.entity,undefined);
    this._queue({domain:"hue_gradient_controller",service:"apply_preset",key:"color",
      data:{preset_id:preset.id,transition:this._transition,turn_on:true}},true);
  }
  get selectedPresetId() {
    return activePreset(this.hass,this._config?.entity,this._gradientActive)?.id;
  }
  _add() {
    if (!this.canEdit || !this.caps.gradient || this._points.length >= this.caps.capacity) return;
    this._points = [...this._points, { id: ++pointId, rgb: nextColor(this.points) }];
    this._placePoints();
    this._selected = this._points.length - 1;
    this._colorCommand(true);
  }
  _remove(index) {
    if (!this.canEdit || !this.caps.gradient || this._points.length <= 1) return;
    this._points = this._points.filter((_, i) => i !== index);
    this._selected = Math.min(index, this._points.length - 1);
    this._colorCommand(true);
  }
  _position(event) {
    const rect = this.renderRoot.querySelector(".wheel").getBoundingClientRect();
    return discPoint((event.clientX - rect.left - rect.width / 2) / (rect.width * .46),
      (event.clientY - rect.top - rect.height / 2) / (rect.height * .46));
  }
  _pointerDown(event, index) {
    if (event.pointerType === "touch" || !this.canEdit || event.button > 0) return;
    event.preventDefault(); event.stopPropagation();
    const selected = index === this._selected;
    if (index !== undefined) this._selected = index;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    this._drag = { id: event.pointerId, x: event.clientX, y: event.clientY, selected, index, moved: false };
    if (index === undefined) this._moveColor(event);
  }
  _pointerMove(event) {
    if (event.pointerType === "touch" || !this.canEdit) return;
    if (this._drag?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - this._drag.x, event.clientY - this._drag.y) > 4) this._drag.moved = true;
    if (this._drag.moved || this._drag.index === undefined) this._moveColor(event);
  }
  _moveColor(event) {
    if (!this.canEdit) return;
    const [x,y] = this._position(event);
    const rgb=paletteColor(x,y,this._whites);
    this._points = this._points.map((point, i) => i === this._selected ? { ...point,
      rgb,placementRgb:rgb,reportedXy:undefined,picker:{x,y,whites:this._whites,outside:false} } : point);
    this._colorCommand();
  }
  _pointerUp(event) {
    if (event.pointerType === "touch") return;
    if (this._drag?.id !== event.pointerId) return;
    const drag = this._drag;
    this._drag = undefined;
    if (drag.moved || drag.index === undefined) this._writer?.flush();
    else if (drag.selected && drag.index !== undefined && this._points.length > 1) this._remove(drag.index);
  }
  _pointerCancel(event) {
    if (event?.pointerType === "touch") return;
    this._cancelEdits();
  }
  _clearTouch() {
    clearTimeout(this._holdTimer); this._holdTimer = undefined;
    this._touchGesture = undefined; this._touchReady = false;
  }
  _touchStart(event) {
    if (event.touches.length !== 1) { this._touchCancel(); return; }
    if (!this.canEdit) return;
    this._clearTouch();
    const point = event.composedPath().find(node => node.classList?.contains("point"));
    const index = point ? Number(point.dataset.index) : undefined;
    const touch = event.touches[0];
    const gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, index,
      selected: index === this._selected, moved: false, armed: false };
    this._touchGesture = gesture;
    this._holdTimer = setTimeout(() => {
      if (this._touchGesture !== gesture || !this.canEdit || (index !== undefined && index >= this._points.length)) { this._clearTouch(); return; }
      gesture.armed = true; this._touchReady = true;
      if (index !== undefined) this._selected = index;
      this._drag = gesture;
      if (index === undefined) this._moveColor(touch);
    }, 400);
  }
  _touchMove(event) {
    const gesture = this._touchGesture;
    if (!gesture) return;
    const touch = [...event.touches].find(touch => touch.identifier === gesture.id);
    if (!touch || event.touches.length !== 1 || !this.canEdit) { this._touchCancel(); return; }
    if (!gesture.armed) {
      // Once scrolling wins, this entire contact stays read-only, even if the
      // finger later pauses. Never suppress native panning before the hold.
      if (Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 8) this._clearTouch();
      return;
    }
    if (!event.cancelable) { this._touchCancel(); return; }
    event.preventDefault();
    if (Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) > 4) gesture.moved = true;
    if (gesture.moved || gesture.index === undefined) this._moveColor(touch);
  }
  _touchEnd(event) {
    const gesture = this._touchGesture;
    const touch = [...event.changedTouches].find(touch => touch.identifier === gesture?.id);
    if (!gesture || !touch) return;
    if (event.cancelable) event.preventDefault(); // Suppress emulated mouse clicks.
    this._clearTouch(); this._drag = undefined;
    if (!this.canEdit) return;
    if (gesture.armed) {
      if (gesture.moved || gesture.index === undefined) this._writer?.flush();
    } else if (gesture.index !== undefined && Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) <= 8) {
      if (gesture.selected && this._points.length > 1) this._remove(gesture.index);
      else this._selected = gesture.index;
    }
  }
  _touchCancel() {
    if (this._touchGesture?.armed) this._cancelEdits();
    else this._clearTouch();
  }
  _pointKey(event, index) {
    if (!this.canEdit) return;
    const movement = { ArrowLeft: [-.035,0], ArrowRight: [.035,0], ArrowUp: [0,-.035], ArrowDown: [0,.035] }[event.key];
    if (movement) {
      event.preventDefault(); this._selected = index;
      const p = this._points[index].picker;
      const [x,y]=discPoint(p.x+movement[0],p.y+movement[1]);
      const rgb=paletteColor(x,y,this._whites);
      this._points = this._points.map((point, i) => i === index ? { ...point,
        rgb,placementRgb:rgb,reportedXy:undefined,picker:{x,y,whites:this._whites,outside:false} } : point);
      this._colorCommand();
    } else if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault(); this._remove(index);
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (index === this._selected) this._remove(index);
      else this._selected = index;
    }
  }
  _brightnessInput(event) {
    if (!this.canEdit) return;
    this._brightness = Number(event.target.value);
    if (this._brightness === 0) this._preparePower("turn_off");
    const data = this.caps.transition ? { transition: this._transition } : {};
    if (this._brightness > 0) data.brightness = Math.round(this._brightness * 255 / 100);
    this._queue({ key: "brightness", domain: "light", service: this._brightness === 0 ? "turn_off" : "turn_on", data });
  }
  _temperatureInput(event) {
    if (!this.canEdit) return;
    this._kelvin = Number(event.target.value);
    this._queue({ domain: "light", service: "turn_on", data: { color_temp_kelvin: this._kelvin,
      ...this.caps.transition ? { transition: this._transition } : {} } });
  }
  _power() {
    if (!this.caps.available || this._busyAction) return;
    const service = this.state?.state === "on" && this._powerIntent !== "off" ? "turn_off" : "turn_on";
    this._preparePower(service);
    if (service === "turn_off") this._brightness = 0;
    this._queue({ key: "power", domain: "light", service, data: {} }, true);
  }
  _closeMenu() { this._menu = false; }
  _moreInfo() {
    this._closeMenu();
    this.dispatchEvent(new CustomEvent("hass-more-info", {detail:{entityId:this._config.entity},bubbles:true,composed:true}));
    if(this.popup)this.dispatchEvent(new CustomEvent("hgc-close", {bubbles:true,composed:true}));
  }
  async _advanced(action) {
    const entity = this._config.entity;
    if (!this.caps.gradient || !this.caps.available || this._busyAction) return;
    if (action === "snapshot" && (this._points.length < 2 || this._writer?.busy || this._optimistic)) return;
    if (action === "restore" && !validSnapshot(this._snapshot, entity, this.caps)) return;
    if (action === "restore" && this.offProtected) return;
    this._busyAction = true; this._error = "";
    try {
      await this._writer?.flush();
      if (!this.isConnected || this._config.entity !== entity) return;
      if (action === "snapshot") {
        const response = await serialize(entity, () => {
          if (!this.isConnected || this._config.entity !== entity) throw Error("Editor closed");
          return this.hass.callWS({ type: "call_service", domain: "hue_gradient_controller",
            service: "snapshot_gradient", target: { entity_id: entity }, service_data: {}, return_response: true });
        });
        if (!this.isConnected || this._config.entity !== entity) return;
        const snapshot = response?.response;
        if (!validSnapshot(snapshot, entity, this.caps)) throw Error("No eligible multi-point gradient was returned");
        this._snapshot = snapshot;
      } else {
        await serialize(entity, () => {
          if (!this.isConnected || this._config.entity !== entity) throw Error("Editor closed");
          if (this.offProtected || !this.caps.available) return;
          return this.hass.callService("hue_gradient_controller", "restore_gradient", { snapshot: this._snapshot, transition: this._transition });
        });
        this._optimistic = false; this._adoptReported();
      }
    } catch (error) { if(this.isConnected && this._config.entity === entity) this._error = error.message || "Gradient action failed"; }
    finally { this._busyAction = false; }
  }
  updated() {
    const canvas = this.renderRoot.querySelector("canvas");
    if (!canvas || canvas.dataset.palette === String(this._whites)) return;
    canvas.dataset.palette = String(this._whites);
    const size = 384; canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d"), pixels = context.createImageData(size,size);
    for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
      const dx = (x-size/2+.5)/(size/2), dy = (y-size/2+.5)/(size/2), r = Math.hypot(dx,dy);
      if (r > 1) continue;
      const rgb = paletteColor(dx,dy,this._whites), offset=(y*size+x)*4;
      pixels.data.set([...rgb, Math.min(255,(1-r)*size*255)],offset);
    }
    context.putImageData(pixels,0,0);
  }
  _overflow() {
    const caps = this.caps;
    return html`<details ?open=${this._menu}>
      <summary aria-label="Advanced light actions" aria-expanded=${String(Boolean(this._menu))}
        @click=${e=>{e.preventDefault();this._menu=!this._menu;}}><ha-icon icon="mdi:dots-horizontal"></ha-icon></summary>
      <div class="menu">
        ${caps.gradient ? html`
          <label>Transition <input type="number" aria-label="Transition in seconds" min="0" max="6000" step="0.1" .value=${String(this._transition)}
            @change=${(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 6000) this._transition = value; else event.target.value = String(this._transition); }}></label>
          ${this.hass?.services?.hue_gradient_controller?.snapshot_gradient ? html`<button ?disabled=${!caps.available || this._points.length < 2 || this._busyAction || this._optimistic} @click=${() => this._advanced("snapshot")}>Snapshot</button>` : nothing}
          ${this.hass?.services?.hue_gradient_controller?.restore_gradient && validSnapshot(this._snapshot,this._config.entity,caps) ? html`<button ?disabled=${!this.canEdit} @click=${() => this._advanced("restore")}>Restore</button>` : nothing}` : nothing}
        <button @click=${this._moreInfo}><ha-icon icon="mdi:information-outline"></ha-icon>More info</button>
      </div>
    </details>`;
  }
  render() {
    if (!this._config || !this.hass) return nothing;
    const caps = this.caps, disabled = !this.canEdit, powerDisabled = !caps.available || this._busyAction;
    const positions = this._points.map(point=>point.picker ?? markerPosition(point.rgb,this._whites));
    const path = connectorPath(positions);
    const on=this.state?.state === "on" && this._powerIntent !== "off", reportedColors=currentColors(this.state,caps.gradient&&this._gradientActive), powerRgb=reportedColors[0];
    const iconBackground=on&&this._config.icon_gradient_background?colorLayer(reportedColors,35):undefined;
    return html`<section class=${`editor${this._config.embedded ? " embedded" : ""}${!this._config.card_background ? " no-card-background" : ""}${this._menu ? " menu-open" : ""}`} aria-label=${`${this.name} light controls`}
      @focusin=${e=>{if(this._menu&&!e.composedPath().some(node=>node.localName==="details"))this._closeMenu();}}
      @keydown=${(e)=>{if(this._menu&&e.key==="Escape"){e.preventDefault();e.stopPropagation();this._closeMenu();this.renderRoot.querySelector("summary")?.focus();}}}>
      ${this._menu ? html`<div class="menu-backdrop" aria-hidden="true" @click=${this._closeMenu} @pointerdown=${(e)=>e.stopPropagation()}></div>` : nothing}
        <header><button class=${`header-icon icon${on ? " on" : ""}`} style=${styleMap({"--hgc-power-color":powerRgb?`rgb(${powerRgb.join(",")})`:undefined,"--hgc-icon-gradient":iconBackground})} aria-label=${on ? "Turn off" : "Turn on"} ?disabled=${powerDisabled} @click=${this._power}>
          <ha-icon .icon=${this.icon}></ha-icon></button><h2>${this.name}</h2>
          ${this._overflow()}
          ${this.popup && !this._config.embedded ? html`<button class="icon" aria-label="Close gradient editor" @click=${() => this.dispatchEvent(new CustomEvent("hgc-close", { bubbles:true,composed:true }))}><ha-icon icon="mdi:close"></ha-icon></button>` : nothing}
        </header>
      ${caps.gradient ? html`<hgc-preset-browser .hass=${this.hass} .entity=${this._config.entity} .caps=${caps}
        .canApply=${this.canEdit} .canSave=${this.canEdit&&this._gradientActive&&this._points.length>1&&!this._optimistic&&!this._writer?.busy}
        .expansion=${this._config.presets_expansion} .selectedId=${this.selectedPresetId} .editingId=${this._presetOrigin??this.selectedPresetId}
        @preset-apply=${e=>this._applyPreset(e.detail.preset)}
        @preset-view-changed=${e=>{this._presetLibrary=e.detail.library;}}></hgc-preset-browser>` : nothing}
      ${!caps.available ? html`<p class="status" role="status">${this.state ? "Light unavailable" : `Entity ${this._config.entity} not found`}</p>` : nothing}
      ${caps.available && this.offProtected ? html`<div class="off-status" role="status">
        <span>${this._powerIntent ? `Turning ${this._powerIntent === "off" ? "off" : "on"}… Editing locked.` : "Light is off. Turn on to edit."}</span>
        <button ?disabled=${powerDisabled} @click=${this._power}><ha-icon icon="mdi:power"></ha-icon>Turn on</button>
      </div>` : nothing}
      <div ?hidden=${this._presetLibrary&&caps.gradient}>
      ${caps.color ? html`
        <div class=${`wheel${this.offProtected ? " off" : ""}${this._touchReady ? " touch-ready" : ""}`} role="group" aria-disabled=${String(disabled)} aria-label=${this._whites ? "White-tone color palette" : "Hue and saturation color wheel"}
          @pointerdown=${(e) => this._pointerDown(e)} @pointermove=${this._pointerMove} @pointerup=${this._pointerUp}
          @pointercancel=${this._pointerCancel} @lostpointercapture=${(e) => { if (this._drag && e.pointerType !== "touch") this._pointerCancel(); }}
          @touchstart=${this._touchHandlers.start} @touchmove=${this._touchHandlers.move}
          @touchend=${this._touchHandlers.end} @touchcancel=${this._touchHandlers.cancel}
          @contextmenu=${e=>e.preventDefault()}>
          <canvas aria-hidden="true"></canvas>
          <svg viewBox="0 0 100 100" aria-hidden="true">${svg`<path class="connector-shadow" d=${path}></path><path class="connector" d=${path}></path>`}</svg>
          ${repeat(this._points,(point) => point.id,(point,index) => {
            const pos=positions[index], selected=index===this._selected;
            const face=this._whites&&pos.outside?paletteColor(pos.x,pos.y,true):point.rgb;
            const text=face.reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0)>155 ? "var(--hgc-point-dark-text,#111)" : "var(--hgc-point-light-text,#fff)";
            return html`<button class=${`point${selected ? " selected" : ""}${pos.outside ? " outside" : ""}`}
              data-index=${index}
              style=${styleMap({ left:`${50+pos.x*46}%`,top:`${50+pos.y*46}%`,"--point-color":`rgb(${face.join(",")})`,"--point-actual-color":`rgb(${point.rgb.join(",")})`,"--point-text":text })}
              ?disabled=${disabled} aria-label=${`Color ${index+1}: RGB ${point.rgb.join(", ")}${pos.outside ? ", outside white palette" : ""}${selected && caps.gradient && this._points.length>1 ? ". Activate to remove; arrow keys move" : ". Activate to select; arrow keys move"}`}
              aria-pressed=${String(selected)} title=${pos.outside ? "Outside white palette; small swatch shows preserved actual color" : `Color ${index+1}`}
              @pointerdown=${(e)=>this._pointerDown(e,index)} @keydown=${(e)=>this._pointKey(e,index)}
              @click=${(e)=> { if(e.detail === 0 && this.canEdit) { if(selected) this._remove(index); else this._selected=index; } }}>
              ${selected && caps.gradient && this._points.length>1 ? html`<ha-icon icon="mdi:close"></ha-icon>` : index+1}
              ${this._whites&&pos.outside ? html`<span class="actual-color" aria-hidden="true"></span>` : nothing}
            </button>`;
          })}
        </div>
        <p class="touch-hint" role="status">${this.offProtected ? "Swipe to scroll" : this._touchReady ? "Ready to drag" : "Hold to edit colors · Swipe to scroll"}</p>
        <div class="row">
          ${caps.gradient ? html`<button @click=${this._add} ?disabled=${disabled || this._points.length>=caps.capacity}><ha-icon icon="mdi:plus"></ha-icon>Add color</button>
            <span class="count" aria-live="polite">${this._points.length} / ${caps.capacity}</span>` : nothing}
          <button class="switch" @click=${this._switchPalette} aria-label=${this._whites ? "View Colors palette" : "View Whites palette"}>
            <ha-icon icon=${this._whites ? "mdi:palette" : "mdi:white-balance-sunny"}></ha-icon>${this._whites ? "Colors" : "Whites"}</button>
        </div>` : nothing}
      ${caps.temperature && !caps.gradient ? html`<div class="temperature">
        <label for="kelvin">White temperature</label><div class="row slider-row">
          <input id="kelvin" type="range" aria-label="White temperature in Kelvin" min=${caps.minKelvin} max=${caps.maxKelvin} step="1"
            .value=${String(this._kelvin ?? caps.minKelvin)} ?disabled=${disabled}
            @input=${this._temperatureInput} @change=${()=>this._writer?.flush()}>
        </div></div>` : nothing}
      ${caps.brightness ? html`<div class="row slider-row"><ha-icon icon="mdi:brightness-6"></ha-icon>
        <input class="brightness" type="range" style=${`--hgc-slider-level:${this._brightness}%`} aria-label="Brightness" aria-valuetext=${`${this._brightness}%`} min="0" max="100" step="1" .value=${String(this._brightness)}
          ?disabled=${disabled} @input=${this._brightnessInput} @change=${()=>this._writer?.flush()}>
        <output>${this._brightness}%</output></div>` : nothing}
      ${!this.offProtected && !caps.color && !caps.brightness && !caps.temperature ? html`<button @click=${this._power} ?disabled=${powerDisabled}><ha-icon icon="mdi:power"></ha-icon>${on ? "Turn off" : "Turn on"}</button>` : nothing}
      ${caps.gradient ? html`<hgc-mode-select .modes=${caps.modes} .value=${this._mode ?? ""}
        .disabled=${disabled || this._points.length<2}
        @mode-changed=${(e)=> {if(this.canEdit){this._mode=e.detail.value;this._colorCommand(true);}}}></hgc-mode-select>` : nothing}
      </div>
      ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
    </section>`;
  }
  static getConfigElement() { return document.createElement("hue-gradient-editor-config-editor"); }
  static getStubConfig(hass) { return { entity:Object.keys(hass?.states ?? {}).find((id)=>id.startsWith("light.")) ?? "light.example", embedded:false }; }
  getCardSize() { return this.caps.color ? 7 : 3; }
  getGridOptions() { return { columns:12, rows:"auto", min_columns:6 }; }
  static styles = editorStyles;
}
customElements.define("hue-gradient-editor",HueGradientEditor);
