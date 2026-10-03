import { LitElement, html, css, nothing } from "lit";
import { normalizeConfig, SUBTITLE_DEFAULTS } from "./model.js";

const LABELS = {
  entity: "Entity", design: "Design", name: "Name", icon: "Icon",
  color_background_opacity: "Light color background opacity", embedded: "Embedded",
  show_state: "Subtitle: state", show_brightness: "Subtitle: brightness",
  show_color_count: "Subtitle: color count", show_mode: "Subtitle: mode",
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
      ...this.isEmbeddedEditor ? [] : Object.keys(SUBTITLE_DEFAULTS).map(name=>({name,selector:{boolean:{}}})),
      ...this.isEmbeddedEditor ? [{ name: "embedded", selector: { boolean: {} } }] : [
        { name: "color_background_opacity", selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      ],
    ];
    const data = this.isEmbeddedEditor ? { embedded: false, ...this._config } : { design: "tile", color_background_opacity: 70, ...SUBTITLE_DEFAULTS, ...this._config };
    return html`
      <ha-form .hass=${this.hass} .schema=${schema} .data=${data}
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
