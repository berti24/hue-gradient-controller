import { LitElement, html, css, nothing } from "lit";
import { normalizeConfig, subtitleFields } from "./model.js";

export const CARD_VERSION = __HGC_VERSION__;

const LABELS = {
  entity: "Entity", design: "Design", name: "Name", icon: "Icon",
  color_background_opacity: "Light color background opacity", embedded: "Embedded",
  color_background: "Light color card background", icon_gradient_background: "Gradient icon background",
  state_content: "Subtitle", protect_when_off: "Protect while off",
  card_background: "Card background",
  show_brightness_slider: "Brightness slider",
};
export class ConfigEditor extends LitElement {
  static properties = { hass: {}, _config: { state: true }, _error: { state: true } };
  setConfig(config) { this._config = { ...config }; }
  get isEmbeddedEditor() { return false; }
  connectedCallback() {
    super.connectedCallback();
    // Loading the native Tile editor also registers HA's lazily loaded form.
    window.loadCardHelpers?.().then((helpers) => helpers.createCardElement({ type: "tile", entity: "light.preview" }))
      .then((tile) => tile.constructor.getConfigElement?.()).catch(() => {});
  }
  _changed(event) {
    event.stopPropagation();
    const candidate = { ...this._config, ...event.detail.value };
    if (Object.hasOwn(event.detail.value,"state_content")) candidate.state_content = event.detail.value.state_content ?? [];
    try {
      this._config = normalizeConfig(candidate, this.isEmbeddedEditor);
      this._error = "";
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    } catch (error) { this._error = error.message; }
  }
  render() {
    if (!this._config) return nothing;
    const schema = [
      { name: "entity", required: true, selector: { entity: { domain: "light" } } },
      ...this.isEmbeddedEditor ? [] : [{ name: "design", selector: { select: { options: [
        { value: "tile", label: "Tile like" }, { value: "bubble", label: "Bubble like" },
      ] } } }],
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "protect_when_off", selector: { boolean: {} } },
      ...this.isEmbeddedEditor ? [] : [{name:"state_content",selector:{ui_state_content:{}},context:{filter_entity:"entity"}}],
      ...!this.isEmbeddedEditor && (this._config.design ?? "tile") === "tile" ? [{name:"show_brightness_slider",selector:{boolean:{}}}] : [],
      { name: "icon_gradient_background", selector: { boolean: {} } },
      ...this.isEmbeddedEditor ? [
        { name: "embedded", selector: { boolean: {} } },
        { name: "card_background", selector: { boolean: {} } },
      ] : [
        { name: "color_background", selector: { boolean: {} } },
        { name: "color_background_opacity", selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      ],
    ];
    const data = this.isEmbeddedEditor ? { protect_when_off:false, embedded: false, icon_gradient_background:false, ...this._config, card_background:this._config.card_background ?? !this._config.embedded } : { protect_when_off:false, design: "tile", show_brightness_slider:false, color_background:true, icon_gradient_background:false, color_background_opacity: 70, ...this._config, state_content:subtitleFields(this._config) };
    // Offer the integration's display fields through the same native picker as
    // Tile. This scoped hass copy is editor presentation only.
    const entity = this._config.entity, source = this.hass, state = source?.states?.[entity];
    const formHass = state ? {...source,states:{...source.states,[entity]:{...state,attributes:{...state.attributes,hgc_color_count:"",hgc_gradient_mode:""}}},
      formatEntityAttributeName:(s,key)=>({hgc_color_count:"Color count",hgc_gradient_mode:"Gradient mode"}[key] ?? source.formatEntityAttributeName(s,key))} : source;
    return html`
      <p class="version">Hue Gradient Card ${CARD_VERSION}</p>
      <ha-form .hass=${formHass} .schema=${schema} .data=${data}
        .computeLabel=${(field) => LABELS[field.name]} @value-changed=${this._changed}></ha-form>
      ${!this.isEmbeddedEditor && data.design === "bubble" && !customElements.get("bubble-card") ? html`
        <p role="status">Install Bubble Card in HACS and register its dashboard resource. A Tile is shown until Bubble Card loads.</p>` : nothing}
      ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
    `;
  }
  static styles = css`:host { display:block; color:var(--primary-text-color); } p { color:var(--secondary-text-color); } [role=alert] { color:var(--error-color); }`;
}
export class EmbeddedConfigEditor extends ConfigEditor { get isEmbeddedEditor() { return true; } }
customElements.define("hue-gradient-light-card-config-editor", ConfigEditor);
customElements.define("hue-gradient-editor-config-editor", EmbeddedConfigEditor);
