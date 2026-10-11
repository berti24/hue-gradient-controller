import { test, expect } from "@playwright/test";

async function ready(page, query = "noEcho=1") {
  await page.goto(`/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(() => {
    colors.id = "safety-editor";
    for (const element of document.body.children) {
      if (element.id !== "editors") element.style.display = "none";
    }
    whites.style.display = "none";
    document.body.style.margin = "24px";
    document.body.style.paddingBottom = "1000px";
  });
  return page.locator("#safety-editor");
}

async function finger(page) {
  const session = await page.context().newCDPSession(page);
  const send = (type, x, y) => session.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }],
  });
  return { send, close: () => session.detach() };
}

test("opt-in Off mode disables edits until reported on, while power remains usable", async ({ page }) => {
  const editor = await ready(page);
  const before = await page.evaluate(() => colors.points);
  await page.evaluate(() => {
    colors.setConfig({ entity: "light.strip", protect_when_off: true });
    updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } });
  });
  await expect(editor.getByRole("slider", { name: "Brightness", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Add color", exact: true })).toBeDisabled();
  await expect(editor.locator(".point").first()).toBeDisabled();
  await expect(editor.getByRole("combobox", { name: "Gradient mode" })).toBeDisabled();
  await editor.getByRole("button", { name: "Turn on", exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => calls.at(-1)?.service)).toBe("turn_on");
  await expect(editor.locator(".point").first()).toBeDisabled();
  expect(await page.evaluate(() => colors.points)).toEqual(before);
  await page.evaluate(() => updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "on" } } }));
  await expect(editor.locator(".point").first()).toBeEnabled();
});

test("visual protection option reaches the popup and the standalone config editor", async ({ page }) => {
  await page.goto("/?noEcho=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.fixtureReady);
  await page.locator("#config").getByRole("heading",{name:"Interactions",exact:true}).click();
  await page.locator("#config").getByLabel("Protect while off", { exact: true }).click();
  await page.evaluate(() => {
    tile.openPopup();
    window.embeddedConfig = makeCard("hue-gradient-editor-config-editor", { entity: "light.strip", embedded: true }, "config");
    embeddedConfig.addEventListener("config-changed", event => { window.savedEmbedded = event.detail.config; });
    updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } });
  });
  await expect(page.locator("dialog .point").first()).toBeDisabled();
  expect(await page.evaluate(() => tile._editor._config.protect_when_off)).toBe(true);
  await page.evaluate(() => tile.setConfig({ ...tile._config, protect_when_off: false }));
  await expect(page.locator("dialog .point").first()).toBeEnabled();
  await page.getByRole("button", { name: "Close gradient editor" }).click();
  await page.locator("hue-gradient-editor-config-editor").getByRole("heading",{name:"Interactions",exact:true}).click();
  await page.locator("hue-gradient-editor-config-editor").getByLabel("Protect while off", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.savedEmbedded?.protect_when_off)).toBe(true);
  expect(await page.evaluate(() => calls)).toEqual([]);
});

test("default editors retain edit-to-turn-on and embedded protection exposes power", async ({ page }) => {
  const editor = await ready(page);
  await page.evaluate(() => updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } }));
  await expect(editor.locator(".point").first()).toBeEnabled();
  await editor.getByRole("button", { name: "Add color", exact: true }).click();
  await expect.poll(() => page.evaluate(() => calls.at(-1)?.data.turn_on)).toBe(true);
  await page.evaluate(() => colors.setConfig({ entity: "light.strip", embedded: true, protect_when_off: true }));
  await expect(editor.locator("header h2")).toHaveText("Living room strip");
  await expect(editor.locator(".point").first()).toBeDisabled();
  await editor.getByRole("button", { name: "Turn on", exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => calls.at(-1)?.service)).toBe("turn_on");
  await expect(editor.locator(".point").first()).toBeDisabled();
});

test("Turn off cancels coalesced edits immediately and rejected power restores usability", async ({ page }) => {
  const editor = await ready(page);
  const before = await page.evaluate(() => colors.points);
  await page.evaluate(() => {
    colors.setConfig({ entity: "light.strip", protect_when_off: true });
    colors._pointKey({ key: "ArrowRight", preventDefault() {} }, 0);
    colors._power();
    colors._add();
  });
  await expect(editor.locator(".point").first()).toBeDisabled();
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => calls.map(call => call.service))).toEqual(["turn_off"]);
  expect(await page.evaluate(() => colors.points)).toEqual(before);
  // A delayed on-state attribute update cannot unlock an unconfirmed off request.
  await page.evaluate(() => updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], attributes: { ...hass.states["light.strip"].attributes, brightness: 180 } } } }));
  await expect(editor.locator(".point").first()).toBeDisabled();
  await page.evaluate(() => {
    colors._powerIntent = undefined;
    window.rejectNext = true;
    colors._power();
  });
  await expect(editor.getByRole("alert")).toContainText("Backend rejected");
  await expect(editor.locator(".point").first()).toBeEnabled();
  await page.evaluate(() => {
    colors._power();
    colors.setConfig({ entity: "light.strip", protect_when_off: false });
  });
  await expect(editor.locator(".point").first()).toBeEnabled();
  expect(await page.evaluate(() => colors._powerIntent)).toBe(undefined);
});

test("reported off cancels edits waiting behind another card's accepted request", async ({ page }) => {
  const editor = await ready(page);
  await page.evaluate(() => {
    const original = hass.callService;
    hass.callService = async (...args) => {
      await original(...args);
      if (!window.releaseWrite) await new Promise(resolve => { window.releaseWrite = resolve; });
    };
    colors.setConfig({ entity: "light.strip", protect_when_off: true });
    whites._add();
  });
  await page.waitForFunction(() => Boolean(window.releaseWrite));
  await editor.getByRole("button", { name: "Add color", exact: true }).click();
  await page.evaluate(() => {
    updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } });
    window.releaseWrite();
  });
  await page.waitForFunction(() => !colors._writer.busy);
  expect(await page.evaluate(() => calls.map(call => call.service))).toEqual(["set_gradient"]);
  await expect(editor.locator(".point")).toHaveCount(4);
  await expect(editor.locator(".point").first()).toBeDisabled();
});

test("Off mode blocks restore and Kelvin edits and preserves the last ordinary palette", async ({ page }) => {
  const editor = await ready(page);
  await page.evaluate(() => colors.setConfig({ entity: "light.strip", protect_when_off: true }));
  await editor.locator("summary").click();
  await editor.getByRole("button", { name: "Snapshot", exact: true }).click();
  await page.evaluate(() => updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } }));
  await expect(editor.getByRole("button", { name: "Restore", exact: true })).toBeDisabled();
  const count = await page.evaluate(() => calls.length);
  await page.evaluate(() => colors._advanced("restore"));
  expect(await page.evaluate(() => calls.length)).toBe(count);
  await page.evaluate(() => {
    hass.states["light.basic"] = { entity_id: "light.basic", state: "on", attributes: {
      supported_color_modes: ["rgb", "color_temp"], rgb_color: [10, 20, 255], brightness: 150,
      min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000,
    } };
    colors.setConfig({ entity: "light.basic", protect_when_off: true });
    updateHass();
    updateHass({ states: { ...hass.states, "light.basic": { ...hass.states["light.basic"], state: "off", attributes: {
      ...hass.states["light.basic"].attributes, rgb_color: null, brightness: null,
    } } } });
    colors._temperatureInput({ target: { value: "4500" } });
    colors._brightnessInput({ target: { value: "50" } });
    colors._pointKey({ key: "ArrowRight", preventDefault() {} }, 0);
  });
  expect(await page.evaluate(() => colors.points)).toEqual([[10, 20, 255]]);
  await expect(editor.getByRole("slider", { name: "White temperature in Kelvin" })).toBeDisabled();
  await expect(editor.getByRole("slider", { name: "Brightness", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => calls.length)).toBe(count);
});

test("restore queued behind another card rechecks Off protection before dispatch", async ({ page }) => {
  const editor = await ready(page);
  await page.evaluate(() => colors.setConfig({ entity: "light.strip", protect_when_off: true }));
  await editor.locator("summary").click();
  await editor.getByRole("button", { name: "Snapshot", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = hass.callService;
    hass.callService = async (...args) => {
      await original(...args);
      if (!window.releaseWrite) await new Promise(resolve => { window.releaseWrite = resolve; });
    };
    whites._add();
  });
  await page.waitForFunction(() => Boolean(window.releaseWrite));
  await page.evaluate(() => { colors._advanced("restore"); });
  await page.waitForFunction(() => colors._busyAction);
  await page.evaluate(() => {
    updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } });
    window.releaseWrite();
  });
  await page.waitForFunction(() => !colors._busyAction);
  expect(await page.evaluate(() => calls.some(call => call.service === "restore_gradient"))).toBe(false);
});

test("zero brightness locks immediately and cannot be followed by a color edit", async ({ page }) => {
  const editor = await ready(page);
  await page.evaluate(() => {
    colors.setConfig({ entity: "light.strip", protect_when_off: true });
    colors._brightnessInput({ target: { value: "0" } });
    colors._add();
  });
  await expect(editor.locator(".point").first()).toBeDisabled();
  await expect.poll(() => page.evaluate(() => calls.map(call => call.service))).toEqual(["turn_off"]);
  await expect(editor.getByRole("slider", { name: "Brightness", exact: true })).toHaveValue("0");
});

test.describe("mobile gesture safety", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });

  for (const startOnPoint of [false, true]) test(`a swipe starting on ${startOnPoint ? "the selected X" : "the wheel"} scrolls without edits`, async ({ page }) => {
    const editor = await ready(page);
    const before = await page.evaluate(() => colors.points);
    const box = await editor.locator(startOnPoint ? ".point.selected" : ".wheel").boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const touch = await finger(page);
    await touch.send("touchStart", x, y);
    for (let i = 1; i <= 8; i++) {
      await touch.send("touchMove", x, y - i * 12);
      await page.waitForTimeout(16);
    }
    await touch.send("touchEnd");
    expect(await page.evaluate(() => colors.points)).toEqual(before);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
    await touch.close();
  });

  for (const startOnPoint of [false, true]) test(`holding ${startOnPoint ? "a point" : "the background"} arms a drag without scrolling or deletion`, async ({ page }) => {
    const editor = await ready(page);
    const box = await editor.locator(startOnPoint ? ".point.selected" : ".wheel").boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const touch = await finger(page);
    await touch.send("touchStart", x, y);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await expect(editor.locator(".wheel")).toHaveClass(/touch-ready/);
    await expect(editor.locator(".touch-hint")).toHaveText("Ready to drag");
    await touch.send("touchMove", x + 20, y + 50);
    await touch.send("touchMove", x + 25, y + 65);
    await touch.send("touchEnd");
    await expect.poll(() => page.evaluate(() => calls.at(-1)?.data.colors)).toEqual(await page.evaluate(() => colors.points));
    await expect(editor.locator(".point")).toHaveCount(4);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(editor.locator(".wheel")).not.toHaveClass(/touch-ready/);
    await touch.close();
  });

  test("short background taps are read-only; point taps select and the selected X deletes", async ({ page }) => {
    const editor = await ready(page);
    const before = await page.evaluate(() => colors.points);
    await editor.locator(".wheel").tap({ position: { x: 150, y: 150 } });
    expect(await page.evaluate(() => colors.points)).toEqual(before);
    await editor.locator(".point").nth(1).tap();
    expect(await page.evaluate(() => colors._selected)).toBe(1);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await editor.locator(".point.selected").tap();
    await expect(editor.locator(".point")).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => calls.length)).toBe(1);
  });

  test("holding the selected X without dragging does not delete or write", async ({ page }) => {
    const editor = await ready(page);
    const box = await editor.locator(".point.selected").boundingBox();
    const touch = await finger(page);
    await touch.send("touchStart", box.x + box.width / 2, box.y + box.height / 2);
    await expect(editor.locator(".wheel")).toHaveClass(/touch-ready/);
    await touch.send("touchEnd");
    await expect(editor.locator(".point")).toHaveCount(4);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await touch.close();
  });

  test("closing before the hold completes cancels its timer", async ({ page }) => {
    const editor = await ready(page);
    const box = await editor.locator(".wheel").boundingBox();
    const touch = await finger(page);
    await touch.send("touchStart", box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => colors.remove());
    await page.waitForTimeout(500);
    await touch.send("touchEnd");
    expect(await page.evaluate(() => calls)).toEqual([]);
    expect(await page.evaluate(() => colors._touchReady)).toBe(false);
    await touch.close();
  });

  test("reported off cancels an armed touch gesture before it writes", async ({ page }) => {
    const editor = await ready(page);
    await page.evaluate(() => colors.setConfig({ entity: "light.strip", protect_when_off: true }));
    const before = await page.evaluate(() => colors.points);
    const box = await editor.locator(".point.selected").boundingBox();
    const touch = await finger(page);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await touch.send("touchStart", x, y);
    await expect(editor.locator(".wheel")).toHaveClass(/touch-ready/);
    await page.evaluate(() => updateHass({ states: { ...hass.states, "light.strip": { ...hass.states["light.strip"], state: "off" } } }));
    await touch.send("touchMove", x + 20, y + 30);
    await touch.send("touchEnd");
    expect(await page.evaluate(() => colors.points)).toEqual(before);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await expect(editor.locator(".wheel")).not.toHaveClass(/touch-ready/);
    await touch.close();
  });

  test("a swipe inside the card popup scrolls the dialog without edits", async ({ page }) => {
    await ready(page);
    await page.setViewportSize({ width: 390, height: 480 });
    await page.evaluate(() => { document.getElementById("cards").style.display = ""; tile.openPopup(); });
    await expect(page.locator("dialog .wheel")).toBeVisible();
    const wheel = await page.locator("dialog .wheel").boundingBox();
    const touch = await finger(page);
    const x = wheel.x + wheel.width / 2, y = wheel.y + wheel.height / 2;
    await touch.send("touchStart", x, y);
    for (let i = 1; i <= 8; i++) {
      await touch.send("touchMove", x, y - i * 10);
      await page.waitForTimeout(16);
    }
    await touch.send("touchEnd");
    await expect.poll(() => page.locator("dialog").evaluate(dialog => dialog.scrollTop)).toBeGreaterThan(20);
    expect(await page.evaluate(() => calls)).toEqual([]);
    await touch.close();
  });
});
