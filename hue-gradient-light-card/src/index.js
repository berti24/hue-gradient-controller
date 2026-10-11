import "./config-editor.js";
import "./gradient-editor.js";
import "./light-card.js";

window.customCards ??= [];
for (const [type,name,description] of [
  ["hue-gradient-light-card","Hue Gradient Light","Native Tile or Bubble light controls with a compact gradient popup"],
  ["hue-gradient-editor","Hue Gradient Editor","Ordered color and white-tone gradient palette; embeddable in Bubble popups"],
]) {
  if (!window.customCards.some((card)=>card.type===type)) window.customCards.push({type,name,description,preview:true});
}
