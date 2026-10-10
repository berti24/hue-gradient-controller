import {test,expect} from "@playwright/test";

const tileCard=page=>page.locator("#cards hue-gradient-light-card").first();
async function ready(page){
  await page.goto("/?noEcho=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
}
async function enable(page){
  await page.evaluate(()=>tile.setConfig({...tile._config,show_brightness_slider:true,color_background:false}));
  const slider=tileCard(page).getByRole("slider",{name:"brightness",exact:true});
  await expect(slider).toBeVisible();
  await expect.poll(()=>slider.evaluate(el=>Boolean(el.getRootNode().querySelector('style[data-hgc="brightness"]')))).toBe(true);
  return slider;
}

for(const width of [1200,390])test(`optional Tile brightness row has full palette, native sizing and controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));await ready(page);
  await expect(tileCard(page).getByRole("slider")).toHaveCount(0);
  // Use the actual config switch and verify that changing settings never writes.
  await page.locator('#config').getByRole('heading',{name:'Features',exact:true}).click();
  const field=page.locator('#config ha-selector-boolean').filter({has:page.locator('p.primary').filter({hasText:/^Brightness slider$/})});
  const toggle=field.getByRole("switch");await toggle.focus();await toggle.press("Space");
  await expect.poll(()=>page.evaluate(()=>tile._config.show_brightness_slider)).toBe(true);
  const slider=await enable(page);
  expect(await page.evaluate(()=>calls)).toEqual([]);
  await page.evaluate(()=>{
    originalTile.setConfig({type:"tile",entity:"light.strip",features:[{type:"light-brightness"}],features_position:"bottom"});originalTile.hass=hass;
  });
  await expect(page.locator('#cards > hui-tile-card').getByRole("slider")).toBeVisible();
  expect(await page.evaluate(()=>tile.getGridOptions())).toEqual(await page.evaluate(()=>originalTile.getGridOptions()));
  expect(await page.evaluate(()=>tile.getCardSize())).toBe(2);
  const infoBox=await tileCard(page).locator("ha-tile-info").boundingBox(),sliderBox=await slider.boundingBox();
  expect(sliderBox.y).toBeGreaterThanOrEqual(infoBox.y+infoBox.height);
  const palette=await slider.evaluate(el=>({fill:getComputedStyle(el.querySelector('.slider-track-bar')).backgroundImage,rest:getComputedStyle(el.querySelector('.slider-track-background')).backgroundImage,opacity:getComputedStyle(el.querySelector('.slider-track-background')).opacity}));
  for(const rgb of ['255, 130, 10','255, 20, 140','143, 10, 255','0, 74, 255']){
    expect(palette.fill).toContain(rgb);expect(palette.rest).toContain(rgb);
  }
  expect(Number(palette.opacity)).toBeLessThan(1);
  await expect.poll(()=>slider.evaluate(el=>el.querySelector('.slider-track-bar').getBoundingClientRect().width/el.getBoundingClientRect().width)).toBeLessThan(.8);
  await slider.press("ArrowRight");
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.brightness_pct)).toBe(71);
  expect(await page.evaluate(()=>calls.at(-1))).toMatchObject({domain:"light",service:"turn_on",data:{entity_id:"light.strip",brightness_pct:71}});
  expect(await page.evaluate(()=>Boolean(tile._dialog))).toBe(false);
  // Pointer interaction sends brightness only and does not open the popup.
  await slider.click({position:{x:sliderBox.width*.3,y:sliderBox.height/2}});
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.data.brightness_pct)).toBeLessThan(40);
  expect(await page.evaluate(()=>calls.every(c=>c.domain==='light'&&c.service==='turn_on'&&!c.data.colors))).toBe(true);
  expect(await page.evaluate(()=>Boolean(tile._dialog))).toBe(false);
  for(const light of [false,true]){
    await page.evaluate(light=>{document.body.classList.toggle('light',light);updateHass({});},light);
    const cardBox=await tileCard(page).boundingBox(),trackBox=await slider.boundingBox();
    expect(trackBox.x).toBeGreaterThanOrEqual(cardBox.x);expect(trackBox.x+trackBox.width).toBeLessThanOrEqual(cardBox.x+cardBox.width);
  }
  expect(errors).toEqual([]);
});

test("brightness palette follows live colors; off/unavailable/on-off and Bubble retain native behavior",async({page})=>{
  await ready(page);const slider=await enable(page);
  const change=async(state,attributes={})=>page.evaluate(({state,attributes})=>{
    const current=hass.states['light.strip'];updateHass({states:{...hass.states,'light.strip':{...current,state,attributes:{...current.attributes,...attributes}}}});
  },{state,attributes});
  await change('on',{gradient_colors_rgb:[[0,255,0],[255,0,0]],gradient_colors_xy:[[.2,.7],[.6,.3]]});
  await expect.poll(()=>slider.evaluate(el=>getComputedStyle(el.querySelector('.slider-track-bar')).backgroundImage)).toContain('0, 255, 0');
  await change('on',{color_mode:'color_temp',color_temp_kelvin:3000});
  await expect.poll(()=>slider.evaluate(el=>getComputedStyle(el.querySelector('.slider-track-bar')).backgroundImage)).not.toContain('0, 255, 0');
  await change('off');await expect(slider).toHaveAttribute('aria-valuenow','1');
  await slider.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>calls.length)).toBe(1);
  expect(await page.evaluate(()=>calls[0])).toMatchObject({service:'turn_on',data:{entity_id:'light.strip'}});
  await change('unavailable');await page.evaluate(()=>calls.length=0);
  await slider.press('ArrowRight');await page.waitForTimeout(250);expect(await page.evaluate(()=>calls)).toEqual([]);
  await change('on',{supported_color_modes:['onoff'],color_mode:'onoff'});
  await expect(tileCard(page).getByRole('slider')).toHaveCount(0);
  await page.evaluate(()=>{
    bubble.setConfig({...bubble._config,show_brightness_slider:true});configEditor.setConfig({...tile._config,design:'bubble'});
  });
  await expect(page.locator('#cards hue-gradient-light-card').last().getByRole('slider')).toHaveCount(0);
  await expect(page.locator('#config').getByRole('heading',{name:'Features',exact:true})).toHaveCount(0);
});

test("native slider writes wait for popup edits and queued requests discard on disconnect",async({page})=>{
  await ready(page);const slider=await enable(page);
  await page.evaluate(()=>{
    const original=hass.callService;window.releaseBrightnessLane=undefined;
    updateHass({callService:(...args)=>{
      if(args[0]==='hue_gradient_controller')return new Promise(resolve=>{window.releaseBrightnessLane=resolve;});
      return original(...args);
    }});
    colors._queue({domain:'hue_gradient_controller',service:'set_gradient',data:{colors:colors.points,mode:'interpolated_palette',transition:0}},true);
  });
  await page.waitForFunction(()=>window.releaseBrightnessLane);
  await slider.press('ArrowRight');await page.waitForTimeout(100);expect(await page.evaluate(()=>calls)).toEqual([]);
  await page.evaluate(()=>tile.remove());await page.evaluate(()=>releaseBrightnessLane());
  await page.waitForTimeout(250);expect(await page.evaluate(()=>calls)).toEqual([]);
});

test("Off protection disables the native Tile slider and keeps explicit power usable",async({page})=>{
  await ready(page);await enable(page);
  await page.evaluate(()=>{
    tile.setConfig({...tile._config,protect_when_off:true});
    const state=hass.states['light.strip'];updateHass({states:{...hass.states,'light.strip':{...state,state:'off'}}});
  });
  const current=tileCard(page).getByRole('slider',{name:'brightness',exact:true});
  await expect(tileCard(page).locator('ha-control-slider')).toHaveAttribute('disabled','');
  await current.press('ArrowRight');
  await page.evaluate(()=>tile._card.hass.callService('light','turn_on',{entity_id:'light.strip',brightness_pct:50}));
  expect(await page.evaluate(()=>calls)).toEqual([]);
  await tileCard(page).locator('ha-tile-icon').click();
  await expect.poll(()=>page.evaluate(()=>calls.at(-1)?.service)).toBe('turn_on');
  await expect(tileCard(page).locator('ha-control-slider')).toHaveAttribute('disabled','');
  await page.evaluate(()=>{
    const state=hass.states['light.strip'];updateHass({states:{...hass.states,'light.strip':{...state,state:'on'}}});
  });
  await expect(tileCard(page).locator('ha-control-slider')).not.toHaveAttribute('disabled');
  await current.press('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>calls.length)).toBe(2);
});

test("protected off cancels queued Tile brightness even if reported on returns before dispatch",async({page})=>{
  await ready(page);await enable(page);
  await page.evaluate(()=>{
    tile.setConfig({...tile._config,protect_when_off:true});
    const original=hass.callService;
    updateHass({callService:(...args)=>{
      if(args[0]==='hue_gradient_controller')return new Promise(resolve=>{window.releaseBrightnessLane=resolve;});
      return original(...args);
    }});
    colors._colorCommand(true);
  });
  await page.waitForFunction(()=>Boolean(window.releaseBrightnessLane));
  await page.evaluate(()=>{
    tile._card.hass.callService('light','turn_on',{entity_id:'light.strip',brightness_pct:50});
    const state=hass.states['light.strip'];
    updateHass({states:{...hass.states,'light.strip':{...state,state:'off'}}});
    updateHass({states:{...hass.states,'light.strip':{...state,state:'on'}}});
    window.releaseBrightnessLane();
  });
  await page.waitForFunction(()=>!colors._writer.busy);
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>calls)).toEqual([]);
});

test("popup Turn off protects Tile brightness after closing and reopening",async({page})=>{
  await ready(page);await enable(page);
  await page.evaluate(()=>{
    tile.setConfig({...tile._config,protect_when_off:true});
    tile.openPopup();tile._editor._power();
  });
  await expect.poll(()=>page.evaluate(()=>calls.length)).toBe(1);
  expect(await page.evaluate(()=>calls[0].service)).toBe('turn_off');
  await page.evaluate(()=>{
    tile.closePopup();
    tile._card.hass.callService('light','turn_on',{entity_id:'light.strip',brightness_pct:50});
    tile.openPopup();
  });
  expect(await page.evaluate(()=>tile._editor.offProtected)).toBe(true);
  await page.evaluate(()=>tile.closePopup());
  await expect(tileCard(page).locator('ha-control-slider')).toHaveAttribute('disabled','');
  expect(await page.evaluate(()=>calls.length)).toBe(1);
});
