import { sameXyPoints } from "./model.js";
// One push subscription per authenticated HA connection/user, shared by editors.
const connections = new WeakMap();
// Confirmed identities survive popup disposal within this authenticated session.
// They are hints only: live XY/mode and appearance must still match.
const activePresets = new WeakMap();
export function rememberPreset(hass, entity, preset) {
  if (!hass?.connection) return;
  let users = activePresets.get(hass.connection);
  if (!users) { users = new Map(); activePresets.set(hass.connection, users); }
  const user = hass.user?.id ?? "";
  let entities = users.get(user);
  if (!entities) { entities = new Map(); users.set(user, entities); }
  if (preset) entities.set(entity, {...preset, colors_xy:preset.colors_xy.map(point=>[...point])});
  else entities.delete(entity);
}
export function activePreset(hass, entity, gradientActive, catalogue) {
  const preset = activePresets.get(hass?.connection)?.get(hass.user?.id ?? "")?.get(entity);
  const attrs = hass?.states?.[entity]?.attributes;
  // A shared recipe can change while the light still matches its old application.
  // Rename-only changes preserve selection; built-ins use gamut-converted points.
  if (catalogue) {
    const recipe = catalogue.find(item => item.id === preset?.id);
    if (!recipe || recipe.mode !== preset?.mode ||
      (!recipe.builtin && !sameXyPoints(recipe.colors_xy, preset?.colors_xy))) return undefined;
  }
  return gradientActive && attrs?.color_mode !== "color_temp" && attrs?.gradient_mode === preset?.mode &&
    sameXyPoints(attrs?.gradient_colors_xy, preset?.colors_xy) ? preset : undefined;
}
export const PRESET_PREFIX = "hue_gradient_controller/presets/";
export function subscribePresets(hass, callback) {
  const connection = hass.connection;
  let users = connections.get(connection);
  if (!users) { users = new Map(); connections.set(connection, users); }
  const user = hass.user?.id ?? "";
  let client = users.get(user);
  if (!client) {
    client = { listeners:new Set(), disposed:false };
    users.set(user, client);
    const emit = value => {
      if (client.disposed) return;
      client.value = value;
      for (const listener of client.listeners) listener(value);
    };
    Promise.resolve().then(() => connection.subscribeMessage(emit, {type:PRESET_PREFIX+"subscribe"}))
      .then(unsubscribe => { if (client.disposed) unsubscribe(); else client.unsubscribe=unsubscribe; })
      .catch(error => emit({available:false,presets:[],favorites:[],error:error.message||"Preset library unavailable"}));
  }
  client.listeners.add(callback);
  if (client.value) callback(client.value);
  return () => {
    client.listeners.delete(callback);
    if (client.listeners.size) return;
    client.disposed = true; client.unsubscribe?.(); users.delete(user);
  };
}
export function orderedPresets(presets = [], favorites = []) {
  const stars = new Set(favorites);
  return [...presets.filter(preset => stars.has(preset.id)), ...presets.filter(preset => !stars.has(preset.id))];
}
export function presetReason(preset, caps) {
  if (!caps.gradient) return "Gradient control unavailable";
  if (preset.preview_rgb.length > caps.capacity) return `Needs ${preset.preview_rgb.length} colors; this light supports ${caps.capacity}`;
  if (!caps.modes.includes(preset.mode)) return "Mode unsupported by this light";
  return "";
}
