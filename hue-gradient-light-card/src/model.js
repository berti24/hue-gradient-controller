// State and configuration logic is deliberately independent of DOM and Hue APIs.
export const MODE_NAMES = Object.freeze({
  interpolated_palette: "Blended",
  interpolated_palette_mirrored: "Mirrored",
  random_pixelated: "Pixelated",
  segmented_palette: "Segments",
});
const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
export const SUBTITLE_DEFAULTS = Object.freeze({show_state:true,show_brightness:true,show_color_count:false,show_mode:false});
export const rgbValid = (rgb) => Array.isArray(rgb) && rgb.length === 3 &&
  rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
export const xyValid = (xy) => Array.isArray(xy) && xy.length === 2 &&
  xy.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -1 && n <= 1);
export const available = (state) => Boolean(state && !["unavailable", "unknown"].includes(state.state));

export function normalizeConfig(input, editor = false) {
  if (!input || !/^light\.[a-z0-9_]+$/.test(input.entity ?? "")) throw Error("Choose a light entity");
  const config = { ...input };
  for (const key of ["name", "icon"]) {
    if (config[key] != null && typeof config[key] !== "string") throw Error(`${key} must be text`);
    if (!config[key]?.trim()) delete config[key];
    else config[key] = config[key].trim();
  }
  if (editor) {
    if (config.embedded != null && typeof config.embedded !== "boolean") throw Error("embedded must be true or false");
    config.embedded ??= false;
  } else {
    for (const [key, value] of Object.entries(SUBTITLE_DEFAULTS)) {
      if (config[key] != null && typeof config[key] !== "boolean") throw Error(`${key} must be true or false`);
      config[key] ??= value;
    }
    config.design ??= "tile";
    if (!["tile", "bubble"].includes(config.design)) throw Error("Design must be tile or bubble");
    config.color_background_opacity ??= 70;
    const opacity = config.color_background_opacity;
    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
      throw Error("Light color background opacity must be between 0 and 100");
    }
  }
  return config;
}

// Display values only; they never alter hass states or create light entities.
export function subtitleValues(hass, config, gradientActive) {
  const state = hass?.states?.[config.entity];
  if (!state) return {};
  const caps = capabilities(hass, config.entity), attrs = state.attributes;
  const values = {};
  if (config.show_state) values.state = hass.formatEntityState?.(state) ?? state.state;
  if (config.show_brightness && caps.available && caps.brightness && (state.state === "off" || Number.isFinite(attrs.brightness))) {
    values.brightness = `${state.state === "off" ? 0 : Math.round(attrs.brightness / 255 * 100)}%`;
  }
  const colors = currentColors(state, caps.gradient && gradientActive);
  if (config.show_color_count && caps.available && colors.length) values.hgc_color_count = `${colors.length} ${colors.length === 1 ? "color" : "colors"}`;
  if (config.show_mode && caps.available && caps.gradient && gradientActive && colors.length > 1 && MODE_NAMES[attrs.gradient_mode]) {
    values.hgc_gradient_mode = MODE_NAMES[attrs.gradient_mode];
  }
  return values;
}

export function capabilities(hass, entity) {
  const state = hass?.states?.[entity];
  const attrs = state?.attributes ?? {};
  const modes = Array.isArray(attrs.supported_color_modes) ? attrs.supported_color_modes : [];
  const capacity = attrs.gradient_points_capable;
  const gradientModes = Array.isArray(attrs.gradient_modes)
    ? attrs.gradient_modes.filter((mode) => Object.hasOwn(MODE_NAMES, mode)) : [];
  // gradient_capable is published only for selected individual native Hue lights.
  // Reject contradictory registry/group metadata; the server remains authoritative.
  const platform = hass?.entities?.[entity]?.platform;
  const gradient = attrs.gradient_capable === true && (!platform || platform === "hue") &&
    !Array.isArray(attrs.entity_id) && Number.isInteger(capacity) && capacity >= 2 &&
    gradientModes.length > 0 && Boolean(hass?.services?.hue_gradient_controller?.set_gradient);
  const minKelvin = attrs.min_color_temp_kelvin;
  const maxKelvin = attrs.max_color_temp_kelvin;
  return {
    available: available(state), gradient, capacity: gradient ? capacity : 1,
    modes: gradient ? gradientModes : [],
    color: gradient || modes.some((mode) => COLOR_MODES.includes(mode)),
    brightness: modes.some((mode) => mode !== "onoff"),
    temperature: modes.includes("color_temp") && Number.isFinite(minKelvin) &&
      Number.isFinite(maxKelvin) && minKelvin > 0 && maxKelvin > minKelvin,
    minKelvin, maxKelvin,
    transition: Boolean((attrs.supported_features ?? 0) & 32),
  };
}

