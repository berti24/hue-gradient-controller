import {test,expect} from "@playwright/test";

async function ready(page,query=""){
  await page.goto(`/?${query}`);await page.waitForFunction(()=>window.fixtureReady);
  return page.locator("hue-gradient-editor").first().locator("hgc-preset-browser");
}

test("popup preset confirmation succeeds and refreshes the subtitle after reapplication",async({page})=>{
  await ready(page);
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.evaluate(()=>{
    tile.setConfig({...tile._config,state_content:["hgc_color_count","hgc_gradient_mode"],presets_expansion:"expanded"});
    tile.openPopup();
  });
  const popup=page.locator("dialog hue-gradient-editor"),browser=popup.locator("hgc-preset-browser");
  await browser.getByRole("button",{name:"See all"}).click();
  const prism=browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true});
  await prism.click();
  await expect.poll(()=>page.evaluate(()=>tile._editor._writer.busy)).toBe(false);
  await expect(popup.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(()=>tile._editor._presetOrigin)).toBe("builtin:prism");
  await page.evaluate(()=>{
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,xy_color:[.9,.05],rgb_color:[255,0,0]}}}});
  });
  const card=page.locator("#cards hue-gradient-light-card").first();
  await expect(card.locator("ha-tile-info")).toContainText("1 color");
  await prism.click();
  await expect.poll(()=>page.evaluate(()=>tile._editor._writer.busy)).toBe(false);
  await expect(popup.getByRole("alert")).toHaveCount(0);
  await expect(prism).toHaveAttribute("aria-pressed","true");
  await expect(card.locator("ha-tile-info")).toContainText("5 colors");
  expect(errors).toEqual([]);
});

for(const change of ["colors","mode"])test(`shared preset ${change} updates clear selection while rename-only updates preserve it`,async({page})=>{
  const browser=await ready(page);
  await page.evaluate(()=>{
    const attrs=hass.states["light.strip"].attributes;
    presetStore.presets.push({id:"custom:shared",name:"Shared",builtin:false,creator_id:hass.user.id,revision:1,
      colors_xy:structuredClone(attrs.gradient_colors_xy),preview_rgb:structuredClone(attrs.gradient_colors_rgb),mode:attrs.gradient_mode});
    pushPresets();
  });
  await browser.getByRole("button",{name:"See all"}).click();
  const target=browser.locator('[data-preset-id="custom:shared"] .apply');
  await target.click();await expect(target).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=>{
    const preset=presetStore.presets.find(item=>item.id==="custom:shared");
    preset.name="Renamed";preset.revision++;pushPresets();
  });
  await expect(target).toContainText("Renamed");await expect(target).toHaveAttribute("aria-pressed","true");
  const before=await page.evaluate(()=>({state:structuredClone(hass.states["light.strip"]),calls:calls.length}));
  await page.evaluate(change=>{
    const preset=presetStore.presets.find(item=>item.id==="custom:shared");
    if(change==="colors")Object.assign(preset,{colors_xy:[[.6,.3],[.3,.2]],preview_rgb:[[0,255,0],[255,255,0]]});
    else preset.mode="segmented_palette";
    preset.revision++;pushPresets();
  },change);
  await expect(target).toHaveAttribute("aria-pressed","false");
  expect(await page.evaluate(()=>hass.states["light.strip"])).toEqual(before.state);
  expect(await page.evaluate(()=>calls.length)).toBe(before.calls);
  await target.click();await expect(target).toHaveAttribute("aria-pressed","true");
});

test("preset markers survive a delayed native first-color echo",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"Presets",exact:true}).click();
  await browser.getByRole("button",{name:"Apply Ocean, 2 colors",exact:true}).click();
  const editor=page.locator("#editors hue-gradient-editor").first();
  await expect(editor.locator(".point")).toHaveCount(2);
  await page.evaluate(()=>{
    const state=hass.states["light.strip"],attrs=state.attributes;
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...attrs,
      xy_color:attrs.gradient_colors_xy[0].map(value=>Math.round(value*10000)/10000),
      rgb_color:attrs.gradient_colors_rgb[0]}}}});
  });
  await page.waitForTimeout(2200);
  await expect(editor.locator(".point")).toHaveCount(2);
});

