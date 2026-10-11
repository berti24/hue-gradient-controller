import { test, expect } from "@playwright/test";

async function ready(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?noEcho=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(() => colors.id = "lifecycle-editor");
  return errors;
}

for (const inFlight of [false, true]) test(`reconnect restores reported colors after an ${inFlight ? "in-flight" : "unconfirmed"} write`, async ({ page }) => {
  const errors = await ready(page);
  const editor = page.locator("#lifecycle-editor");
  if (inFlight) await page.evaluate(() => {
    const original = hass.callService;
    hass.callService = async (...args) => {
      await original(...args);
      await new Promise(resolve => window.releaseWrite = resolve);
    };
  });
  await editor.getByRole("button", { name: "Add color", exact: true }).click();
  await expect(editor.locator(".point")).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => calls.length)).toBe(1);
  if (inFlight) await page.waitForFunction(() => Boolean(window.releaseWrite));
  else await page.waitForFunction(() => !colors._writer.busy);
  await page.evaluate(() => {
    const parent = colors.parentElement;
    colors.remove();
    parent.append(colors);
    colors.hass = hass;
    window.releaseWrite?.();
  });
  await expect(editor.locator(".point")).toHaveCount(4);
  expect(await page.evaluate(() => colors.points)).toEqual(await page.evaluate(() => hass.states["light.strip"].attributes.gradient_colors_rgb));
  expect(await page.evaluate(() => Boolean(colors._optimistic))).toBe(false);
  expect(await page.evaluate(() => calls.length)).toBe(1);
  expect(errors).toEqual([]);
});

test("Kelvin keeps the latest local value through intermediate echoes, then reconciles and recovers from rejection", async ({ page }) => {
  const errors = await ready(page);
  const editor = page.locator("#lifecycle-editor");
  await page.evaluate(() => {
    hass.states["light.basic"] = { entity_id: "light.basic", state: "on", attributes: {
      supported_color_modes: ["color_temp"], color_mode: "color_temp", brightness: 150,
      min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000,
    } };
    colors.setConfig({ entity: "light.basic" });
    updateHass();
  });
  const kelvin = editor.getByRole("slider", { name: "White temperature in Kelvin" });
  await expect(kelvin).toHaveValue("3000");
  await kelvin.fill("3500");
  await kelvin.dispatchEvent("change");
  await expect.poll(() => page.evaluate(() => calls.at(-1)?.data.color_temp_kelvin)).toBe(3500);
  await kelvin.fill("5000");
  await kelvin.dispatchEvent("change");
  await expect.poll(() => page.evaluate(() => calls.at(-1)?.data.color_temp_kelvin)).toBe(5000);
  await page.evaluate(() => {
    const state = hass.states["light.basic"];
    updateHass({ states: { ...hass.states, "light.basic": { ...state, attributes: { ...state.attributes, color_temp_kelvin: 3500 } } } });
  });
  await expect(kelvin).toHaveValue("5000");
  // A response-less call can be skipped; the latest reported state still wins.
  await expect(kelvin).toHaveValue("3500", { timeout: 4000 });
  await page.evaluate(() => window.rejectNext = true);
  await kelvin.fill("5500");
  await kelvin.dispatchEvent("change");
  await expect(editor.getByRole("alert")).toContainText("Backend rejected");
  await expect(kelvin).toHaveValue("3500");
  expect(await page.evaluate(() => calls.every(call => call.domain === "light" && call.service === "turn_on" && call.target.entity_id === "light.basic"))).toBe(true);
  expect(errors).toEqual([]);
});
