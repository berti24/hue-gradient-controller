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
  presets_expansion: "Preset opening state",
  content: "Content", interactions: "Interactions", features: "Features",
  features_position: "Features position",
};
const SECTION_ICONS = {
  content: "M4 9H20V11H4V9M4 13H14V15H4V13Z",
  interactions: "M10 9V5A2 2 0 0 1 14 5V11.5L15.5 11A2 2 0 0 1 18 13V19A2 2 0 0 1 16 21H10L5 15A1.5 1.5 0 0 1 7 13L10 15V9Z",
  features: "M3 3H21V21H3V3M5 5V7H7V5H5M9 5V7H19V5H9M5 9V11H7V9H5M9 9V11H19V9H9M5 13V15H7V13H5M9 13V15H19V13H9M5 17V19H7V17H5M9 17V19H19V17H9Z",
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
  _label(field) {
    const section = ["content", "interactions", "features"].includes(field.name);
    const key = section ? `generic.${field.name}` : field.name === "features_position" ? "tile.features_position" : undefined;
    return (key && this.hass?.localize?.(`ui.panel.lovelace.editor.card.${key}`)) || LABELS[field.name];
  }
  render() {
    if (!this._config) return nothing;
    const section = (name, schema) => ({name, type:"expandable", flatten:true, iconPath:SECTION_ICONS[name], schema});
    const tile = !this.isEmbeddedEditor && (this._config.design ?? "tile") === "tile";
    const schema = [
      { name: "entity", required: true, selector: { entity: { domain: "light" } } },
      section("content", [
      ...this.isEmbeddedEditor ? [] : [{ name: "design", selector: { select: { options: [
        { value: "tile", label: "Tile like" }, { value: "bubble", label: "Bubble like" },
      ] } } }],
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      ...this.isEmbeddedEditor ? [] : [{name:"state_content",selector:{ui_state_content:{}},context:{filter_entity:"entity"}}],
      { name: "icon_gradient_background", selector: { boolean: {} } },
      ...this.isEmbeddedEditor ? [
        { name: "embedded", selector: { boolean: {} } },
        { name: "card_background", selector: { boolean: {} } },
      ] : [
        { name: "color_background", selector: { boolean: {} } },
        { name: "color_background_opacity", selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      ],
      ]),
      section("interactions", [
        { name: "protect_when_off", selector: { boolean: {} } },
        {name:"presets_expansion",selector:{select:{options:[
          {value:"remember",label:"Remember my preference (initially collapsed)"},
          {value:"collapsed",label:"Always collapsed"},{value:"expanded",label:"Always expanded"},
        ]}}},
      ]),
      ...tile ? [section("features", [
        {name:"show_brightness_slider",selector:{boolean:{}}},
        ...this._config.show_brightness_slider ? [{name:"features_position",required:true,selector:{select:{mode:"box",options:["bottom","inline"].map(value=>({
          value,
          label:this.hass?.localize?.(`ui.panel.lovelace.editor.card.tile.features_position_options.${value}`) || (value === "bottom" ? "Below" : "Inline"),
          description:this.hass?.localize?.(`ui.panel.lovelace.editor.card.tile.features_position_options.${value}_description`) || (value === "bottom" ? "Show the slider below the name." : "Show the slider beside the name, on the right."),
          image:{src:`/static/images/form/tile_features_position_${value}.svg`,src_dark:`/static/images/form/tile_features_position_${value}_dark.svg`,flip_rtl:true},
        }))}}}] : [],
      ])] : [],
    ];
    const data = this.isEmbeddedEditor ? { protect_when_off:false, embedded: false, icon_gradient_background:false, ...this._config, card_background:this._config.card_background ?? !this._config.embedded } : { protect_when_off:false, design: "tile", show_brightness_slider:false, features_position:"bottom", color_background:true, icon_gradient_background:false, color_background_opacity: 70, ...this._config, state_content:subtitleFields(this._config) };
    data.presets_expansion ??= "remember";
    // Offer the integration's display fields through the same native picker as
    // Tile. This scoped hass copy is editor presentation only.
    const entity = this._config.entity, source = this.hass, state = source?.states?.[entity];
    const formHass = state ? {...source,states:{...source.states,[entity]:{...state,attributes:{...state.attributes,hgc_color_count:"",hgc_gradient_mode:""}}},
      formatEntityAttributeName:(s,key)=>({hgc_color_count:"Color count",hgc_gradient_mode:"Gradient mode"}[key] ?? source.formatEntityAttributeName(s,key))} : source;
    return html`
      <p class="version">Hue Gradient Card ${CARD_VERSION}</p>
      <ha-form .hass=${formHass} .schema=${schema} .data=${data}
        .computeLabel=${(field) => this._label(field)} @value-changed=${this._changed}></ha-form>
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