test("mouse dragging scrolls presets without applying or favoriting",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"Presets",exact:true}).click();
  const bounds=await browser.locator(".carousel").boundingBox();
  await page.mouse.move(bounds.x+260,bounds.y+25);await page.mouse.down();
  await page.mouse.move(bounds.x+40,bounds.y+25,{steps:12});await page.mouse.up();
  await expect.poll(()=>browser.locator(".carousel").evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.evaluate(()=>calls.length)).toBe(0);
  expect(await page.evaluate(()=>presetStore.users.test?.favorites??[])).toEqual([]);
});

test("favorite visual remains small within the preview",async({page})=>{
  const browser=await ready(page);await browser.getByRole("button",{name:"Presets",exact:true}).click();
  const sizes=await browser.locator("li").first().evaluate(el=>{
    const star=el.querySelector(".star-visual").getBoundingClientRect(),swatch=el.querySelector(".swatch").getBoundingClientRect();
    const target=el.querySelector(".star").getBoundingClientRect();
    return {star:star.width*star.height,swatch:swatch.width*swatch.height,targetWidth:target.width,targetHeight:target.height};
  });
  expect(sizes.star/sizes.swatch).toBeLessThan(.2);
  expect(sizes.targetWidth).toBeGreaterThanOrEqual(44);expect(sizes.targetHeight).toBeGreaterThanOrEqual(44);
});

