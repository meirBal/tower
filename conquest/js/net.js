// כיבוש הממלכות — שכבת רשת.
// אותה תשתית של מגדל האגדות: פרויקט Supabase (pogona) עם המפתח הציבורי.
// חדר = ערוץ Realtime Broadcast בשם conquest-<קוד>. אין שרת משחק: המארח מריץ את הסימולציה ומשדר מצב.
// בבדיקות (?net=local) — BroadcastChannel בין לשוניות באותו דפדפן.
(function () {
  'use strict';
  const SB = {
    url: 'https://xexwkfccvpfnymnycbjv.supabase.co',
    key: 'sb_publishable_67HWGFHXiJYpWzBHburzyA_98z_ZBio',
    lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
    table: 'conquest_scores', view: 'conquest_leaderboard',
  };
  const params = new URLSearchParams(location.search);
  const LOCAL = params.get('net') === 'local';

  let libPromise = null;
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (libPromise) return libPromise;
    libPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SB.lib; s.async = true;
      s.onload = () => (window.supabase ? res(window.supabase) : rej(new Error('lib')));
      s.onerror = () => { libPromise = null; rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }
  let client = null;

  /* מחזיר { send(ev, p), close() }; onMsg(ev, p) נקרא לכל הודעה מאחרים */
  function join(room, onMsg, onStatus) {
    const name = 'conquest-' + room;
    if (LOCAL) {
      const bc = new BroadcastChannel(name);
      bc.onmessage = e => { const m = e.data; if (m && m.ev) onMsg(m.ev, m.p); };
      setTimeout(() => onStatus && onStatus('ok'), 30);
      return Promise.resolve({ send: (ev, p) => bc.postMessage({ ev, p }), close: () => bc.close() });
    }
    return loadLib().then(lib => {
      if (!client) client = lib.createClient(SB.url, SB.key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 30 } } });
      const ch = client.channel(name, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'm' }, msg => { const m = msg.payload; if (m && m.ev) onMsg(m.ev, m.p); });
      return new Promise((res, rej) => {
        let settled = false;
        ch.subscribe(st => {
          if (st === 'SUBSCRIBED') {
            onStatus && onStatus('ok');
            if (!settled) { settled = true; res({ send: (ev, p) => ch.send({ type: 'broadcast', event: 'm', payload: { ev, p } }), close: () => client.removeChannel(ch) }); }
          } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
            onStatus && onStatus('down');
            if (!settled) { settled = true; rej(new Error(st)); }
          }
        });
      });
    });
  }

  /* ---------- טבלת אלופים (REST, כמו tower_scores) ---------- */
  function headers(extra) { return Object.assign({ apikey: SB.key, Authorization: 'Bearer ' + SB.key, 'Content-Type': 'application/json' }, extra || {}); }
  function tfetch(url, opt, ms) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ac && ac.abort(), ms || 8000);
    return fetch(url, Object.assign({}, opt, ac ? { signal: ac.signal } : {})).finally(() => clearTimeout(t));
  }
  function submitScore(row) {
    if (LOCAL) return Promise.resolve();
    return tfetch(SB.url + '/rest/v1/' + SB.table, { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(row) })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); });
  }
  function leaderboard() {
    if (LOCAL) return Promise.resolve([]);
    return tfetch(SB.url + '/rest/v1/' + SB.view + '?select=device,name,games,wins,best_secs&order=wins.desc,games.desc&limit=30', { headers: headers() })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  window.NET = { join, submitScore, leaderboard, LOCAL, SB };
})();
