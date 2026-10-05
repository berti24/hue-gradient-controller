import { build } from "esbuild";
import { readFile,writeFile } from "node:fs/promises";
const manifest=JSON.parse(await readFile("../custom_components/hue_gradient_controller/manifest.json","utf8"));
await build({entryPoints:["src/index.js"],bundle:true,format:"esm",target:"es2022",minify:true,
  // Escape multiline string whitespace so the distributable passes diff checks.
  supported:{"template-literal":false},
  define:{__HGC_VERSION__:JSON.stringify(manifest.version)},
  outfile:"../custom_components/hue_gradient_controller/www/hue-gradient-light-card.js",
  legalComments:"inline",banner:{js:`/* Hue Gradient Controller ${manifest.version} | MIT | source: hue-gradient-light-card/src */`}});
const licenses=await Promise.all(["lit","lit-element","lit-html","@lit/reactive-element"].map(async(name)=>
  `${name}\n${await readFile(`node_modules/${name}/LICENSE`,"utf8")}`));
await writeFile("../custom_components/hue_gradient_controller/www/LICENSES.txt",licenses.join("\n\n"));
