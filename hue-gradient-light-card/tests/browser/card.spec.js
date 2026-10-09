import { test,expect } from "@playwright/test";
async function ready(page,query=""){
  await page.goto(`/?noEcho=1${query?`&${query.slice(1)}`:""}`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await expect(page.locator("#editors hue-gradient-editor").first().getByRole("button",{name:"Add color",exact:true})).toBeVisible();
}
test("actual Tile/Bubble dimensions and sizing match originals in masonry and Sections",async({page})=>{
  const errors=[];page.on("pageerror",(e)=>errors.push(e.message));await ready(page);
  await expect.poll(async()=>page.evaluate(()=>Boolean(tile._card&&bubble._card?.shadowRoot?.querySelector(".bubble-button-card-container")))).toBe(true);
  for(const layout of [undefined,"grid"]){
    await page.evaluate((layout)=>{for(const c of [tile,bubble,originalTile,originalBubble])c.layout=layout;},layout);
    const dimensions=await page.evaluate(()=>{
      const rect=(el)=>{const r=el.getBoundingClientRect();return [r.width,r.height];};
      const metrics=(card,selectors)=>selectors.map(selector=>{
        const el=card.shadowRoot.querySelector(selector),style=getComputedStyle(el);
        return [rect(el),...['padding','margin','fontFamily','fontSize','fontWeight','lineHeight','borderRadius'].map(key=>style[key])];
      });
      const tileSelectors=['ha-card','ha-tile-icon','ha-tile-info'];
      const bubbleSelectors=['.bubble-button-card-container','.bubble-icon-container','.bubble-name','.bubble-state'];
      return {tile:rect(tile),originalTile:rect(originalTile),bubble:rect(bubble),originalBubble:rect(originalBubble),
        tileMetrics:metrics(tile._card,tileSelectors),originalTileMetrics:metrics(originalTile,tileSelectors),
        bubbleMetrics:metrics(bubble._card,bubbleSelectors),originalBubbleMetrics:metrics(originalBubble,bubbleSelectors),
        tileGrid:tile.getGridOptions(),originalTileGrid:originalTile.getGridOptions(),bubbleGrid:bubble.getGridOptions(),originalBubbleGrid:originalBubble.getGridOptions()};
    });
    expect(dimensions.tile).toEqual(dimensions.originalTile);expect(dimensions.bubble).toEqual(dimensions.originalBubble);
    expect(dimensions.tileGrid).toEqual(dimensions.originalTileGrid);expect(dimensions.bubbleGrid).toEqual(dimensions.originalBubbleGrid);
    expect(dimensions.tileMetrics).toEqual(dimensions.originalTileMetrics);expect(dimensions.bubbleMetrics).toEqual(dimensions.originalBubbleMetrics);
  }
  expect(errors).toEqual([]);
});
test("full visual configuration synchronizes Name/Icon, design and opacity without commands",async({page})=>{
  await ready(page);
  const schema=await page.evaluate(()=>configEditor.shadowRoot.querySelector("ha-form").schema);
  expect(schema.map((field)=>field.name)).toEqual(["entity","design","name","icon","protect_when_off","presets_expansion","state_content","show_brightness_slider","icon_gradient_background","color_background","color_background_opacity"]);
  expect(schema[0].selector.entity.domain).toBe("light");
  await page.evaluate(()=>{
    configEditor.addEventListener("config-changed",(e)=>{window.saved=e.detail.config;tile.setConfig(e.detail.config);});
    configEditor.shadowRoot.querySelector("ha-form").dispatchEvent(new CustomEvent("value-changed",{detail:{value:{entity:"light.strip",design:"bubble",name:"Reading strip",icon:"mdi:led-strip-variant",color_background_opacity:0}}}));
  });
  await expect.poll(()=>page.evaluate(()=>tile._card?.localName)).toBe("bubble-card");
  expect(await page.evaluate(()=>saved.name)).toBe("Reading strip");
  expect(await page.evaluate(()=>calls)).toEqual([]);
  await page.evaluate(()=>tile.openPopup());
  await expect(page.locator("dialog h2")).toHaveText("Reading strip");
  expect(await page.locator("dialog hue-gradient-editor ha-icon").first().evaluate((el)=>el.icon)).toBe("mdi:led-strip-variant");
  await page.getByRole("button",{name:"Close gradient editor"}).click();
});
test("missing Bubble retains selection and provides a Tile fallback and dependency message",async({page})=>{
  await ready(page,"?noBubble=1");
  await page.evaluate(()=>configEditor.setConfig({entity:"light.strip",design:"bubble"}));
  await expect(page.locator("#config")).toContainText("Install Bubble Card");
  expect(await page.evaluate(()=>bubble._config.design)).toBe("bubble");
  expect(await page.evaluate(()=>bubble._card.localName)).toBe("hui-tile-card");
});
test("palettes, one/max boundaries, renumbering and keyboard movement",async({page})=>{
  await ready(page);const editor=page.locator("#editors hue-gradient-editor").first();
  const initial=await page.evaluate(()=>colors.points);
  await editor.getByRole("button",{name:"View Whites palette"}).click();
  expect(await page.evaluate(()=>colors.points)).toEqual(initial);expect(await page.evaluate(()=>calls.length)).toBe(0);
  await expect(editor.locator(".outside")).toHaveCount(4);
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await expect(editor.getByRole("button",{name:"Add color",exact:true})).toBeDisabled();
  await expect(editor.locator(".point")).toHaveCount(7);
  const marker=editor.locator(".point").last();
  await marker.press("ArrowRight");await marker.press("Delete");await expect(editor.locator(".point")).toHaveCount(6);
  for(let count=6;count>1;count--)await editor.locator(".point").last().press("Delete");
  await expect(editor.locator(".point")).toHaveCount(1);await expect(editor.getByRole("combobox",{name:"Gradient mode"})).toBeDisabled();
  await expect(editor.locator(".point ha-icon")).toHaveCount(0);await editor.locator(".point").press("Delete");await expect(editor.locator(".point")).toHaveCount(1);
  expect(await page.evaluate(()=>calls.filter((c)=>c.service==="set_gradient").every((c)=>c.data.colors.every((rgb)=>rgb.length===3&&rgb.every(Number.isInteger))))).toBe(true);
});
test("dragging selected X moves without deletion, final value flushes",async({page})=>{
  await ready(page);const point=page.locator("#editors hue-gradient-editor").first().locator(".point").first();
  const box=await point.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+30,{steps:12});await page.mouse.up();
  await expect(page.locator("#editors hue-gradient-editor").first().locator(".point")).toHaveCount(4);
  await expect.poll(()=>page.evaluate(()=>calls.length)).toBeGreaterThan(0);
  const last=await page.evaluate(()=>calls.filter((c)=>c.service==="set_gradient").at(-1));
  expect(last.data.turn_on).toBe(true);expect(last.data.colors.length).toBe(4);
});

