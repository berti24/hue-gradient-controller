import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
const root=resolve("..");
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname.startsWith("/local/bubble/")){res.setHeader("Content-Type","text/yaml");res.end("{}");return;}
  const route=url.pathname.startsWith("/frontend_latest/")||url.pathname.startsWith("/static/")
    ?`/.cache/ha-frontend/hass_frontend${url.pathname}`:url.pathname;
  const fileRoute=route.startsWith("/.cache/")?`/hue-gradient-light-card${route}`:route;
  const path=resolve(root,`.${decodeURIComponent(fileRoute==="/"?"/hue-gradient-light-card/tests/fixture.html":fileRoute)}`);
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    const data=await readFile(path);res.setHeader("Content-Type",path.endsWith(".html")?"text/html":path.endsWith(".js")?"text/javascript":"application/octet-stream");
    res.end(data);
  }catch{res.writeHead(404).end();}
}).listen(port,"127.0.0.1",()=>console.log(`Frontend test fixture: http://127.0.0.1:${port}`));
