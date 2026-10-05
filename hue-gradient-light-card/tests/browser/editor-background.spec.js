import {test,expect} from "@playwright/test";

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
  await expect(form.locator("p.primary").filter({hasText:/^Card background$/})).toBeVisible();
  const toggle=form.getByRole("switch").last();
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
