import {test,expect} from "@playwright/test";

for(const version of ["3.4.1","2.3.4"])for(const width of [1200,390])test(`off cards hide brightness and restore it when on, Bubble ${version} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.goto(`/?bubble=${version}&noEcho=1`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.fixtureReady);
  await expect(page).toHaveTitle("Hue Gradient Card compatibility fixture");
  const cards=page.locator("#cards hue-gradient-light-card");
  const subtitles=[cards.first().locator("ha-tile-info"),cards.last().locator(".bubble-state")];
  for(const subtitle of subtitles)await expect(subtitle).toContainText("70%");
  const report=async(state,brightness=178)=>page.evaluate(({state,brightness})=>{
    const light=hass.states["light.strip"];
    updateHass({states:{...hass.states,"light.strip":{...light,state,attributes:{...light.attributes,brightness}}}});
  },{state,brightness});
  for(const brightness of [178,0,null]){
    await report("off",brightness);
    for(const subtitle of subtitles){
      await expect(subtitle).toContainText("Off");
      await expect(subtitle).not.toContainText("%");
    }
    expect(await page.evaluate(()=>hass.states["light.strip"].attributes.brightness)).toBe(brightness);
    await report("on");
    for(const subtitle of subtitles)await expect(subtitle).toContainText("70%");
  }
  await report("on",0);
  await expect(subtitles[1]).toContainText("0%");
  await page.evaluate(()=>{
    for(const card of [tile,bubble])card.setConfig({...card._config,state_content:["brightness"]});
  });
  await report("off");
  await expect(cards.first().locator("ha-tile-info .secondary")).toBeHidden();
  await expect(cards.last().locator(".bubble-state")).toBeHidden();
  await report("on");
  for(const subtitle of subtitles)await expect(subtitle).toContainText("70%");
  expect(await page.evaluate(()=>calls)).toEqual([]);
  expect(errors).toEqual([]);
});
