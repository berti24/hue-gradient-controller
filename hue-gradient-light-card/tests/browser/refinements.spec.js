import {test,expect} from "@playwright/test";
async function ready(page,version="3.4.1"){
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`/?bubble=${version}`,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await expect(page.locator("#editors hue-gradient-editor").first().getByRole("slider",{name:"Brightness",exact:true})).toBeVisible();
  return errors;
}
test("power off overrides pending Whites feedback in both views and header icons reflect on/off",async({page})=>{
  const errors=await ready(page),editors=page.locator("#editors hue-gradient-editor");
  await editors.last().locator(".point").first().focus();await page.keyboard.press("ArrowRight");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe("set_gradient");
  const onColor=await editors.last().locator(".header-icon").evaluate(el=>getComputedStyle(el).color);
  expect(onColor).not.toBe(await editors.last().evaluate(el=>getComputedStyle(el).color));
  await editors.last().getByRole("button",{name:"Turn off",exact:true}).click();
  for(const editor of [editors.first(),editors.last()]){
    await expect(editor.getByRole("slider",{name:"Brightness",exact:true})).toHaveValue("0");
    await expect(editor.getByRole("button",{name:"Turn on",exact:true})).toBeVisible();
    expect(await editor.locator(".header-icon").evaluate(el=>getComputedStyle(el).color)).toBe(await editor.evaluate(el=>getComputedStyle(el).color));
  }
  await editors.first().getByRole("button",{name:"Turn on",exact:true}).click();
  for(const editor of [editors.first(),editors.last()])await expect(editor.getByRole("slider",{name:"Brightness",exact:true})).toHaveValue("70");
  await page.evaluate(()=>window.rejectNext=true);
  await editors.last().getByRole("button",{name:"Turn off",exact:true}).click();
  await expect(editors.last().getByRole("alert")).toContainText("Backend rejected");
  await expect(editors.last().getByRole("slider",{name:"Brightness",exact:true})).toHaveValue("70");
  expect(errors).toEqual([]);
});
test("native subtitle picker controls actual Tile and Bubble 2.3.4 text without changing hass states",async({page})=>{
  const errors=await ready(page,"2.3.4"),form=page.locator("#config"),cards=page.locator("#cards hue-gradient-light-card");
  await form.getByRole("heading",{name:"Content",exact:true}).click();
  const text=card=>card.locator("ha-tile-info,.bubble-state");
  const picker=form.locator("ha-entity-state-content-picker");
  const add=async name=>{await picker.getByRole("button",{name:"add",exact:true}).click();await form.getByText(name,{exact:true}).click();};
  const remove=name=>picker.getByRole("button",{name:`Remove ${name}`,exact:true}).click();
  await add("Color count");
  await add("Gradient mode");
  for(const card of [cards.first(),cards.last()]){
    await expect(text(card)).toContainText("On");await expect(text(card)).toContainText("70%");
    await expect(text(card)).toContainText("4 colors");await expect(text(card)).toContainText("Blended");
  }
  await remove("state");
  await remove("brightness");
  for(const card of [cards.first(),cards.last()]){
    await expect(text(card)).not.toContainText("On");await expect(text(card)).not.toContainText("70%");
    await expect(text(card)).toContainText("4 colors");await expect(text(card)).toContainText("Blended");
  }
  await remove("Color count");
  await remove("Gradient mode");
  await expect.poll(()=>page.evaluate(()=>tile._card._config.hide_state)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>bubble._card.config.show_state)).toBe(false);
  expect(await page.evaluate(()=>Object.keys(hass.states["light.strip"].attributes).some(key=>key.startsWith("hgc_")))).toBe(false);
  expect(await page.evaluate(()=>calls)).toEqual([]);expect(errors).toEqual([]);
});
test("overflow rows, blur, outside dismissal, Escape and native More info",async({page})=>{
  const errors=await ready(page);await page.evaluate(()=>tile.openPopup());
  const editor=page.locator("dialog hue-gradient-editor"),summary=editor.locator("summary");
  await summary.click();const menu=editor.locator("details .menu");await expect(menu).toBeVisible();
  await expect(menu.getByRole("button",{name:"Turn off",exact:true})).toHaveCount(0);
  await expect(menu.getByRole("button",{name:"Snapshot",exact:true})).toBeVisible();
  const snapshot=await menu.getByRole("button",{name:"Snapshot",exact:true}).boundingBox(),more=await menu.getByRole("button",{name:"More info",exact:true}).boundingBox();
  expect(more.y).toBeGreaterThan(snapshot.y+snapshot.height);
  expect(await editor.locator(".menu-backdrop").evaluate(el=>getComputedStyle(el).backdropFilter)).toContain("blur");
  await editor.locator(".menu-backdrop").click({position:{x:15,y:15}});await expect(menu).not.toBeVisible();
  await expect(page.locator("dialog")).toBeVisible();
  await summary.click();await page.keyboard.press("Escape");await expect(menu).not.toBeVisible();await expect(page.locator("dialog")).toBeVisible();
  await summary.click();await menu.getByRole("button",{name:"More info",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.moreInfoEntity)).toBe("light.strip");
  await expect(page.locator("dialog")).toHaveCount(0);expect(await page.evaluate(()=>calls)).toEqual([]);expect(errors).toEqual([]);
});
test("visual opacity slider changes the actual renderer background with fully opaque controls",async({page})=>{
  const errors=await ready(page);
  await page.locator("#config").getByRole("heading",{name:"Content",exact:true}).click();
  const slider=page.locator("#config").getByRole("slider");
  for(const value of [0,35,100]){
    await slider.focus();await page.keyboard.press("Home");if(value===100)await page.keyboard.press("End");
    else for(let i=0;i<value;i++)await page.keyboard.press("ArrowRight");
    for(const design of ["tile","bubble"]){
      await expect.poll(()=>page.evaluate(({design,value})=>{
        const card=window[design]._card,el=card?.shadowRoot?.querySelector(design==="tile"?"ha-card":".bubble-button-card-container");
        return el&&getComputedStyle(el).backgroundImage.includes(value===0?"none":value===100?"rgb(255, 130, 10)":`rgba(255, 130, 10, ${value/100})`);
      },{design,value})).toBe(true);
    }
  }
  expect(await page.locator("#cards hue-gradient-light-card").first().evaluate(el=>getComputedStyle(el).opacity)).toBe("1");
  expect(await page.evaluate(()=>calls)).toEqual([]);expect(errors).toEqual([]);
});