export function gradientDisplay(attrs) {
  const xy = attrs.gradient_colors_xy;
  if (!Array.isArray(xy) || xy.length < 2 || !xy.every(xyValid)) return [];
  const rgb = attrs.gradient_colors_rgb;
  if (Array.isArray(rgb) && rgb.length === xy.length && rgb.every(rgbValid)) return rgb.map((c) => [...c]);
  const hex = attrs.gradient_colors;
  if (Array.isArray(hex) && hex.length === xy.length && hex.every((c) => /^#[\dA-Fa-f]{6}$/.test(c))) {
    return hex.map((c) => [1, 3, 5].map((start) => parseInt(c.slice(start, start + 2), 16)));
  }
  return [];
}

// Native Hue color_mode distinguishes Kelvin from XY, but not gradient from XY.
// Event-stream updates changing native XY while retaining identical historical
// points must stop showing those points. No frontend polling or bridge access.
export class AppearanceTracker {
  observe(state) {
    const attrs = state?.attributes ?? {};
    if (!available(state)) return !this.solid && gradientDisplay(attrs).length > 1;
    const points = JSON.stringify(attrs.gradient_colors_xy ?? []);
    const native = JSON.stringify([attrs.color_mode, attrs.xy_color, attrs.rgb_color, attrs.hs_color]);
    if (this.points !== undefined) {
      if (points !== this.points) this.solid = false;
      else if (state.state === "on" && this.native !== undefined && native !== this.native) this.solid = true;
    }
    this.points = points;
    // HA clears native color attributes when off. Keep the last on-state color
    // so an ordinary power cycle is not mistaken for switching to solid color.
    if (state.state === "on") this.native = native;
    if (attrs.color_mode === "color_temp") this.solid = true;
    return !this.solid && attrs.color_mode !== "color_temp" && gradientDisplay(attrs).length > 1;
  }
}

export function currentColors(state, gradientActive) {
  const attrs = state?.attributes ?? {};
  if (gradientActive) return gradientDisplay(attrs);
  if (attrs.color_mode === "color_temp" && Number.isFinite(attrs.color_temp_kelvin)) return [kelvinRgb(attrs.color_temp_kelvin)];
  if (rgbValid(attrs.rgb_color)) return [[...attrs.rgb_color]];
  if (Array.isArray(attrs.hs_color) && attrs.hs_color.length === 2 && attrs.hs_color.every(Number.isFinite)) {
    return [hsvRgb(attrs.hs_color[0], attrs.hs_color[1] / 100)];
  }
  return [];
}

export function hsvRgb(hue, saturation, value = 1) {
  const h = ((hue % 360) + 360) % 360 / 60;
  const c = value * saturation, x = c * (1 - Math.abs(h % 2 - 1)), m = value - c;
  const channel = [[c,x,0], [x,c,0], [0,c,x], [0,x,c], [x,0,c], [c,0,x]][Math.floor(h)];
  return channel.map((n) => Math.round((n + m) * 255));
}
export function rgbHsv(rgb) {
  const [r,g,b] = rgb.map((n) => n / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
  let h = delta === 0 ? 0 : max === r ? ((g-b) / delta) % 6 : max === g ? (b-r) / delta + 2 : (r-g) / delta + 4;
  return [((h * 60) + 360) % 360, max === 0 ? 0 : delta / max];
}
// HA's documented approximate temperature display conversion. Kelvin commands
// use the entity's native bounds; no Kelvin labels are attached to palette stops.
export function kelvinRgb(kelvin) {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  return [t <= 66 ? 255 : 329.698727446 * (t-60) ** -0.1332047592,
    t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t-60) ** -0.0755148492,
    t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t-10) - 305.0447927307]
    .map((n) => Math.round(Math.max(0, Math.min(255, n))));
}
export function colorLayer(colors, opacity) {
  if (!colors.length || opacity === 0) return "none";
  const stops = colors.map((rgb) => `rgba(${rgb.join(",")},${opacity / 100})`);
  if (stops.length === 1) stops.push(stops[0]);
  return `linear-gradient(110deg,${stops.join(",")})`;
}
export function validSnapshot(snapshot, entity, caps) {
  const entry = snapshot?.entities?.[entity];
  return Boolean(snapshot?.version === 1 && Object.keys(snapshot.entities ?? {}).length === 1 &&
    entry && Array.isArray(entry.colors_xy) && entry.colors_xy.length >= 2 &&
    entry.colors_xy.length <= caps.capacity && entry.colors_xy.every(xyValid) &&
    caps.modes.includes(entry.mode) && typeof entry.on === "boolean" &&
    (entry.brightness === null || (Number.isFinite(entry.brightness) && entry.brightness >= 0 && entry.brightness <= 100)));
}
