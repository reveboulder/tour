// End-to-end test for Help › Suggest Improvements (Playwright + Chromium).
// Run from the repo root:  node tests/e2e/suggestions.e2e.js
// Needs the `playwright` package (set PLAYWRIGHT_PATH to its folder if it isn't
// installed locally). CDN libraries are blocked unless LIB_DIR points at a
// node_modules folder holding xlsx / jszip copies. No real backend or
// credentials are used: the copy target is a stand-in answered in-test.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
const STAND_IN_BACKEND = 'https://backend.example.invalid/exec';

function serve() {
    const server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
    const server = await serve();
    const base = `http://127.0.0.1:${server.address().port}/index.html`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const errors = [];
    let driveFile = null, posts = 0;
    try {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
        await ctx.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith(STAND_IN_BACKEND)) {
                if (route.request().method() === 'POST') {
                    const body = JSON.parse(route.request().postData() || '{}');
                    if (body.action === 'saveSuggestions') { posts++; driveFile = body.markdown; return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
                    return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
                }
                return route.fulfill({ contentType: 'application/json', body: '{"value":null}' });
            }
            const lib = process.env.LIB_DIR && (/xlsx\.full\.min\.js/.test(url) ? 'xlsx/dist/xlsx.full.min.js' : /jszip\.min\.js/.test(url) ? 'jszip/dist/jszip.min.js' : null);
            if (lib) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.LIB_DIR, lib)) });
            return url.startsWith(base.replace('/index.html', '')) ? route.continue() : route.abort();
        });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        // Help › Suggest Improvements
        const openSection = async () => {
            await page.evaluate(() => switchTab('howto'));
            await page.click('#helpSubtabs [data-help-sub="suggest"]');
        };
        const texts = () => page.$$eval('#suggList .sugg-item-text', els => els.map(e => e.textContent));
        const save = async t => { await page.fill('#suggText', t); await page.click('#suggSaveBtn'); };

        await page.goto(base);
        await openSection();
        await save('First idea');
        await page.waitForTimeout(20);
        await save('Second idea\nwith two lines');
        assert.deepEqual(await texts(), ['Second idea\nwith two lines', 'First idea'], 'newest first');
        assert.match(await page.textContent('#suggList'), /Not copied yet/);

        // No backend set up: "not connected", and where to connect.
        await page.waitForFunction(() => /Not connected/.test(document.getElementById('suggStatus').textContent));
        assert.match(await page.textContent('#suggStatus'), /Settings › Shared Backend/);

        // Survives a reload.
        await page.reload();
        await openSection();
        assert.deepEqual(await texts(), ['Second idea\nwith two lines', 'First idea'], 'after reload');

        // Delete one (confirm in the app's dialog).
        await page.click('#suggList .sugg-item:last-child [data-sugg-del]');
        await page.click('.door-dialog button[type=submit]');
        assert.deepEqual(await texts(), ['Second idea\nwith two lines'], 'after delete');

        // With a copy target: the whole list is written and marked copied.
        await page.evaluate(url => { localStorage.setItem('reve-backend-url', url); }, STAND_IN_BACKEND);
        await page.reload();
        await openSection();
        await page.waitForFunction(() => /All copied/.test(document.getElementById('suggStatus').textContent));
        assert.match(driveFile, /^# REVE Office: suggested improvements\nUpdated \d{4}-\d{2}-\d{2}T[\d:.]+Z\.\n- \[ \] \d{4}-\d{2}-\d{2} \(s\w+\): Second idea \/ with two lines\n$/);
        assert.match(await page.textContent('#suggList'), /Copied/);
        const before = posts;
        await page.click('#helpSubtabs [data-help-sub="howto"]'); await page.click('#helpSubtabs [data-help-sub="suggest"]');   // reopening with nothing new: no copy
        await page.waitForTimeout(200);
        assert.equal(posts, before, 'nothing re-copied when already up to date');

        // Offline: saved locally with an "Offline" status, copied when back online.
        await ctx.setOffline(true);
        await save('Idea while offline');
        await page.waitForFunction(() => /Offline/.test(document.getElementById('suggStatus').textContent));
        assert.match(await page.textContent('#suggList'), /Not copied yet/);
        await ctx.setOffline(false);
        await page.waitForFunction(() => /All copied/.test(document.getElementById('suggStatus').textContent));
        assert.match(driveFile, /\): Idea while offline\n- \[ \] .*\): Second idea/);

        assert.deepEqual(errors, [], 'no page errors');
        console.log('suggestions e2e: all checks passed');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(err => { console.error(err); process.exit(1); });