test("reopening remembers active selection without moving presets",async({page})=>{
  await ready(page);await page.evaluate(()=>{tile.setConfig({...tile._config,presets_expansion:"expanded"});tile.openPopup();});
  let popup=page.locator("dialog hue-gradient-editor"),browser=popup.locator("hgc-preset-browser");
  await browser.getByRole("button",{name:"See all"}).click();
  await browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true}).click();
  await expect(browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=>{tile.closePopup();tile.openPopup();});
  popup=page.locator("dialog hue-gradient-editor");browser=popup.locator("hgc-preset-browser");
  await expect(browser.locator("li").first()).toHaveAttribute("data-preset-id","builtin:ocean");
  await expect(browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true})).toHaveAttribute("aria-pressed","true");
});
test("applying a visible preset does not reorder or scroll the carousel",async({page})=>{
  const browser=await ready(page);await browser.getByRole("button",{name:"Presets",exact:true}).click();
  const target=browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true});
  await target.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  const before=await browser.locator(".carousel").evaluate(list=>({left:list.scrollLeft,ids:[...list.children].map(tile=>tile.dataset.presetId)}));
  await target.click();await expect(target).toHaveAttribute("aria-pressed","true");
  const after=await browser.locator(".carousel").evaluate(list=>({left:list.scrollLeft,ids:[...list.children].map(tile=>tile.dataset.presetId)}));
  expect(after.ids).toEqual(before.ids);expect(Math.abs(after.left-before.left)).toBeLessThan(1);
});
for(const surface of ["standalone","popup"])test(`external color changes clear active highlight and reapplication recovers in ${surface}`,async({page})=>{
  let browser=await ready(page);
  if(surface==="popup") {
    await page.evaluate(()=>tile.openPopup());
    browser=page.locator("dialog hue-gradient-editor hgc-preset-browser");
  }
  await browser.getByRole("button",{name:"See all"}).click();
  const prism=browser.getByRole("button",{name:"Apply Prism, 5 colors",exact:true});
  await prism.click();await expect(prism).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=>{
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,xy_color:[.9,.05],rgb_color:[255,0,0]}}}});
  });
  await expect(prism).toHaveAttribute("aria-pressed","false");
  await prism.click();await expect(prism).toHaveAttribute("aria-pressed","true");
  await page.evaluate(()=>{
    const state=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...state,attributes:{...state.attributes,gradient_colors_xy:[[.1,.1],[.2,.2]]}}}});
  });
  await expect(prism).toHaveAttribute("aria-pressed","false");
});
test("mouse wheel and dragging from a star browse without changing favorites",async({page})=>{
  const browser=await ready(page);await browser.getByRole("button",{name:"Presets",exact:true}).click();
  const star=await browser.getByRole("button",{name:"Favorite Ember",exact:true}).boundingBox();
  await page.mouse.move(star.x+star.width/2,star.y+star.height/2);await page.mouse.down();
  await page.mouse.move(star.x-150,star.y+star.height/2,{steps:10});await page.mouse.up();
  await expect.poll(()=>browser.locator(".carousel").evaluate(el=>el.scrollLeft)).toBeGreaterThan(80);
  expect(await page.evaluate(()=>presetStore.users.test?.favorites??[])).toEqual([]);
  const before=await browser.locator(".carousel").evaluate(el=>el.scrollLeft);
  await browser.locator(".carousel").hover();await page.mouse.wheel(0,220);
  await expect.poll(()=>browser.locator(".carousel").evaluate(el=>el.scrollLeft)).toBeGreaterThan(before+50);
  expect(await page.evaluate(()=>calls.length)).toBe(0);
});
test("collapsed first, remembered across editors, and three-and-half previews",async({page})=>{
  const browser=await ready(page);
  const disclosure=browser.getByRole("button",{name:"Presets",exact:true});
  await expect(disclosure).toHaveAttribute("aria-expanded","false");
  await disclosure.click();await expect(disclosure).toHaveAttribute("aria-expanded","true");
  const ratio=await browser.locator(".carousel").evaluate(el=>{
    const tile=el.querySelector("li").getBoundingClientRect();return (el.clientWidth-24)/tile.width;
  });expect(ratio).toBeCloseTo(3.5,1);
  await expect(page.locator("hue-gradient-editor").nth(1).locator("hgc-preset-browser").getByRole("button",{name:"Presets",exact:true})).toHaveAttribute("aria-expanded","true");
  await page.evaluate(()=>colors.setConfig({...colors._config,presets_expansion:"collapsed"}));
  await expect(disclosure).toHaveAttribute("aria-expanded","false");
});
test("apply preserves brightness, stars reorder, and library back restores controls",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"Presets",exact:true}).click();
  await browser.getByRole("button",{name:"Apply Ocean, 2 colors",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe("apply_preset");
  expect(await page.evaluate(()=>hass.states["light.strip"].attributes.brightness)).toBe(179);
  await expect(browser.getByRole("button",{name:"Apply Ocean, 2 colors",exact:true})).toHaveAttribute("aria-pressed","true");
  await browser.getByRole("button",{name:"Favorite Ember",exact:true}).click();
  await expect(browser.locator("li").first()).toHaveAttribute("data-preset-id","builtin:ember");
  await browser.getByRole("button",{name:"See all"}).click();
  await expect(browser.locator(".grid li")).toHaveCount(12);
  await expect(page.locator("hue-gradient-editor").first().locator(".wheel")).toBeHidden();
  await browser.getByRole("button",{name:"Back to editor"}).click();
  await expect(page.locator("hue-gradient-editor").first().locator(".wheel")).toBeVisible();
});
test("save exact current, update, rename and confirmed delete without auto-favoriting",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"See all"}).click();
  await browser.getByRole("button",{name:"Save current",exact:true}).click();
  await browser.getByLabel("Preset name").fill("My palette");await browser.getByRole("button",{name:"Save new",exact:true}).click();
  await expect(browser.getByRole("button",{name:"Apply My palette, 4 colors",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>presetStore.users.test.favorites)).toEqual([]);
  expect(await page.evaluate(()=>presetStore.presets.at(-1).colors_xy)).toEqual([[.55,.4],[.4,.2],[.25,.1],[.16,.12]]);
  await browser.getByRole("button",{name:"Apply My palette, 4 colors",exact:true}).click();
  await expect(browser.getByRole("button",{name:"Apply My palette, 4 colors",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(browser.getByRole("button",{name:"Save current",exact:true})).toBeEnabled();
  await browser.getByRole("button",{name:"Save current",exact:true}).click();
  await browser.getByRole("button",{name:"Update preset",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>presetStore.presets.at(-1).revision)).toBe(2);
  await browser.getByRole("button",{name:"Rename My palette",exact:true}).click();
  await browser.getByLabel("Preset name").fill("Evening");await browser.getByRole("button",{name:"Rename preset",exact:true}).click();
  await browser.getByRole("button",{name:"Delete Evening",exact:true}).click();
  await expect(browser.getByText(/Delete “Evening” for everyone/)).toBeVisible();
  await browser.getByRole("button",{name:"Delete preset",exact:true}).click();
  await expect(browser.locator(".grid li")).toHaveCount(12);
});
test("incompatibility, protected power and rejected applications remain honest",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"See all"}).click();
  await page.evaluate(()=>updateHass({states:{...hass.states,"light.strip":{...hass.states["light.strip"],attributes:{...hass.states["light.strip"].attributes,gradient_points_capable:2}}}}));
  await expect(browser.getByRole("button",{name:/Apply Aurora/})).toBeDisabled();
  await expect(browser.getByText("Needs 3 colors; this light supports 2")).toHaveCount(3);
  await page.evaluate(()=>{colors.setConfig({...colors._config,protect_when_off:true});updateHass({states:{...hass.states,"light.strip":{...hass.states["light.strip"],state:"off"}}});});
  await expect(browser.getByRole("button",{name:/Apply Ocean/})).toBeDisabled();
  await expect(browser.getByRole("button",{name:"Favorite Ocean",exact:true})).toBeEnabled();
  await page.evaluate(()=>{updateHass({states:{...hass.states,"light.strip":{...hass.states["light.strip"],state:"on"}}});window.rejectNext=true;});
  await browser.getByRole("button",{name:/Apply Ocean/}).click();
  await expect(page.locator("hue-gradient-editor").first().getByRole("alert")).toContainText("Backend rejected");
  await expect(browser.getByRole("button",{name:/Apply Ocean/})).toHaveAttribute("aria-pressed","false");
});
test("carousel swipe scrolls without applying and next arrow reaches later presets",async({page})=>{
  await page.setViewportSize({width:390,height:844});const browser=await ready(page);
  await browser.getByRole("button",{name:"Presets",exact:true}).click();
  const bounds=await browser.locator(".carousel").boundingBox();
  const session=await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:bounds.x+280,y:bounds.y+30,id:1}]});
  for(const offset of [240,180,100,30])await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:bounds.x+offset,y:bounds.y+30,id:1}]});
  await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>browser.locator(".carousel").evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>calls.length)).toBe(0);
  const ocean=browser.getByRole("button",{name:"Apply Ocean, 2 colors",exact:true});
  await ocean.focus();await page.keyboard.press("Enter");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe("apply_preset");
  const beforeNext=await browser.locator(".carousel").evaluate(el=>el.scrollLeft);
  await browser.getByRole("button",{name:"Next presets"}).click();
  await expect.poll(()=>browser.locator(".carousel").evaluate(el=>el.scrollLeft)).toBeGreaterThan(beforeNext+50);
  await session.detach();
});