test("Whites markers track the pointer through neutral white without jumps or neighbor movement",async({page})=>{
  await ready(page);const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.getByRole("button",{name:"View Whites palette"}).click();
  const original=await page.evaluate(()=>colors.points);
  expect(await page.evaluate(()=>calls.length)).toBe(0);
  await expect(editor.locator(".actual-color")).toHaveCount(4);
  const faces=await editor.locator(".point").evaluateAll(points=>points.map(p=>getComputedStyle(p).backgroundColor));
  for(let index=0;index<faces.length;index++)expect(faces[index]).not.toBe(`rgb(${original[index].join(", ")})`);
  const point=editor.locator(".point").nth(1),wheel=await editor.locator(".wheel").boundingBox();
  const before=await editor.locator(".point").evaluateAll(points=>points.map(p=>[p.style.left,p.style.top]));
  const initial=await point.boundingBox();
  await page.mouse.move(initial.x+initial.width/2,initial.y+initial.height/2);await page.mouse.down();
  for(const [x,y] of [[-.65,-.2],[-.3,-.1],[-.05,.6],[0,.7],[.01,-.7],[.05,-.6],[.3,.2],[.6,.1]]){
    const target={x:wheel.x+wheel.width/2+x*wheel.width*.46,y:wheel.y+wheel.height/2+y*wheel.height*.46};
    await page.mouse.move(target.x,target.y);
    await expect.poll(async()=>{const r=await point.boundingBox();return Math.hypot(r.x+r.width/2-target.x,r.y+r.height/2-target.y);}).toBeLessThan(.8);
    const positions=await editor.locator(".point").evaluateAll(points=>points.map(p=>[p.style.left,p.style.top]));
    expect(positions.filter((_,i)=>i!==1)).toEqual(before.filter((_,i)=>i!==1));
    const rgb=await page.evaluate(()=>colors.points[1]);
    expect(await point.evaluate(p=>getComputedStyle(p).backgroundColor)).toBe(`rgb(${rgb.join(", ")})`);
  }
  const stationary=await point.boundingBox();await page.waitForTimeout(2100);
  expect(await point.boundingBox()).toEqual(stationary);
  await page.mouse.up();await expect(editor.locator(".point")).toHaveCount(4);
  await expect(editor.locator(".actual-color")).toHaveCount(3);
  const final=await page.evaluate(()=>colors.points);
  expect(final.filter((_,i)=>i!==1)).toEqual(original.filter((_,i)=>i!==1));expect(final[1][2]).toBeGreaterThan(final[1][0]);
  await expect.poll(()=>page.evaluate(()=>calls.filter(c=>c.service==="set_gradient").at(-1)?.data.colors)).toEqual(final);
});

