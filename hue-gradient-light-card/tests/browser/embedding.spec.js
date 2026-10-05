import {test,expect} from "@playwright/test";
for(const version of ["3.4.1","2.3.4"]){
  test(`unmodified Bubble ${version} hash navigation opens embedded editor`,async({page})=>{
    const errors=[];page.on("pageerror",(e)=>errors.push(e.message));
    await page.goto(`/?bubble=${version}`,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
    await page.evaluate((version)=>{
      const view=document.createElement("hui-view");view.id="bubble-host";document.body.append(view);
      if(version==="2.3.4"){
        // Classic Bubble reparents the native stack's shadow #root. Reproduce
        // that host contract; Tile and Bubble renderer code remains original.
        const stack=document.createElement("div");view.append(stack);
        const root=document.createElement("div");root.id="root";stack.attachShadow({mode:"open"}).append(root);
        const legacyPopup=document.createElement("bubble-card");legacyPopup.setConfig({type:"custom:bubble-card",card_type:"pop-up",hash:"#living-room-gradient",entity:"light.strip",name:"Living room strip"});
        const editor=document.createElement("hue-gradient-editor");editor.setConfig({entity:"light.strip",embedded:true});
        root.append(legacyPopup,editor);legacyPopup.hass=hass;editor.hass=hass;
      }
      const popup=document.createElement("bubble-card");
      const config={type:"custom:bubble-card",card_type:"pop-up",hash:"#living-room-gradient",entity:"light.strip",name:"Living room strip"};
      if(version==="3.4.1")config.cards=[{type:"custom:hue-gradient-editor",entity:"light.strip",embedded:true}];
      if(version==="3.4.1"){popup.setConfig(config);popup.hass=hass;view.append(popup);}
      const button=makeCard("bubble-card",{type:"custom:bubble-card",card_type:"button",button_type:"switch",entity:"light.strip",
        button_action:{tap_action:{action:"navigate",navigation_path:"#living-room-gradient"}}});button.id="navigation";
      window.popup=popup;
    },version);
    await page.locator("#navigation .bubble-button-background").click();await expect(page).toHaveURL(/#living-room-gradient$/);
    const host=page.locator(".bubble-pop-up");await expect(host).toBeVisible();
    const editor=host.locator("hue-gradient-editor");await expect(editor).toBeVisible();
    await expect(editor.locator("header h2")).toHaveText("Living room strip");await expect(editor.locator(".header-icon")).toBeVisible();await expect(editor.getByRole("button",{name:"Add color",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>calls.filter(c=>c.type==="call_service"||c.domain))).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("embedded visual editor exposes all embedding options",async({page})=>{
  await page.goto("/?noBubble=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  await page.evaluate(()=>window.embeddedConfig=makeCard("hue-gradient-editor-config-editor",{type:"custom:hue-gradient-editor",entity:"light.strip"},"config"));
  await expect.poll(()=>page.evaluate(()=>embeddedConfig.shadowRoot.querySelector("ha-form")?.schema.map(s=>s.name))).toEqual(["entity","name","icon","icon_gradient_background","embedded","card_background"]);
  await page.evaluate(()=>{
    embeddedConfig.addEventListener("config-changed",(e)=>colors.setConfig(e.detail.config));
    embeddedConfig.shadowRoot.querySelector("ha-form").dispatchEvent(new CustomEvent("value-changed",{detail:{value:{entity:"light.strip",embedded:true,name:"Embedded name",icon:"mdi:led-strip"}}}));
  });
  await expect(page.locator("#editors hue-gradient-editor").first().locator("header h2")).toHaveText("Embedded name");
  expect(await page.evaluate(()=>colors.name)).toBe("Embedded name");expect(await page.evaluate(()=>calls.length)).toBe(0);
});
test("touch gesture moves a marker without removal and disconnect cancels pending writes",async({browser})=>{
  const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844}});const page=await context.newPage();
  await page.goto("/?noBubble=1",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.fixtureReady);
  const editor=page.locator("#editors hue-gradient-editor").first();
  await editor.scrollIntoViewIfNeeded();
  const point=editor.locator(".point").first(),rect=await point.boundingBox();
  const client=await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:rect.x+rect.width/2+20,y:rect.y+rect.height/2+30}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect(editor.locator(".point")).toHaveCount(4);await expect.poll(()=>page.evaluate(()=>calls.length)).toBeGreaterThan(0);
  await page.evaluate(()=>{calls.length=0;colors._colorCommand();colors.remove();});await page.waitForTimeout(200);expect(await page.evaluate(()=>calls.length)).toBe(0);
  await context.close();
});
