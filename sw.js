/* REVE Office offline support (service worker).
   - The page itself (index.html) and versions.json: network first, so an
     update arrives whenever you're online; the last copy is used offline.
   - App files, icons, the web libraries and fonts: stored on first use
     (and ahead of time at install), then served from the device.
   - Floorplans and documents: stored ahead of time when the app asks
     ("warm" message with the list of files), then served from the device.
   - The shared backend (Google Apps Script) is never cached: the app
     handles offline saving itself. */
const CACHE = 'reve-office-1.168';   // follows APP_VERSION; a new version clears the old copies
const CORE = [
    './', './index.html', './suggestions.js', './versions.json', './manifest.webmanifest',
    './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
];
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const NEVER = /^https:\/\/(script\.google\.com|script\.googleusercontent\.com|[^/]*\.googleapis\.com\/(drive|upload))/;

function req(url) { return CDN.test(url) ? new Request(url, { mode: 'no-cors' }) : new Request(url, { cache: 'reload' }); }

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(req(u)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('reve-office-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
    if (e.data === 'skipWaiting') return self.skipWaiting();
    if (e.data && e.data.type === 'warm') e.waitUntil(warm(e.data.urls || [], e.source));
    if (e.data && e.data.type === 'status') e.waitUntil(status(e.data.urls || [], e.source));
});
async function status(urls, client) {
    const c = await caches.open(CACHE);
    let have = 0;
    for (const u of urls) if (await c.match(u, { ignoreSearch: true })) have++;
    if (client) client.postMessage({ type: 'offline-status', have, total: urls.length });
}
// Store the given files on the device, a few at a time; report progress.
async function warm(urls, client) {
    const c = await caches.open(CACHE);
    let done = 0, failed = 0, i = 0;
    const todo = [];
    for (const u of urls) { if (!(await c.match(u, { ignoreSearch: true }))) todo.push(u); else done++; }
    const total = urls.length;
    const report = fin => client && client.postMessage({ type: 'warm-progress', done, failed, total, finished: !!fin });
    report(false);
    async function worker() {
        while (i < todo.length) {
            const u = todo[i++];
            try { const r = await fetch(req(u)); if (r.ok || r.type === 'opaque') { await c.put(u, r); done++; } else failed++; } catch (err) { failed++; }
            if ((done + failed) % 5 === 0) report(false);
        }
    }
    await Promise.all([worker(), worker(), worker()]);
    report(true);
}
self.addEventListener('fetch', e => {
    const r = e.request;
    if (r.method !== 'GET' || NEVER.test(r.url)) return;
    const url = new URL(r.url);
    const same = url.origin === self.location.origin;
    // The page and the version list: network first, device copy offline.
    if (r.mode === 'navigate' || (same && /\/(index\.html)?$/.test(url.pathname)) || (same && url.pathname.endsWith('/versions.json'))) {
        const key = r.mode === 'navigate' ? './index.html' : (url.pathname.endsWith('/versions.json') ? './versions.json' : './index.html');
        e.respondWith((async () => {
            const c = await caches.open(CACHE);
            try {
                const net = await fetch(r.mode === 'navigate' ? new Request(url.origin + url.pathname, { cache: 'no-store' }) : r);
                if (net.ok) c.put(key, net.clone());
                return net;
            } catch (err) {
                return (await c.match(key)) || (await c.match('./')) || Response.error();
            }
        })());
        return;
    }
    if (!same && !CDN.test(r.url)) return;
    // App code from this site: the device copy now, refreshed in the background.
    if (same && /\.(js|json|webmanifest|css)$/.test(url.pathname)) {
        e.respondWith((async () => {
            const c = await caches.open(CACHE);
            const hit = await c.match(r, { ignoreSearch: true });
            const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
            if (hit) { e.waitUntil(net); return hit; }
            return (await net) || Response.error();
        })());
        return;
    }
    // Images, PDFs and the libraries: device first, then network (and keep it).
    e.respondWith((async () => {
        const c = await caches.open(CACHE);
        const hit = await c.match(r, { ignoreSearch: same });
        if (hit) return hit;
        try {
            const net = await fetch(r);
            if (net.ok || net.type === 'opaque') c.put(r, net.clone());
            return net;
        } catch (err) {
            return Response.error();
        }
    })());
});
