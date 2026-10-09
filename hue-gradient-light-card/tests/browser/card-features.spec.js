import {test,expect} from "@playwright/test";

for(const width of [1200,390])test(`card appearance settings and editor headers at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await expect(page).toHaveTitle("Hue Gradient Card compatibility fixture");
  await expect(page.locator("#config .version")).toHaveText("Hue Gradient Card 0.7.2");
  const first="rgb(255, 130, 10)";
  const nativeIcon=page.locator("#cards hue-gradient-light-card").first().locator("ha-state-icon");
  const bubbleIcon=page.locator("#cards hue-gradient-light-card").last().locator(".bubble-icon");
  for(const icon of [nativeIcon,bubbleIcon])await expect.poll(()=>icon.evaluate(el=>getComputedStyle(el).color)).toBe(first);
  await page.evaluate(()=>{
    document.documentElement.style.setProperty("--ha-card-border-width","2px");
    document.documentElement.style.setProperty("--ha-card-box-shadow","0 0 2px red");
    for(const card of [tile,bubble])card.setConfig({...card._config,color_background:false,icon_gradient_background:true});
    colors.setConfig({...colors._config,embedded:true,icon_gradient_background:true});
  });
  for(const card of [page.locator("#cards hue-gradient-light-card").first(),page.locator("#cards hue-gradient-light-card").last()]){
    await expect.poll(()=>card.locator("ha-card,.bubble-button-card-container").last().evaluate(el=>getComputedStyle(el).backgroundImage.includes("255, 130, 10"))).toBe(false);
  }
  const tileBackground=page.locator("#cards hue-gradient-light-card").first().locator("ha-tile-icon .container");
  await expect.poll(()=>tileBackground.evaluate(el=>getComputedStyle(el,"::before").backgroundImage)).toContain("0, 74, 255");
  await expect.poll(()=>page.locator("#cards hue-gradient-light-card").last().locator(".bubble-icon-container").evaluate(el=>getComputedStyle(el).backgroundImage)).toContain("0, 74, 255");
  expect(await page.locator("#cards hue-gradient-light-card").last().locator("ha-card").evaluate(el=>({border:getComputedStyle(el).borderWidth,shadow:getComputedStyle(el).boxShadow}))).toEqual({border:"0px",shadow:"none"});
  const embedded=page.locator("#editors hue-gradient-editor").first();
  await expect(embedded.locator("header h2")).toHaveText("Living room strip");
  await expect(embedded.locator(".handle")).toHaveCount(0);
  await expect.poll(()=>embedded.locator(".header-icon").evaluate(el=>getComputedStyle(el).backgroundImage)).toContain("0, 74, 255");
  await page.evaluate(()=>tile.openPopup());
  const popup=page.locator("dialog hue-gradient-editor");
  await expect(popup.locator(".header-icon")).toBeVisible();
  expect(await popup.locator(".header-icon").evaluate(el=>getComputedStyle(el).color)).toBe(first);
  expect(await popup.locator(".header-icon").evaluate(el=>getComputedStyle(el).backgroundImage)).toContain("0, 74, 255");
  await page.keyboard.press("Escape");
  await page.evaluate(()=>{
    for(const card of [tile,bubble])card.setConfig({...card._config,icon_gradient_background:false});
    colors.setConfig({...colors._config,icon_gradient_background:false});
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,state:"off"}}});
  });
  await expect(embedded.getByRole("button",{name:"Turn on",exact:true})).toBeVisible();
  expect(await embedded.locator(".header-icon").evaluate(el=>getComputedStyle(el).backgroundImage)).not.toContain("0, 74, 255");
  expect(await embedded.locator(".header-icon").evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe("none");
  expect(await page.evaluate(()=>calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("Add color uses the last point, avoids existing colors, and sends the displayed palette",async({page})=>{
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>{
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,gradient_colors_xy:[[.6,.3],[.2,.3]],gradient_colors_rgb:[[255,0,0],[0,255,255]]}}}});
    colors._selected=0;
  });
  const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.colors?.length)).toBe(3);
  const palette=await page.evaluate(()=>colors.points);
  expect(palette[2][0]).toBe(255);expect(Math.max(palette[2][1],palette[2][2])).toBeLessThan(6);
  expect(new Set(palette.map(String)).size).toBe(3);
  expect(await page.evaluate(()=>calls.at(-1).data.colors)).toEqual(palette);
  await editor.getByRole("button",{name:"View Whites palette"}).click();
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  const whites=await page.evaluate(()=>colors.points);
  expect(new Set(whites.map(String)).size).toBe(4);
  expect(whites.slice(0,3)).toEqual(palette);
});
