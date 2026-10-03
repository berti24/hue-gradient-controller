import { mkdir,readFile,readdir,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

await mkdir(".cache",{recursive:true});
const uv=process.env.UV_BIN||"uv";
const result=spawnSync(uv,["pip","install","--target",".cache/ha-frontend","home-assistant-frontend==20260624.5"],{stdio:"inherit"});
if(result.status!==0)throw Error("Renderer fixtures need uv on PATH (or UV_BIN set to its path)");
const hashes={
  "3.4.1":"b96ef3c279a574c1cbd66b23c7efd6bfb0c4817bf094c1c37f4426e403080cfb",
  "2.3.4":"206627083ce0cb1c70d7c9f7a389edd9bb2ae5c2485d4956d5c5475ef44407e2",
};
for(const [version,hash] of Object.entries(hashes)){
  const response=await fetch(`https://raw.githubusercontent.com/Clooos/Bubble-Card/v${version}/dist/bubble-card.js`);
  if(!response.ok)throw Error(`Bubble fixture download failed: ${response.status}`);
  const data=Buffer.from(await response.arrayBuffer());
  if(createHash("sha256").update(data).digest("hex")!==hash)throw Error(`Bubble ${version} fixture checksum changed`);
  await writeFile(`.cache/bubble-card-${version}.js`,data);
}
const base=".cache/ha-frontend/hass_frontend/frontend_latest/";
const runtime=await readFile(`${base}app.a64e86fd521cf0e2.js`,"utf8");
if(!runtime.includes("o(2255);"))throw Error("HA test bootstrap changed");
await writeFile(`${base}hgc-test-runtime.js`,runtime.replace("o(2255);","window.__hgcHaRequire=o;"));
const map={};
for(const file of (await readdir(base)).filter((f)=>/^\d+\..*\.js$/.test(f))){
  const source=await readFile(base+file,"utf8");
  if(!source.includes("__webpack_modules__"))continue;
  for(const m of source.matchAll(/(?:[{},])(\d+)\([^)]*\)\{/g))map[m[1]]=Number(file.split(".")[0]);
}
await writeFile(".cache/ha-module-map.json",JSON.stringify(map));
console.log("Published HA/Bubble compatibility fixtures prepared (cache only)");