test("interactive preview echoes white edits and retains released marker coordinates",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.getByRole("button",{name:"View Whites palette"}).click();
  const point=editor.locator(".point").first(),start=await point.boundingBox(),wheel=await editor.locator(".wheel").boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
  await page.mouse.move(wheel.x+wheel.width*.3,wheel.y+wheel.height*.6,{steps:6});await page.mouse.up();
  const released=await point.boundingBox();
  await expect.poll(()=>page.evaluate(()=>hass.states["light.strip"].attributes.gradient_colors_rgb)).toEqual(await page.evaluate(()=>colors.points));
  await page.waitForTimeout(2000);expect(await point.boundingBox()).toEqual(released);
  await expect(editor.locator(".point")).toHaveCount(4);
});

test("rounded mode list aligns its arrow and supports keyboard, touch and light dismissal",async({page,browser})=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await ready(page);const combo=page.locator("#editors hue-gradient-editor").first().getByRole("combobox",{name:"Gradient mode"});
  const insets=await combo.evaluate(button=>{
    const rect=button.getBoundingClientRect(),text=button.querySelector("span").getBoundingClientRect(),arrow=button.querySelector("ha-icon").getBoundingClientRect();
    return [text.left-rect.left,rect.right-arrow.right];
  });
  expect(Math.abs(insets[0]-insets[1])).toBeLessThan(1);expect(insets[1]).toBeGreaterThanOrEqual(16);
  await combo.press("ArrowDown");const menu=page.getByRole("listbox",{name:"Gradient mode options"});await expect(menu).toBeVisible();
  expect(await menu.evaluate(el=>getComputedStyle(el).borderRadius)).toBe(await combo.evaluate(el=>getComputedStyle(el).borderRadius));
  await combo.press("ArrowDown");await combo.press("Enter");await expect(combo).toHaveText("Mirrored");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.mode)).toBe("interpolated_palette_mirrored");
  await combo.click();await page.getByRole("option",{name:"Segments",exact:true}).click();await expect(combo).toHaveText("Segments");
  await combo.click();await page.locator("h1").click();await expect(menu).toBeHidden();
  await page.evaluate(()=>tile.openPopup());const popupCombo=page.locator("dialog").getByRole("combobox",{name:"Gradient mode"});
  await popupCombo.press("ArrowDown");await popupCombo.press("Escape");await expect(page.locator("dialog")).toBeVisible();
  await expect(page.getByRole("listbox",{name:"Gradient mode options"})).toBeHidden();
  await popupCombo.click();await page.evaluate(()=>tile.closePopup());
  await expect(page.getByRole("listbox",{name:"Gradient mode options"})).toBeHidden();expect(errors).toEqual([]);
  const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844}}),mobile=await context.newPage();
  await ready(mobile);await mobile.evaluate(()=>tile.openPopup());
  await mobile.locator("dialog").getByRole("combobox",{name:"Gradient mode"}).tap();
  const mobileMenu=mobile.getByRole("listbox",{name:"Gradient mode options"}),rect=await mobileMenu.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.y+rect.height).toBeLessThanOrEqual(844);
  await mobile.getByRole("option",{name:"Pixelated",exact:true}).tap();
  await expect.poll(()=>mobile.evaluate(()=>calls.at(-1)?.data.mode)).toBe("random_pixelated");await context.close();
});
test("ordinary capability adaptation, zero brightness, unavailable and missing entities",async({page})=>{
  await ready(page);const editor=page.locator("#editors hue-gradient-editor").first();
  for(const modes of [["onoff"],["brightness"],["rgb"],["hs"],["xy"],["color_temp"]]){
    await page.evaluate((modes)=>{
      hass.states["light.basic"]={entity_id:"light.basic",state:"on",attributes:{friendly_name:"Ordinary",supported_color_modes:modes,min_color_temp_kelvin:2100,max_color_temp_kelvin:6400,color_temp_kelvin:3000,brightness:150,rgb_color:[255,0,0]}};
      colors.setConfig({entity:"light.basic"});updateHass();
    },modes);
    await expect(editor.getByRole("button",{name:"Add color",exact:true})).toHaveCount(0);
    await expect(editor.getByRole("combobox",{name:"Gradient mode"})).toHaveCount(0);
    await expect(editor.locator("canvas")).toHaveCount(["rgb","hs","xy"].includes(modes[0])?1:0);
    await expect(editor.getByRole("slider",{name:"Brightness",exact:true})).toHaveCount(modes[0]==="onoff"?0:1);
  }
  const kelvin=editor.getByRole("slider",{name:"White temperature in Kelvin"});
  await kelvin.fill("6400");await kelvin.dispatchEvent("input");await kelvin.dispatchEvent("change");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.color_temp_kelvin)).toBe(6400);
  const brightness=editor.getByRole("slider",{name:"Brightness",exact:true});await brightness.fill("0");await brightness.dispatchEvent("input");await brightness.dispatchEvent("change");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe("turn_off");
  await page.evaluate(()=>{
    const slider=colors.shadowRoot.querySelector('input[aria-label="Brightness"]');
    slider.value="30";slider.dispatchEvent(new Event("input"));
    slider.value="0";slider.dispatchEvent(new Event("input"));
    slider.value="60";slider.dispatchEvent(new Event("input"));slider.dispatchEvent(new Event("change"));
  });
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.brightness)).toBe(153);
  expect(await page.evaluate(()=>calls.at(-1)?.service)).toBe("turn_on");
  await page.evaluate(()=>{hass.states["light.basic"]={...hass.states["light.basic"],state:"unavailable"};updateHass();});
  await expect(brightness).toBeDisabled();
  await page.evaluate(()=>{delete hass.states["light.basic"];updateHass();});await expect(editor).toContainText("not found");
  expect(await page.evaluate(()=>calls.some((c)=>c.domain==="hue_gradient_controller"))).toBe(false);
});
test("backend rejection and delayed external updates reconcile to reported state",async({page})=>{
  await ready(page);const editor=page.locator("#editors hue-gradient-editor").first();
  await page.evaluate(()=>window.rejectNext=true);await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await expect(editor.getByRole("alert")).toContainText("Backend rejected");await expect(editor.locator(".point")).toHaveCount(4);
  await page.evaluate(()=>{hass.states["light.strip"]={...hass.states["light.strip"],attributes:{...hass.states["light.strip"].attributes,color_mode:"color_temp",color_temp_kelvin:3000}};updateHass();});
  await expect(editor.locator(".point")).toHaveCount(1);
});
test("exact snapshot/restore overflow and accessible unlabeled mode",async({page})=>{
  await ready(page);const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.locator("summary").click();await editor.getByRole("button",{name:"Snapshot",exact:true}).click();
  await expect(editor.getByRole("button",{name:"Restore",exact:true})).toBeVisible();await editor.getByRole("button",{name:"Restore",exact:true}).click();
  const call=await page.evaluate(()=>calls.find((c)=>c.service==="restore_gradient"));
  expect(call.data.snapshot.entities["light.strip"].colors_xy).toEqual([[.55,.4],[.4,.2],[.25,.1],[.16,.12]]);
  expect(call.data.snapshot.entities["light.strip"].brightness).toBe(70.123);
  await expect(editor.getByRole("combobox",{name:"Gradient mode"})).toBeVisible();
});
test("actual Bubble main button opens own compact dialog; Escape closes without writes",async({page})=>{
  await ready(page);const card=page.locator("#cards hue-gradient-light-card").last();
  await card.locator(".bubble-background").click();await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.locator("dialog")).toHaveCount(0);expect(await page.evaluate(()=>calls.length)).toBe(0);
});

