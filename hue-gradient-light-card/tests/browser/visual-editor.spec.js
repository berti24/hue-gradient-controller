import {test,expect} from "@playwright/test";
async function ready(page){
  await page.goto("/?noBubble=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await expect(page.locator("#config").getByRole("radio",{name:"Bubble like",exact:true})).toBeVisible();
}
test("native Tile icons are round and native fields and unselected radios have contrast in both themes",async({page})=>{
  await ready(page);
  const radii=await page.evaluate(()=>[originalTile,tile._card].map(card=>{
    const container=card.shadowRoot.querySelector("ha-tile-icon").shadowRoot.querySelector(".container");
    return {radius:parseFloat(getComputedStyle(container).borderRadius),width:container.getBoundingClientRect().width};
  }));
  expect(radii[1]).toEqual(radii[0]);
  expect(radii[1].radius).toBeGreaterThanOrEqual(radii[1].width/2);
  const form=page.locator("#config"),name=form.getByRole("textbox",{name:"Name",exact:true});
  for(const light of [false,true]){
    await page.evaluate(light=>{document.body.classList.toggle("light",light);updateHass();},light);
    const pageRgb=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number));
    expect(pageRgb.every(value=>light?value>200:value<100)).toBe(true);
    const surface=await name.evaluate(input=>{
      const base=input.getRootNode().querySelector('[part~="base"]');
      return {field:getComputedStyle(base).backgroundColor,page:getComputedStyle(document.body).backgroundColor};
    });
    expect(surface.field).not.toBe("rgba(0, 0, 0, 0)");expect(surface.field).not.toBe(surface.page);
    // Native controls animate their surfaces on theme changes. Check settled
    // rendered contrast instead of asserting that a CSS token merely exists.
    await expect.poll(()=>name.evaluate(input=>{
      const base=input.getRootNode().querySelector('[part~="base"]');
      const luminance=color=>{
        const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
        return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
      };
      const fg=luminance(getComputedStyle(input).color),bg=luminance(getComputedStyle(base).backgroundColor);
      return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    })).toBeGreaterThan(4.5);
    const control=await form.getByRole("radio",{name:"Bubble like",exact:true}).evaluate(radio=>{
      const style=getComputedStyle(radio.shadowRoot.querySelector(".control"));
      return {width:parseFloat(style.borderWidth),style:style.borderStyle,color:style.borderColor};
    });
    expect(control.width).toBeGreaterThanOrEqual(1);expect(control.style).toBe("solid");
    expect(control.color).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.evaluate(()=>configEditor.addEventListener("config-changed",e=>window.edited=e.detail.config));
  await form.getByRole("radio",{name:"Bubble like",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.edited?.design)).toBe("bubble");
  await form.getByRole("radio",{name:"Tile like",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.edited?.design)).toBe("tile");
  expect(await page.evaluate(()=>calls)).toEqual([]);
});
test("native icon picker stays anchored to its field and saves the selected icon",async({page})=>{
  await ready(page);
  await page.evaluate(()=>configEditor.addEventListener("config-changed",e=>window.edited=e.detail.config));
  const picker=page.locator("#config ha-icon-picker"),field=picker.locator("ha-picker-field").getByRole("listitem");
  for(const light of [false,true]){
    await page.evaluate(light=>{document.body.classList.toggle("light",light);updateHass();},light);
    await field.click();
    const menu=picker.locator('wa-popover [part~="body"]');await expect(menu).toBeVisible();
    await expect.poll(async()=>{
      const anchor=await field.boundingBox(),popup=await menu.boundingBox();
      return Math.min(Math.abs(popup.y+popup.height-anchor.y),Math.abs(popup.y-anchor.y-anchor.height))<=8
        && Math.abs(popup.x-anchor.x)<=2 && Math.abs(popup.width-anchor.width)<=2;
    }).toBe(true);
    await page.keyboard.press("Escape");await expect(menu).not.toBeVisible();
  }
  await field.click();
  await picker.getByText("mdi:abacus",{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.edited?.icon)).toBe("mdi:abacus");
  await expect(picker.locator('wa-popover [part~="body"]')).not.toBeVisible();
  expect(await page.evaluate(()=>calls)).toEqual([]);
});
test("native visual form Name input sends config-changed without service calls",async({page})=>{
  await page.goto("/?noBubble=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>configEditor.addEventListener("config-changed",(e)=>window.edited=e.detail.config));
  const form=page.locator("#config");
  await form.getByRole("textbox",{name:"Name",exact:true}).fill("Desk lamp");
  await form.getByRole("textbox",{name:"Name",exact:true}).blur();
  await expect.poll(()=>page.evaluate(()=>window.edited?.name)).toBe("Desk lamp");
  expect(await page.evaluate(()=>calls.length)).toBe(0);
  await form.getByRole("textbox",{name:"Name",exact:true}).fill("");await form.getByRole("textbox",{name:"Name",exact:true}).blur();
  await expect.poll(()=>page.evaluate(()=>window.edited&&Object.hasOwn(window.edited,"name"))).toBe(false);
  await expect(form.locator("ha-entity-picker")).toBeVisible();
  await form.locator("ha-entity-picker").getByRole("listitem").click();
  await expect(page.getByText("Ceiling light",{exact:true})).toBeVisible();
  await page.getByText("Ceiling light",{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.edited?.entity)).toBe("light.basic");
});
