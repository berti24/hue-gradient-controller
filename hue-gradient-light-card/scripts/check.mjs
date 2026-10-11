import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for(const dir of ["src","scripts","tests"]){
  for(const file of await readdir(dir,{recursive:true})){
    if(!/\.(js|mjs)$/.test(file))continue;
    const result=spawnSync(process.execPath,["--check",`${dir}/${file}`],{stdio:"inherit"});
    if(result.status)process.exit(result.status);
  }
}
