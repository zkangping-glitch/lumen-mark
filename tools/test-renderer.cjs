// Run with Node.js and Playwright installed: node tools/test-renderer.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.bridgeMessages = [];
      window.chrome = window.chrome || {};
      window.chrome.webview = {
        postMessage(message) { window.bridgeMessages.push(message); },
        addEventListener(type, callback) { window.receiveHost = data => callback({ data }); }
      };
    });
    await page.route('https://lumen.local/**', async route => {
      const filename = path.resolve(__dirname, '../src/app', '.' + new URL(route.request().url()).pathname);
      const ext = path.extname(filename);
      await route.fulfill({ body: await fs.readFile(filename), contentType:
        ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[ext] || 'application/octet-stream' });
    });
    await page.goto('https://lumen.local/index.html');
    await page.waitForFunction(() => window.receiveHost && window.__lm);
    await page.evaluate(() => {
      __lm.setMode('reader');
      receiveHost({ event: 'file', path: 'C:\\notes\\a.md', name: 'a.md', content:
        '# Safe\n\n<img src="missing" onerror="window.injected=true">\n\n[bad](javascript:alert(1))\n\n- [x] task\n\n```js\nconst x = 1;\n```' });
    });
    assert.equal(await page.locator('#preview img[onerror]').count(), 0);
    assert.equal(await page.locator('#preview a[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator('#preview input[type="checkbox"]:checked').count(), 1);
    assert.equal(await page.locator('#preview .hljs-keyword').count() > 0, true);
    assert.equal(await page.evaluate(() => window.injected), undefined);

    await page.evaluate(() => {
      __lm.editor.setValue('saved snapshot');
      __lm.save();
      __lm.editor.setValue('new edit after request');
      receiveHost({ event: 'saved', path: 'C:\\notes\\a.md', name: 'a.md', content: 'saved snapshot' });
    });
    assert.equal(await page.evaluate(() => __lm.state.dirty), true);
    assert.equal(await page.evaluate(() => __lm.state.savedText), 'saved snapshot');
    assert.equal(await page.evaluate(() => bridgeMessages.filter(m => m.cmd === 'setDirty').at(-1).dirty), true);
    await page.evaluate(() => {
      __lm.editor.setValue('saved snapshot');
      receiveHost({ event: 'saved', path: 'C:\\notes\\a.md', name: 'a.md', content: 'saved snapshot' });
    });
    assert.equal(await page.evaluate(() => __lm.state.dirty), false);

    await page.evaluate(() => { __lm.setMode('source'); __lm.editor.setValue('# Deferred preview'); });
    const before = await page.locator('#preview').innerHTML();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#preview').innerHTML(), before);
    await page.evaluate(() => __lm.setMode('split'));
    assert.equal(await page.locator('#preview h1').textContent(), 'Deferred preview');
    assert.deepEqual(errors, []);
    console.log('PASS: HTML isolation, safe Markdown, save snapshots, dirty notifications, deferred source preview');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
