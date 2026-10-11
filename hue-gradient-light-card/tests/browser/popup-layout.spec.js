import {test,expect} from "@playwright/test";

test.describe("mobile popup",()=>{
  test.use({isMobile:true,hasTouch:true});
  test("expanded controls fit a phone's safe area and shorter screens remain scrollable",async({page})=>{
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.fixtureReady);
    await page.evaluate(()=>{
      document.documentElement.style.setProperty("--safe-area-inset-top","62px");
      document.documentElement.style.setProperty("--safe-area-inset-bottom","34px");
      tile.setConfig({entity:"light.strip",design:"tile",presets_expansion:"expanded"});tile.openPopup();
    });
    const dialog=page.locator("dialog"),editor=dialog.locator("hue-gradient-editor");
    await expect(editor.locator("hgc-preset-browser .carousel")).toBeVisible();
    for(const viewport of [{width:402,height:874},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      const box=await dialog.boundingBox();
      expect(box.height).toBeLessThan(viewport.height-144);
      expect(await dialog.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
      const wheel=await editor.locator(".wheel").boundingBox();
      expect(wheel.width).toBeGreaterThanOrEqual(200);expect(wheel.width).toBeLessThanOrEqual(260);
      const mode=editor.getByRole("combobox",{name:"Gradient mode"});
      const modeBox=await mode.boundingBox();
      expect(modeBox.y+modeBox.height).toBeLessThanOrEqual(box.y+box.height);
      for(const name of ["Add color","View Whites palette","Close gradient editor"]){
        expect((await editor.getByRole("button",{name,exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await editor.getByRole("button",{name:"View Whites palette"}).tap();
    await expect(editor.getByRole("group",{name:"White-tone color palette"})).toBeVisible();
    await editor.getByRole("combobox",{name:"Gradient mode"}).tap();
    await expect(editor.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.setViewportSize({width:320,height:568});
    expect(await dialog.evaluate(el=>el.scrollHeight)).toBeGreaterThan(await dialog.evaluate(el=>el.clientHeight));
    await editor.getByRole("combobox",{name:"Gradient mode"}).scrollIntoViewIfNeeded();
    await expect(editor.getByRole("combobox",{name:"Gradient mode"})).toBeInViewport();
    await editor.getByRole("button",{name:"Close gradient editor"}).tap();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(()=>calls)).toEqual([]);expect(errors).toEqual([]);
  });
});

test("popup widens only on desktop and keeps mobile sizing, controls and dismissal",async({page})=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>tile.openPopup());
  const dialog=page.locator("dialog"),editor=dialog.locator("hue-gradient-editor");
  for(const width of [1200,768,767,390,320]){
    await page.setViewportSize({width,height:900});
    await expect(dialog).toBeVisible();
    await expect(editor.locator(".handle")).toHaveCount(0);
    await expect(editor.locator("header h2")).toHaveText("Living room strip");
    const bounds=await dialog.boundingBox();
    if(width>=768)expect(bounds.width).toBe(560);
    else if(width>=376)expect(bounds.width).toBe(352);
    else expect(bounds.width).toBeLessThanOrEqual(width-24);
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(width-12);
    const wheel=await editor.locator(".wheel").boundingBox();
    expect(wheel.x).toBeGreaterThanOrEqual(bounds.x);
    expect(wheel.x+wheel.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  }
  await editor.getByRole("button",{name:"View Whites palette"}).click();
  await expect(editor.getByRole("group",{name:"White-tone color palette"})).toBeVisible();
  await editor.getByRole("button",{name:"Close gradient editor"}).click();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(()=>tile.openPopup());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("dashboard editor follows section columns independently of popup width",async({page})=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>{
    const section=document.createElement("div");section.id="dashboard-section";
    section.style.cssText="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));width:700px;max-width:100%;--hgc-popup-width:900px";
    document.body.prepend(section);section.append(colors);
    colors.style.width="auto";
  });
  const section=page.locator("#dashboard-section"),editor=section.locator("hue-gradient-editor");
  for(const width of [1200,390]){
    await page.setViewportSize({width,height:900});
    for(const embedded of [false,true])for(const columns of [6,12]){
      await page.evaluate(({embedded,columns})=>{
        colors.setConfig({entity:"light.strip",embedded,grid_options:{columns,rows:"auto"}});
        colors.style.gridColumn=`span ${columns}`;
      },{embedded,columns});
      await expect(editor.locator(".handle")).toHaveCount(0);
      await expect(editor.locator("header h2")).toHaveText("Living room strip");
      const host=await section.boundingBox(),card=await editor.boundingBox();
      expect(card.width).toBeCloseTo(host.width*columns/12,1);
      const surface=await editor.locator("section.editor").boundingBox();
      expect(surface.width).toBeCloseTo(card.width,1);
      expect(surface.x+surface.width).toBeLessThanOrEqual(host.x+host.width);
    }
  }
  expect(await page.evaluate(()=>calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("popup theme width override stays bounded and does not size the dashboard card",async({page})=>{
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  const card=page.locator("hue-gradient-light-card").first(),before=await card.boundingBox();
  await page.evaluate(()=>{tile.style.setProperty("--hgc-popup-width","640px");tile.openPopup();});
  const dialog=page.locator("dialog");
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox()).width).toBe(640);
  expect((await card.boundingBox()).width).toBe(before.width);
  await page.evaluate(()=>tile.style.setProperty("--hgc-popup-width","2000px"));
  const bounds=await dialog.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(1176);
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(1188);
  await page.evaluate(()=>tile.closePopup());
});
