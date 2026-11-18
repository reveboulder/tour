// Unit tests for suggestions.js. Run: node --test tests/suggestions.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../suggestions.js');

function memoryStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
// A clock that moves forward one minute per call.
function clock(start = '2026-11-18T15:00:00.000Z') {
    let t = new Date(start).getTime();
    return () => { const d = new Date(t); t += 60000; return d; };
}

test('add keeps suggestions newest first and ignores blank text', () => {
    const store = S.createStore(memoryStorage(), { now: clock() });
    const a = store.add('First idea');
    const b = store.add('  Second idea  ');
    assert.equal(store.add('   '), null);
    assert.deepEqual(store.list().map(s => s.id), [b.id, a.id]);
    assert.equal(b.text, 'Second idea');
    assert.equal(a.copied, false);
});

test('suggestions survive a reload from the same storage', () => {
    const storage = memoryStorage();
    const store = S.createStore(storage, { now: clock() });
    store.add('Keep me');
    const again = S.createStore(storage);
    assert.deepEqual(again.list().map(s => s.text), ['Keep me']);
});

test('remove deletes one suggestion and reports unknown ids', () => {
    const store = S.createStore(memoryStorage(), { now: clock() });
    const a = store.add('A');
    store.add('B');
    assert.equal(store.remove(a.id), true);
    assert.equal(store.remove('nope'), false);
    assert.deepEqual(store.list().map(s => s.text), ['B']);
});

test('formatMarkdown writes the exact file format', () => {
    const items = [
        { id: 's2', text: 'Line one\nline two\r\nline three', created: '2026-11-18T12:00:00' },
        { id: 's1', text: 'Plain idea', created: '2026-11-17T09:30:00' }
    ];
    assert.equal(S.formatMarkdown('REVE Office', items, '2026-11-18T20:00:00.000Z'),
        '# REVE Office: suggested improvements\n' +
        'Updated 2026-11-18T20:00:00.000Z.\n' +
        '- [ ] 2026-11-18 (s2): Line one / line two / line three\n' +
        '- [ ] 2026-11-17 (s1): Plain idea\n');
    assert.equal(S.formatMarkdown('X', [], 'T'), '# X: suggested improvements\nUpdated T.\n');
});

test('needsCopy tracks new suggestions and deletions since the last copy', () => {
    const store = S.createStore(memoryStorage(), { now: clock() });
    assert.equal(store.needsCopy(), false);
    const a = store.add('A');
    assert.equal(store.needsCopy(), true);
    store.markCopied(store.rev(), [a.id]);
    assert.equal(store.needsCopy(), false);
    assert.equal(store.list()[0].copied, true);
    store.remove(a.id);                        // deleting a copied one -> file must be rewritten
    assert.equal(store.needsCopy(), true);
    store.markCopied(store.rev(), []);
    assert.equal(store.needsCopy(), false);
    const b = store.add('B');
    store.remove(b.id);                        // never copied: nothing to rewrite
    assert.equal(store.needsCopy(), false);
});

test('a copy that finishes after a newer change does not clear it', () => {
    const store = S.createStore(memoryStorage(), { now: clock() });
    const a = store.add('A');
    store.markCopied(store.rev(), [a.id]);
    const rev = store.rev();
    store.remove(a.id);
    store.markCopied(rev, []);                 // stale copy from before the delete
    assert.equal(store.needsCopy(), true);
});

test('syncer copies the whole list and reports offline / not connected / errors', async () => {
    const store = S.createStore(memoryStorage(), { now: clock() });
    let online = true, why = '', sent = [], reply = { ok: true };
    const syncer = S.createSyncer({ store, appName: 'App', isOnline: () => online, connection: () => why,
        send: md => { sent.push(md); return Promise.resolve(reply); }, now: () => new Date('2026-11-18T00:00:00Z') });

    assert.equal((await syncer.sync()).state, 'ok');            // nothing to copy
    assert.equal(sent.length, 0);
    store.add('One'); store.add('Two');
    online = false;
    assert.equal((await syncer.sync()).state, 'offline');
    online = true; why = 'add the backend URL in Settings.';
    const nc = await syncer.sync();
    assert.equal(nc.state, 'not-connected');
    assert.match(nc.message, /^Not connected — add the backend URL/);
    why = ''; reply = { ok: false, error: 'boom' };
    assert.equal((await syncer.sync()).state, 'error');
    assert.equal(store.needsCopy(), true);
    reply = { ok: false, notConnected: true, error: 'script needs the update' };
    assert.equal((await syncer.sync()).state, 'not-connected');
    reply = { ok: true };
    assert.equal((await syncer.sync()).state, 'ok');
    assert.equal(store.needsCopy(), false);
    const last = sent[sent.length - 1];
    assert.match(last, /^# App: suggested improvements\nUpdated 2026-11-18T00:00:00.000Z.\n- \[ \] \d{4}-\d{2}-\d{2} \(s\w+\): Two\n- \[ \] .*: One\n$/);
    reply = Promise.reject(new Error('network down'));
    store.add('Three');
    const err = await syncer.sync();
    assert.equal(err.state, 'error');
    assert.match(err.message, /network down/);
});
