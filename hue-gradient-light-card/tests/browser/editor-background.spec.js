import {test,expect} from "@playwright/test";

for(const width of [1200,402])test(`popup uses HA dialog surfaces and blur independently of dashboard transparency at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:874});
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>tile.openPopup());
  const popup=page.locator("dialog hue-gradient-editor section.editor"),dashboard=page.locator("#editors hue-gradient-editor").first().locator("section.editor"),dialog=page.locator("dialog");
  for(const light of [false,true]){
    await page.evaluate(light=>{
      document.body.classList.toggle("light",light);updateHass();
      const style=document.documentElement.style;
      style.setProperty("--ha-card-background","rgba(20, 20, 20, 0.15)");
      style.setProperty("--card-background-color","rgba(20, 20, 20, 0.15)");
      style.setProperty("--ha-dialog-surface-background",light?"rgba(245, 240, 250, 0.9)":"rgba(40, 35, 45, 0.9)");
      style.setProperty("--ha-dialog-surface-backdrop-filter","blur(24px)");
    },light);
    await expect.poll(()=>popup.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(light?"rgba(245, 240, 250, 0.9)":"rgba(40, 35, 45, 0.9)");
    expect(await dashboard.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(20, 20, 20, 0.15)");
    expect(await dialog.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe("blur(24px)");
  }
  await page.evaluate(()=>{
    document.documentElement.style.setProperty("--ha-bottom-sheet-surface-background","rgb(60, 50, 70)");
    document.documentElement.style.setProperty("--ha-bottom-sheet-surface-backdrop-filter","blur(32px)");
  });
  expect(await popup.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(width<768?"rgb(60, 50, 70)":"rgba(245, 240, 250, 0.9)");
  expect(await dialog.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe(width<768?"blur(32px)":"blur(24px)");
  await page.evaluate(()=>tile.style.setProperty("--hgc-popup-surface","rgb(70, 60, 80)"));
  expect(await popup.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgb(70, 60, 80)");
  await page.locator("dialog hue-gradient-editor summary").click();
  expect(await page.locator("dialog hue-gradient-editor details[open]").evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgb(70, 60, 80)");
  await page.evaluate(()=>{
    tile.style.removeProperty("--hgc-popup-surface");
    for(const key of ["--ha-dialog-surface-background","--ha-bottom-sheet-surface-background","--ha-dialog-surface-backdrop-filter","--ha-bottom-sheet-surface-backdrop-filter"])
      document.documentElement.style.removeProperty(key);
  });
  // With no popup-specific theme, use HA's solid surface, never a transparent card.
  const solidSurface=await page.evaluate(()=>{
    const probe=document.createElement("div");probe.style.background="var(--ha-color-surface-default)";
    document.body.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;
  });
  expect(await popup.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(solidSurface);
  expect(await dialog.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe("none");
  expect(await page.evaluate(()=>calls)).toEqual([]);
});

for(const width of [1200,390])test(`editor background can be toggled independently of embedding at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>{
    colors.setConfig({entity:"light.strip",embedded:true});
    window.editorConfig=makeCard("hue-gradient-editor-config-editor",{entity:"light.strip",embedded:true},"config");
    editorConfig.addEventListener("config-changed",e=>{window.savedEditor=e.detail.config;colors.setConfig(e.detail.config);});
  });
  const editor=page.locator("#editors hue-gradient-editor").first(),section=editor.locator("section.editor");
  const form=page.locator("#config hue-gradient-editor-config-editor");
  await form.getByRole("heading",{name:"Content",exact:true}).click();
  await expect(form.locator("p.primary").filter({hasText:/^Card background$/})).toBeVisible();
  const toggle=form.locator('ha-selector-boolean').filter({has:page.locator('p.primary').filter({hasText:/^Card background$/})}).getByRole("switch");
  await expect(toggle).not.toBeChecked();
  expect(await section.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await toggle.focus();await toggle.press("Space");
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(()=>savedEditor.card_background)).toBe(true);
  for(const light of [false,true]){
    await page.evaluate(light=>{document.body.classList.toggle("light",light);updateHass();},light);
    await expect.poll(()=>section.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    const style=await section.evaluate(el=>{const s=getComputedStyle(el);return {border:parseFloat(s.borderWidth),padding:parseFloat(s.padding),radius:parseFloat(s.borderRadius)};});
    expect(style.border).toBeGreaterThan(0);expect(style.padding).toBeGreaterThan(0);expect(style.radius).toBeGreaterThan(0);
    await expect(editor.locator("header h2")).toHaveText("Living room strip");
    await expect(editor.locator(".handle")).toHaveCount(0);
    const wheel=await editor.locator(".wheel").boundingBox(),bounds=await section.boundingBox();
    expect(wheel.x).toBeGreaterThanOrEqual(bounds.x);expect(wheel.x+wheel.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  }
  await toggle.focus();await toggle.press("Space");
  await expect(toggle).not.toBeChecked();
  expect(await section.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(()=>colors.setConfig({entity:"light.strip"}));
  await expect.poll(()=>section.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(()=>colors.setConfig({entity:"light.strip",card_background:false}));
  await expect(section).toHaveClass(/no-card-background/);
  expect(await section.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await page.evaluate(()=>calls)).toEqual([]);expect(errors).toEqual([]);
});