test("native power icons serialize behind edits and guard unavailable lights",async({page})=>{
  await ready(page);
  await page.evaluate(()=>{
    const original=hass.callService;
    hass.callService=async(...args)=>{
      await original(...args);
      if(args[0]==="hue_gradient_controller")await new Promise(resolve=>window.releaseWrite=resolve);
    };
  });
  const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.getByRole("button",{name:"Add color",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.releaseWrite))).toBe(true);
  await page.locator("#cards hue-gradient-light-card").first().locator("ha-tile-icon").click();
  expect(await page.evaluate(()=>calls.map(c=>c.service))).toEqual(["set_gradient"]);
  await page.evaluate(()=>window.releaseWrite());
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe("turn_off");
  await page.locator("#cards hue-gradient-light-card").last().locator(".bubble-icon-container").click();
  await expect.poll(()=>page.evaluate(()=>calls.filter(c=>c.service==="turn_off").length)).toBe(2);
  await page.evaluate(()=>{hass.states["light.strip"]={...hass.states["light.strip"],state:"unavailable"};updateHass();});
  await page.locator("#cards hue-gradient-light-card").first().locator("ha-tile-icon").click();
  expect(await page.evaluate(()=>calls.filter(c=>c.service==="turn_off").length)).toBe(2);
});
test("theme/radius changes, opacity endpoints and mobile fit",async({page})=>{
  await ready(page);
  for(const opacity of [0,70,100]){
    await page.evaluate((opacity)=>tile.setConfig({entity:"light.strip",color_background_opacity:opacity}),opacity);
    await expect.poll(()=>page.evaluate(()=>tile._card.style.getPropertyValue("--hgc-card-fill"))).toContain(opacity===0?"none":`${opacity/100})`);
  }
  await page.evaluate(()=>{document.body.classList.add("light");document.documentElement.style.setProperty("--ha-card-border-radius","7px");updateHass();});
  await expect.poll(()=>page.evaluate(()=>getComputedStyle(tile._card.shadowRoot.querySelector("ha-card")).borderRadius)).toBe("7px");
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>tile.openPopup());
  const rect=await page.locator("dialog").boundingBox();expect(rect.width).toBeLessThanOrEqual(351);expect(rect.x).toBeGreaterThanOrEqual(0);
});
