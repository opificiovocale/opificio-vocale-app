const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = 'http://127.0.0.1:8080/';
const output = path.join(process.cwd(), 'test-artifacts');
fs.mkdirSync(output, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const sizes = [
    { name: 'iphone', width: 390, height: 844 },
    { name: 'ipad', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 }
  ];
  try {
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#home-title').waitFor({ timeout: 15000 });
      assert.match(await page.locator('#home-title').innerText(), /La tua voce/);
      await page.locator('.voice-hero').waitFor({ state: 'visible', timeout: 15000 });
      const metrics = await page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        content: document.querySelector('#app').scrollWidth,
        shell: document.querySelector('.app-shell').getBoundingClientRect().width,
        hero: document.querySelector('.voice-hero').getBoundingClientRect().width
      }));
      console.log(size.name + ' sizing ' + JSON.stringify(metrics));
      assert.ok(metrics.scroll <= metrics.inner + 2, size.name + ' has horizontal overflow: ' + JSON.stringify(metrics));
      assert.ok(await page.locator('[data-check-start]').isVisible(), 'Home check-in CTA should be visible');
      await page.locator('[data-check-start]').click();
      assert.ok(await page.locator('[data-check-step="0"]').isVisible(), 'Step 1 should show');
      await page.locator('[data-voice-word]').first().click();
      await page.locator('[data-check-next]').click();
      assert.ok(await page.locator('[data-check-step="1"]').isVisible(), 'Step 2 should show');
      await page.locator('[data-voice-location="gola"]').click();
      await page.locator('[data-voice-location="petto"]').click();
      await page.locator('.voice-additional-observations summary').click();
      await page.locator('[data-voice-facet="body"][data-voice-value="comoda"]').click();
      await page.locator('[data-check-next]').click();
      assert.ok(await page.locator('[data-check-step="2"]').isVisible(), 'Step 3 should show');
      await page.locator('input[name="voiceIntent"][value="explore"]').check();
      await page.locator('[data-check-back]').click();
      assert.ok(await page.locator('[data-check-step="1"]').isVisible(), 'Back should work');
      await page.locator('[data-check-next]').click();
      await page.locator('.check-submit').click();
      assert.ok(await page.locator('[data-check-complete]').isVisible(), 'Check-in saved');
      assert.ok(await page.locator('#voiceReflection .reflection-summary').isVisible(), 'Reflection contains observations');
      const entry = await page.evaluate(() => JSON.parse(localStorage.getItem('opificio-voice-diary-v1'))?.[0]);
      assert.equal(entry.facets.body, 'comoda');
      assert.deepEqual(entry.locations, ['gola','petto']);
      assert.equal(entry.intent, 'explore');
      try {
        await page.screenshot({ path: path.join(output, size.name + '-result.png'), fullPage: false, animations: 'disabled', timeout: 8000 });
      } catch (err) { console.warn(size.name + ' result screenshot warning: ' + err.message); }
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.ok(await page.locator('[data-check-complete]').isVisible(), 'Saved data should survive reload');
      await page.locator('[data-check-edit]').click();
      assert.ok(await page.locator('[data-check-step="0"]').isVisible(), 'Editing starts at first step');
      await page.locator('[data-check-next]').click();
      assert.equal(await page.locator('[data-voice-location="gola"]').getAttribute('aria-pressed'), 'true', 'Selected location should reload');
      await page.locator('.voice-additional-observations summary').click();
      assert.equal(await page.locator('[data-voice-facet="body"][data-voice-value="comoda"]').getAttribute('aria-pressed'), 'true', 'Selected facet should reload');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(300);
      try {
        await page.screenshot({ path: path.join(output, size.name + '-top.png'), fullPage: false, animations: 'disabled', timeout: 8000 });
      } catch (err) { console.warn(size.name + ' top screenshot warning: ' + err.message); }
      assert.deepEqual(errors, [], 'Unexpected JS errors: ' + JSON.stringify(errors));
      console.log('PASS ' + size.name + ' guided check-in, persistence and re-edit');
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(baseUrl, {waitUntil:'domcontentloaded'});
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    await page.evaluate(day => localStorage.setItem('opificio-voice-diary-v1', JSON.stringify([{date:day, words:['tesa'], note:'Vecchia nota', intent:'listen', updatedAt:new Date().toISOString()}])), yesterday);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.voice-diary summary').waitFor({ state: 'visible', timeout: 15000 });
    assert.ok(await page.locator('.voice-diary').isVisible(), 'Legacy diary should still appear');
    await page.locator('.voice-diary summary').click();
    assert.ok((await page.locator('.voice-diary').innerText()).includes('Vecchia nota'));
    await page.locator('.voice-diary summary').click();
    await page.locator('[data-check-start]').click();
    await page.locator('[data-voice-word]').first().click();
    await page.locator('[data-check-next]').click();
    await page.locator('[data-check-next]').click();
    await page.locator('.check-submit').click();
    assert.ok(await page.locator('.reflection-previous').isVisible(), 'Old entries should be part of comparison');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-diary-export]').click()]);
    assert.match(download.suggestedFilename(), /diario-della-voce/);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('opificio-voice-diary-v1')))).length, 2, 'Old and new entries retained');
    await context.close();
    console.log('PASS legacy journal, comparisons and export');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
