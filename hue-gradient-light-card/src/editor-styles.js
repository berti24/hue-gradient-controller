import { css } from "lit";

export const editorStyles = css`
  :host {
    display:block;
    min-width:0;
    color:var(--hgc-text-color,var(--primary-text-color));
    --_surface:var(--hgc-surface,var(--ha-card-background,var(--card-background-color)));
    --_control:var(--hgc-control-surface,var(--secondary-background-color));
    --_muted:var(--hgc-secondary-text-color,var(--secondary-text-color));
    --_border:var(--hgc-border-color,var(--divider-color));
    --_gap:var(--hgc-spacing,16px);
    --_radius:var(--hgc-control-radius,var(--bubble-button-border-radius,var(--bubble-border-radius,var(--ha-border-radius-lg,24px))));
    --_point-size:var(--hgc-point-size,32px);
    --_focus:var(--hgc-focus-color,var(--primary-color));
    font-family:var(--hgc-font-family,var(--ha-font-family,inherit));
    font-size:var(--hgc-font-size,var(--ha-font-size-m,14px));
    line-height:var(--hgc-line-height,1.4);
  }
  * { box-sizing:border-box; }
  [hidden] { display:none !important; }
  .editor {
    position:relative; isolation:isolate;
    background:var(--_surface);
    border:var(--hgc-border-width,1px) solid var(--_border);
    border-radius:var(--hgc-popup-radius,var(--bubble-pop-up-border-radius,var(--ha-card-border-radius,28px)));
    padding:var(--hgc-padding,16px);
    box-shadow:var(--hgc-shadow,var(--ha-card-box-shadow,none));
  }
  .editor.no-card-background { border:0; background:transparent; box-shadow:none; }
  .editor.embedded.no-card-background { padding:var(--hgc-embedded-padding,0px); }
  header { display:flex; align-items:center; gap:var(--_gap); margin-bottom:var(--_gap); }
  h2 { font-size:var(--hgc-title-size,var(--ha-font-size-l,16px)); font-weight:var(--hgc-title-weight,500); margin:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .header-icon { display:grid; place-items:center; width:var(--hgc-header-icon-size,40px); height:var(--hgc-header-icon-size,40px); border-radius:50%; background:var(--hgc-icon-surface,var(--_control)); }
  .header-icon.on { color:var(--hgc-power-color,var(--state-light-active-color,var(--amber-color))); }
  .menu-backdrop { position:absolute; inset:0; z-index:5; border-radius:inherit; backdrop-filter:blur(var(--hgc-menu-blur,2px)); cursor:default; }
  details[open] { z-index:6; }
  button, select, input { font:inherit; color:inherit; }
  button, select, .slider-row { border:var(--hgc-control-border-width,1px) solid var(--_border); background:var(--_control); border-radius:var(--_radius); }
  button { cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:var(--hgc-button-gap,8px); min-height:var(--hgc-control-height,44px); padding:var(--hgc-button-padding,8px 14px); }
  button.icon { border:0; background:transparent; padding:var(--hgc-icon-padding,6px); min-width:var(--hgc-touch-target,44px); }
  button.header-icon { flex-shrink:0; border-radius:50%; background:var(--hgc-icon-gradient,none), linear-gradient(var(--hgc-icon-surface,var(--_control)),var(--hgc-icon-surface,var(--_control))); }
  button:disabled, input:disabled, select:disabled { opacity:var(--hgc-disabled-opacity,.45); cursor:default; }
  :focus-visible { outline:var(--hgc-focus-width,3px) solid var(--_focus); outline-offset:var(--hgc-focus-offset,3px); }
  ha-icon { --mdc-icon-size:var(--hgc-icon-size,24px); }
  .wheel { position:relative; width:min(100%,var(--hgc-wheel-size,300px)); aspect-ratio:1; margin:var(--hgc-wheel-margin,8px auto 20px); touch-action:auto; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
  .wheel.off { opacity:var(--hgc-disabled-opacity,.45); }
  .wheel.off .point:disabled { opacity:1; }
  .wheel.touch-ready { outline:2px solid var(--_focus); outline-offset:4px; border-radius:50%; }
  .touch-hint { display:none; color:var(--_muted); text-align:center; margin:0 0 var(--_gap); }
  .off-status { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:var(--_gap); color:var(--_muted); }
  .off-status button { flex-shrink:0; }
  @media (any-pointer:coarse) { .touch-hint { display:block; } }
  canvas { display:block; width:100%; height:100%; border-radius:50%; }
  svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
  .connector-shadow { stroke:var(--hgc-connector-shadow,rgba(0,0,0,.42)); stroke-width:var(--hgc-connector-shadow-width,1.2px); stroke-linecap:round; stroke-linejoin:round; fill:none; }
  .connector { stroke:var(--hgc-connector-color,rgba(255,255,255,.95)); stroke-width:var(--hgc-connector-width,.5px); stroke-linecap:round; stroke-linejoin:round; fill:none; }
  .point { position:absolute; width:var(--_point-size); height:var(--_point-size); min-height:var(--_point-size); transform:translate(-50%,-50%); border:var(--hgc-point-border-width,2px) solid var(--hgc-point-border-color,white); border-radius:50%; padding:0; background:var(--point-color); color:var(--point-text); box-shadow:var(--hgc-point-shadow,0 1px 5px rgba(0,0,0,.4)); font-size:var(--hgc-point-font-size,14px); }
  .point.selected { outline:var(--hgc-selected-width,2px) solid var(--hgc-selected-color,var(--primary-color)); outline-offset:var(--hgc-selected-offset,2px); }
  .point.outside { border-style:dashed; }
  .actual-color { position:absolute; inset-inline-end:var(--hgc-point-swatch-offset,-3px); bottom:var(--hgc-point-swatch-offset,-3px); width:var(--hgc-point-swatch-size,11px); height:var(--hgc-point-swatch-size,11px); background:var(--point-actual-color); border:var(--hgc-point-swatch-border-width,1px) solid var(--hgc-point-border-color,white); border-radius:50%; pointer-events:none; }
  .point ha-icon { --mdc-icon-size:var(--hgc-point-icon-size,19px); pointer-events:none; }
  .row { display:flex; align-items:center; gap:var(--hgc-row-gap,8px); margin-bottom:var(--_gap); }
  .count { color:var(--_muted); white-space:nowrap; font-size:var(--hgc-count-font-size,13px); }
  .switch { margin-inline-start:auto; }
  .slider-row { padding:var(--hgc-slider-padding,8px 12px); }
  input[type=range] { min-width:0; width:100%; accent-color:var(--hgc-slider-accent,var(--primary-color)); cursor:pointer; }
  input.brightness { appearance:none; height:var(--hgc-slider-track-height,8px); border-radius:var(--_radius); background:linear-gradient(to right,var(--hgc-slider-fill,var(--primary-text-color)) var(--hgc-slider-level),var(--hgc-slider-track,var(--divider-color)) var(--hgc-slider-level)); }
  input.brightness::-webkit-slider-thumb { appearance:none; width:var(--hgc-slider-thumb-size,20px); height:var(--hgc-slider-thumb-size,20px); border:0; border-radius:50%; background:var(--hgc-slider-thumb,var(--primary-text-color)); box-shadow:var(--hgc-slider-thumb-shadow,0 1px 3px rgba(0,0,0,.2)); }
  input.brightness::-moz-range-thumb { width:var(--hgc-slider-thumb-size,20px); height:var(--hgc-slider-thumb-size,20px); border:0; border-radius:50%; background:var(--hgc-slider-thumb,var(--primary-text-color)); box-shadow:var(--hgc-slider-thumb-shadow,0 1px 3px rgba(0,0,0,.2)); }
  output { min-width:var(--hgc-output-width,42px); text-align:end; font-variant-numeric:tabular-nums; }
  select { width:100%; min-height:var(--hgc-control-height,44px); padding:var(--hgc-select-padding,8px 16px); }
  .status { color:var(--_muted); margin:var(--hgc-status-margin,8px 0); }
  [role=alert] { color:var(--hgc-error-color,var(--error-color)); }
  details { position:relative; margin-bottom:var(--_gap); }
  summary { cursor:pointer; color:var(--_muted); padding:var(--hgc-menu-summary-padding,4px); list-style:none; }
  summary::-webkit-details-marker { display:none; }
  header details { margin:0; }
  header details[open], .embedded-tools details[open] { position:absolute; z-index:6; inset-inline:var(--hgc-padding,16px); top:var(--hgc-menu-top,70px); background:var(--_surface); border:1px solid var(--_border); padding:var(--hgc-padding,16px); border-radius:var(--_radius); }
  header { position:relative; }
  .menu { display:flex; flex-direction:column; align-items:stretch; gap:var(--hgc-menu-gap,8px); padding-top:var(--hgc-menu-padding,8px); }
  .menu label { display:flex; align-items:center; justify-content:space-between; gap:var(--hgc-menu-gap,8px); }
  .menu input { width:var(--hgc-transition-width,80px); border:1px solid var(--_border); border-radius:var(--hgc-input-radius,8px); padding:var(--hgc-input-padding,6px); background:var(--_control); }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .embedded-tools { display:flex; justify-content:flex-end; margin-bottom:var(--hgc-embedded-tools-margin,4px); }
  .temperature { margin-bottom:var(--_gap); }
  @media (max-width:360px) { .row { flex-wrap:wrap; } }
`;
