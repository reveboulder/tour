/* Suggest Improvements: storage, file format and copy tracking.
   No screen code here, so it can be unit tested in Node (tests/suggestions.test.js).
   - createStore(storage): suggestions kept in localStorage (works offline).
   - formatMarkdown(appName, items, isoNow): the plain-text file Claude Code reads.
   - createSyncer(...): copies the whole list when something still needs copying. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Suggestions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function pad(n) { return String(n).padStart(2, '0'); }
    // Local calendar date of an ISO timestamp, as YYYY-MM-DD.
    function dayOf(iso) {
        var d = new Date(iso);
        return isNaN(d) ? String(iso || '').slice(0, 10) : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function newId(now) {
        return 's' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* State: { items: [{ id, text, created, copied }], deletedSinceCopy, rev }.
       rev goes up on every change, so a copy that finishes after a newer
       change doesn't mark that change as copied. */
    function createStore(storage, opts) {
        opts = opts || {};
        var key = opts.key || 'reve-suggestions';
        var now = opts.now || function () { return new Date(); };
        var state = { items: [], deletedSinceCopy: false, rev: 0 };
        try {
            var raw = storage && storage.getItem(key);
            var saved = raw ? JSON.parse(raw) : null;
            if (saved && Array.isArray(saved.items)) {
                state.items = saved.items.filter(function (s) { return s && s.id && typeof s.text === 'string'; });
                state.deletedSinceCopy = !!saved.deletedSinceCopy;
                state.rev = saved.rev || 0;
            }
        } catch (e) { /* unreadable storage: start empty */ }
        function persist() {
            try { if (storage) storage.setItem(key, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
        }
        return {
            // Newest first.
            list: function () {
                return state.items.slice().sort(function (a, b) { return a.created < b.created ? 1 : a.created > b.created ? -1 : 0; });
            },
            add: function (text) {
                var t = String(text == null ? '' : text).trim();
                if (!t) return null;
                var d = now();
                var item = { id: newId(d), text: t, created: d.toISOString(), copied: false };
                state.items.push(item);
                state.rev++;
                persist();
                return item;
            },
            remove: function (id) {
                var before = state.items.length;
                var gone = state.items.filter(function (s) { return s.id === id; })[0];
                state.items = state.items.filter(function (s) { return s.id !== id; });
                if (state.items.length === before) return false;
                // Deleting one that was already copied means the file must be rewritten.
                if (gone && gone.copied) state.deletedSinceCopy = true;
                state.rev++;
                persist();
                return true;
            },
            needsCopy: function () {
                return state.deletedSinceCopy || state.items.some(function (s) { return !s.copied; });
            },
            rev: function () { return state.rev; },
            // Adds an item with a fixed id (a suggestion added by an update); false if it's already there.
            addItem: function (item) {
                if (!item || !item.id || typeof item.text !== 'string' || state.items.some(function (s) { return s.id === item.id; })) return false;
                state.items.push({ id: item.id, text: item.text, created: item.created || now().toISOString(), copied: false });
                state.rev++;
                persist();
                return true;
            },
            // After a successful copy of the list as it was at `rev`.
            markCopied: function (rev, ids) {
                var set = {};
                (ids || []).forEach(function (id) { set[id] = true; });
                state.items.forEach(function (s) { if (set[s.id]) s.copied = true; });
                if (rev === state.rev) state.deletedSinceCopy = false;
                persist();
            }
        };
    }

    // The whole list as Markdown, newest first. Newlines become " / ".
    function formatMarkdown(appName, items, isoNow) {
        var lines = ['# ' + appName + ': suggested improvements', 'Updated ' + isoNow + '.'];
        (items || []).forEach(function (s) {
            var text = String(s.text).replace(/\r\n|\r|\n/g, ' / ').replace(/[ \t]+/g, ' ').trim();
            lines.push('- [ ] ' + dayOf(s.created) + ' (' + s.id + '): ' + text);
        });
        return lines.join('\n') + '\n';
    }

    /* opts: { store, appName, send(markdown) -> Promise<{ ok } | { ok: false, notConnected, error }>,
       isOnline(), connection() -> '' when ready, or why it isn't (shown as "Not connected — ...") }.
       sync() -> Promise<{ state: 'ok' | 'offline' | 'not-connected' | 'error' | 'busy', message }>. */
    function createSyncer(opts) {
        var busy = false, again = false;
        function sync() {
            var store = opts.store;
            if (!store.needsCopy()) return Promise.resolve({ state: 'ok', message: 'All suggestions copied.' });
            if (!opts.isOnline()) return Promise.resolve({ state: 'offline', message: 'Offline — will copy when back online.' });
            var why = opts.connection();
            if (why) return Promise.resolve({ state: 'not-connected', message: 'Not connected — ' + why });
            if (busy) { again = true; return Promise.resolve({ state: 'busy', message: 'Copying…' }); }
            busy = true;
            var rev = store.rev(), items = store.list();
            var md = formatMarkdown(opts.appName, items, (opts.now ? opts.now() : new Date()).toISOString());
            return Promise.resolve().then(function () { return opts.send(md); }).then(function (r) {
                if (r && r.ok) {
                    store.markCopied(rev, items.map(function (s) { return s.id; }));
                    return { state: 'ok', message: 'Copied.' };
                }
                if (r && r.notConnected) return { state: 'not-connected', message: 'Not connected — ' + (r.error || 'no copy target set up.') };
                return { state: 'error', message: 'Couldn’t copy: ' + ((r && r.error) || 'unknown error') };
            }, function (err) {
                return { state: 'error', message: 'Couldn’t copy: ' + ((err && err.message) || err) };
            }).then(function (result) {
                busy = false;
                if (again && result.state === 'ok' && store.needsCopy()) { again = false; return sync(); }
                again = false;
                return result;
            });
        }
        return { sync: sync };
    }

    /* Run on every load, from lists kept in the app's code:
       - built: ids of suggestions now built into the app. They're removed from
         the list (and so from the copied file on the next copy).
       - seeds: suggestions an update adds for later ({ id, text, created }).
         Each is added once per device; deleting it keeps it gone.
       Returns { removed: [ids], added: [ids] }. */
    function applyUpdates(store, storage, opts) {
        opts = opts || {};
        var key = opts.seenKey || 'reve-suggestions-seeded';
        var out = { removed: [], added: [] };
        (opts.built || []).forEach(function (id) { if (store.remove(id)) out.removed.push(id); });
        var seen = [];
        try { seen = JSON.parse((storage && storage.getItem(key)) || '[]') || []; } catch (e) { seen = []; }
        var built = {};
        (opts.built || []).forEach(function (id) { built[id] = true; });
        (opts.seeds || []).forEach(function (item) {
            if (!item || seen.indexOf(item.id) >= 0 || built[item.id]) return;
            if (store.addItem(item)) out.added.push(item.id);
            seen.push(item.id);
        });
        try { if (storage) storage.setItem(key, JSON.stringify(seen)); } catch (e) { /* storage blocked */ }
        return out;
    }

    return { createStore: createStore, formatMarkdown: formatMarkdown, createSyncer: createSyncer, dayOf: dayOf, applyUpdates: applyUpdates };
});
