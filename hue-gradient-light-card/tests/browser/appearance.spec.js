import { test, expect } from "@playwright/test";

for (const viewport of [{width:1200,height:900},{width:390,height:844}]) {
  test(`four Pixelated colors survive native updates and mode switches at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
    await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.fixtureReady);
    await page.evaluate(()=>{
      for(const card of [tile,bubble])card.setConfig({...card._config,show_color_count:true,show_mode:true});
      const state=hass.states["light.strip"];
      updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,
        gradient_mode:"random_pixelated",brightness:78,
        gradient_colors_xy:[[.191,.676],[.221,.167],[.363,.158],[.541,.389]],
        gradient_colors_rgb:[[60,255,72],[138,135,255],[240,64,255],[255,162,76]],
        xy_color:[.1909,.6831],rgb_color:[59,255,67],hs_color:[122.449,76.863]}}}});
    });
    // Replay a derived display-color event while native XY and palette stay fixed.
    await page.evaluate(()=>{
      const state=hass.states["light.strip"];
      updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,
        rgb_color:[60,255,68],hs_color:[122.46,76.47]}}}});
    });
    for(const card of [page.locator("#cards hue-gradient-light-card").first(),page.locator("#cards hue-gradient-light-card").last()]){
      await expect(card.locator("ha-tile-info,.bubble-state")).toContainText("4 colors");
      await expect(card.locator("ha-tile-info,.bubble-state")).toContainText("Pixelated");
      expect(await card.evaluate(el=>el._card.style.getPropertyValue("--hgc-card-fill"))).toContain("240,64,255");
    }
    for(const editor of [page.locator("#editors hue-gradient-editor").first(),page.locator("#editors hue-gradient-editor").last()]){
      await expect(editor.locator(".point")).toHaveCount(4);
    }
    await page.locator("#cards hue-gradient-light-card").first().getByRole("button",{name:/Living room strip On/}).click();
    const popup=page.locator("dialog hue-gradient-editor");
    await expect(popup.locator(".point")).toHaveCount(4);
    await expect(popup.getByRole("combobox",{name:"Gradient mode"})).toContainText("Pixelated");
    await popup.getByRole("button",{name:"View Whites palette"}).click();
    await expect(popup.locator(".point")).toHaveCount(4);
    // Genuine whole-light XY changes must still display one color.
    await page.evaluate(()=>{
      const state=hass.states["light.strip"];
      updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,
        xy_color:[.3,.3],rgb_color:[255,255,255],hs_color:[0,0]}}}});
    });
    await expect(popup.locator(".point")).toHaveCount(1);
    // A mode-only gradient update reactivates the same four retained stops.
    await page.evaluate(()=>{
      const state=hass.states["light.strip"];
      updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,gradient_mode:"segmented_palette"}}}});
    });
    await expect(popup.locator(".point")).toHaveCount(4);
    await expect(popup.getByRole("combobox",{name:"Gradient mode"})).toContainText("Segments");
    for(const card of [page.locator("#cards hue-gradient-light-card").first(),page.locator("#cards hue-gradient-light-card").last()]){
      await expect(card.locator("ha-tile-info,.bubble-state")).toContainText("4 colors");
      await expect(card.locator("ha-tile-info,.bubble-state")).toContainText("Segments");
    }
    expect(await page.evaluate(()=>calls)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