test("reconnect during a mutation clears busy and capability reload restores the wheel",async({page})=>{
  const browser=await ready(page);
  await browser.getByRole("button",{name:"See all"}).click();
  await page.evaluate(()=>{
    const host=colors.renderRoot.querySelector("hgc-preset-browser"),original=hass.callWS;
    window.finishPresetMutation=undefined;
    hass.callWS=request=>request.type.endsWith("/favorite")?new Promise(resolve=>{window.finishPresetMutation=()=>resolve({});}):original(request);
    host._command("favorite",{preset_id:"builtin:ocean",favorite:true});
    host.remove();colors.renderRoot.querySelector("header").after(host);
  });
  await expect(browser.getByRole("button",{name:"Favorite Ocean",exact:true})).toBeEnabled();
  await page.evaluate(()=>finishPresetMutation());
  await page.evaluate(()=>{
    window.beforePresetReload=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...beforePresetReload,attributes:{...beforePresetReload.attributes,gradient_capable:false}}}});
  });
  await expect(page.locator("hue-gradient-editor").first().locator(".wheel")).toBeVisible();
  await page.evaluate(()=>updateHass({states:{...hass.states,"light.strip":beforePresetReload}}));
  await expect(page.locator("hue-gradient-editor").first().locator(".wheel")).toBeVisible();
  await expect(browser.getByRole("button",{name:"Presets",exact:true})).toBeVisible();
});

test("popup forwards opening config; library failures leave the light controls usable",async({page})=>{
  await ready(page,"noPresets=1");
  await page.evaluate(()=>{tile.setConfig({...tile._config,presets_expansion:"expanded"});tile.openPopup();});
  const popup=page.locator("dialog hue-gradient-editor"),browser=popup.locator("hgc-preset-browser");
  await expect(browser.getByRole("button",{name:"Presets",exact:true})).toHaveAttribute("aria-expanded","true");
  await expect(browser.getByRole("status")).toContainText("unavailable");
  await expect(popup.getByRole("button",{name:"Add color",exact:true})).toBeEnabled();
  await expect(popup.getByRole("slider",{name:"Brightness",exact:true})).toBeEnabled();
  await page.evaluate(()=>tile.setConfig({...tile._config,presets_expansion:"collapsed"}));
  await expect(browser.getByRole("button",{name:"Presets",exact:true})).toHaveAttribute("aria-expanded","false");
});
