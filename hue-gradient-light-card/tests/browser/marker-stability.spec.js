import {test,expect} from "@playwright/test";

async function ready(page) {
  await page.goto("/");await page.waitForFunction(()=>window.fixtureReady);
  return page.locator("#editors hue-gradient-editor").first();
}
const positions=editor=>editor.locator(".point").evaluateAll(points=>points.map(point=>[point.style.left,point.style.top]));
for(const whites of [false,true])test(`released markers stay put through rounded display echoes in ${whites?"Whites":"Colors"}`,async({page})=>{
  const editor=await ready(page);
  if(whites)await editor.getByRole("button",{name:"View Whites palette"}).click();
  const marker=await editor.locator(".point").first().boundingBox(),wheel=await editor.locator(".wheel").boundingBox();
  await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();
  await page.mouse.move(wheel.x+wheel.width*.32,wheel.y+wheel.height*.58,{steps:8});await page.mouse.up();
  const released=await positions(editor);
  await page.evaluate(()=>{
    const state=hass.states["light.strip"],attrs=state.attributes;
    const rgb=attrs.gradient_colors_rgb.map((color,index)=>index?color:color.map(value=>Math.max(0,value-1)));
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...attrs,gradient_colors_rgb:rgb}}}});
  });
  await page.waitForTimeout(2100);
  for(const delta of [1,2]) {
    await page.evaluate(delta=>{
      const state=hass.states["light.strip"],attrs=state.attributes;
      const rgb=attrs.gradient_colors_rgb.map((color,index)=>index?color:color.map((value,channel)=>Math.max(0,Math.min(255,value+(channel===0?-delta:delta)))));
      updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...attrs,gradient_colors_rgb:rgb}}}});
    },delta);
    await expect.poll(()=>positions(editor)).toEqual(released);
  }
});
test("preset marker placement survives bridge RGB conversion feedback",async({page})=>{
  const editor=await ready(page),browser=editor.locator("hgc-preset-browser");
  await browser.getByRole("button",{name:"See all"}).click();
  await browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true}).click();
  const preview=await positions(editor);
  await page.evaluate(()=>{
    const state=hass.states["light.strip"],attrs=state.attributes;
    const rgb=attrs.gradient_colors_rgb.map(color=>color.map((value,index)=>Math.max(0,Math.min(255,value+(index===0?-2:2)))));
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...attrs,gradient_colors_rgb:rgb}}}});
  });
  await page.waitForTimeout(2100);
  expect(await positions(editor)).toEqual(preview);
  // A different live palette must still replace the local placement and colors.
  await page.evaluate(()=>{
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,
      gradient_colors_xy:[[.2,.2],[.3,.3]],gradient_colors_rgb:[[0,255,0],[0,0,255]]}}}});
  });
  await expect(editor.locator(".point")).toHaveCount(2);
  expect(await positions(editor)).not.toEqual(preview);
});
test("favorite glyph is centered inside its badge",async({page})=>{
  const editor=await ready(page);await editor.locator("hgc-preset-browser").getByRole("button",{name:"Presets",exact:true}).click();
  const icon=editor.locator("hgc-preset-browser .star").first().locator("svg");
  await expect(icon).toBeVisible();
  const badge=await editor.locator("hgc-preset-browser .star-visual").first().boundingBox(),glyph=await icon.boundingBox();
  expect(Math.abs(glyph.x+glyph.width/2-badge.x-badge.width/2)).toBeLessThan(.5);
  expect(Math.abs(glyph.y+glyph.height/2-badge.y-badge.height/2)).toBeLessThan(.5);
});
test("a second editor adopts a preset when its confirmation arrives before the state echo",async({page})=>{
  await page.goto("/?noEcho=1");await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>{
    window.otherPresetEditor=document.createElement("hue-gradient-editor");
    otherPresetEditor.setConfig({entity:"light.strip"});otherPresetEditor.hass=hass;
    document.querySelector("#editors").append(otherPresetEditor);
  });
  const browser=page.locator("#editors hue-gradient-editor").first().locator("hgc-preset-browser");
  await browser.getByRole("button",{name:"See all"}).click();
  await browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>colors._presetApplied?.id)).toBe("builtin:prism");
  await page.evaluate(()=>{
    const preset=presetStore.presets.find(p=>p.id==="builtin:prism"),state=hass.states["light.strip"];
    const xy=preset.preview_rgb.map(rgb=>[.1+.4*rgb[0]/255,.1+.4*rgb[1]/255]);
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,
      gradient_colors_xy:xy,gradient_colors_rgb:preset.preview_rgb,gradient_mode:preset.mode,xy_color:xy[0]}}}});
    window.freshPresetEditor=document.createElement("hue-gradient-editor");
    freshPresetEditor.setConfig({entity:"light.strip"});freshPresetEditor.hass=hass;
    document.querySelector("#editors").append(freshPresetEditor);
  });
  await expect.poll(()=>page.evaluate(()=>[otherPresetEditor,freshPresetEditor].map(editor=>
    [...editor.renderRoot.querySelectorAll(".point")].map(point=>[point.style.left,point.style.top])))).toMatchObject([expect.any(Array),expect.any(Array)]);
  const layouts=await page.evaluate(()=>[otherPresetEditor,freshPresetEditor].map(editor=>
    [...editor.renderRoot.querySelectorAll(".point")].map(point=>[point.style.left,point.style.top])));
  expect(layouts[0]).toEqual(layouts[1]);
});
