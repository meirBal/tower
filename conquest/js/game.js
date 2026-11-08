// כיבוש הממלכות — ציור, שליטה במגע, מסכים ומשחק רב-משתתפים.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- זהות משותפת עם מגדל האגדות (אותו localStorage: td_deviceId, td_playerName) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* מצב פרטי */ } },
  };
  function deviceId() {
    let id = store.get('td_deviceId', null);
    if (!id || !/^[a-z0-9]{8,40}$/.test(id)) {
      id = ''; const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 20; i++) id += abc[Math.floor(Math.random() * abc.length)];
      store.set('td_deviceId', id);
    }
    return id;
  }
  const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const DEVICE = deviceId();
  // מזהה ללשונית: נשמר ברענון (sessionStorage) כדי לחזור לאותה משבצת, ושתי לשוניות לא מתנגשות
  const TAB = (() => {
    const forced = (params.get('tab') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    if (forced) return forced;
    try { let t = sessionStorage.getItem('cq_tab'); if (!t) { t = Math.random().toString(36).slice(2, 7); sessionStorage.setItem('cq_tab', t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 7); }
  })();
  const UID = DEVICE + '-' + TAB;
  const myName = () => cleanName(store.get('td_playerName', '')) || 'שחקן';

  /* ---------- מצב כללי ---------- */
  const cv = $('c'), ctx = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1;
  let G = null;          // המשחק (engine)
  let MAP = null;
  let me = -1;           // המשבצת שלי במשחק (-1 = צופה)
  let mode = 'menu';     // menu | solo | mp
  let paused = false;
  let soloCfg = store.get('cq_solo', { n: 4, diff: 1 });
  let lastFrame = performance.now(), simAcc = 0;
  const FX = { parts: [], floats: [], rings: [], ghosts: [] };

  /* ---------- צליל (WebAudio קטן) ---------- */
  let muted = store.get('cq_muted', false), AC = null;
  function tone(f, d, type, vol, slide) {
    if (muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* אין צליל */ }
  }
  const SFX = {
    send() { tone(220, 0.12, 'triangle', 0.07, 330); },
    cap() { tone(523, 0.1, 'square', 0.05); setTimeout(() => tone(784, 0.16, 'square', 0.05), 90); },
    lose() { tone(300, 0.3, 'sawtooth', 0.05, 120); },
    up() { tone(660, 0.08, 'sine', 0.08); setTimeout(() => tone(990, 0.14, 'sine', 0.08), 70); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'square', 0.05), i * 140)); },
    bad() { tone(140, 0.15, 'square', 0.05); },
  };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } };

  /* ---------- מסכים ---------- */
  const SCREENS = ['scrMenu', 'scrSolo', 'scrLobby', 'scrHow', 'scrBoard', 'scrPause', 'scrEnd'];
  let backTo = 'scrMenu';
  let endTimer = 0;
  function show(id) {
    if (id !== 'scrEnd') clearTimeout(endTimer);
    SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
    const inGame = !id && G;
    ['hud', 'bars'].forEach(x => $(x).classList.toggle('hidden', !G));
    if (!inGame) hideBubble();
  }
  function toast(t, ms) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
    const box = $('toasts'); box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, ms || 1800);
  }

  /* ---------- מצלמה ---------- */
  const cam = { s: 1, s0: 1, tx: 0, ty: 0 };
  let TOP = 50, BOTTOM = 30;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  function fitCam() {
    const cs = getComputedStyle(probe);
    TOP = 50 + (parseFloat(cs.paddingTop) || 0); BOTTOM = 30 + (parseFloat(cs.paddingBottom) || 0);
    const vh = VH - TOP - BOTTOM;
    cam.s0 = Math.min(VW / CQ.W, vh / CQ.H);
    cam.s = cam.s0;
    cam.tx = (VW - CQ.W * cam.s) / 2;
    cam.ty = TOP + (vh - CQ.H * cam.s) / 2;
  }
  function clampCam() {
    const w = CQ.W * cam.s, h = CQ.H * cam.s;
    const minX = Math.min(VW - w - 20, (VW - w) / 2), maxX = Math.max(20, (VW - w) / 2);
    const minY = Math.min(VH - BOTTOM - h - 20, (VH - h) / 2), maxY = Math.max(TOP + 20, (VH - h) / 2);
    cam.tx = clamp(cam.tx, minX, maxX); cam.ty = clamp(cam.ty, minY, maxY);
  }
  const sx = x => x * cam.s + cam.tx, sy = y => y * cam.s + cam.ty;
  const wx = x => (x - cam.tx) / cam.s, wy = y => (y - cam.ty) / cam.s;
  // גודל אלמנטים (תגים/חיילים) — קבוע בערך בפיקסלים, גדל קצת בזום
  const uiScale = () => clamp(cam.s0 * 2.4, 0.62, 1.15) * Math.pow(cam.s / cam.s0, 0.55);

  function rotateHint() {
    const bad = G && VW > VH && VH < 520 && 'ontouchstart' in window;
    if (bad) hint('📱 סובב את הטלפון לאורך — המפה גדולה יותר'); else if ($('hint').textContent.startsWith('📱')) hint(null);
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    const z = cam.s0 ? cam.s / cam.s0 : 1;
    fitCam();
    if (z > 1.01) { cam.s = cam.s0 * z; clampCam(); }
    rotateHint();
  }
  window.addEventListener('resize', resize);

  /* ---------- שטחים (ציור למטמון, רק כשמשהו משתנה) ---------- */
  const terr = document.createElement('canvas');
  let terrSig = '', shade = null;
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function renderTerritory() {
    const m = MAP, GW = m.GW, GH = m.GH;
    if (terr.width !== GW) { terr.width = GW; terr.height = GH; }
    if (!shade || shade.length !== GW * GH) {
      shade = new Float32Array(GW * GH);
      const R = CQ.rng(m.seed ^ 77);
      for (let i = 0; i < shade.length; i++) {
        const gx = i % GW, gy = (i / GW) | 0;
        shade[i] = Math.sin(gx * 0.23) * Math.cos(gy * 0.19) * 7 + Math.sin(gx * 0.07 + gy * 0.05) * 6 + (R() - 0.5) * 5;
      }
    }
    const t = terr.getContext('2d'), img = t.createImageData(GW, GH), d = img.data, grid = m.grid, own = G.regions;
    const borderCol = own.map(r => rgb(CQ.fac(r.owner).color));
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const k = gy * GW + gx, rid = grid[k], r = own[rid], f = CQ.fac(r.owner);
      let R = f.land[0], Gc = f.land[1], B = f.land[2];
      const sh = shade[k];
      if (m.water[k]) { R = 72; Gc = 150; B = 212; R += sh; Gc += sh; B += sh; }
      else {
        R += sh; Gc += sh; B += sh;
        const l = gx > 0 ? grid[k - 1] : rid, u = gy > 0 ? grid[k - GW] : rid, rr = gx < GW - 1 ? grid[k + 1] : rid, dd = gy < GH - 1 ? grid[k + GW] : rid;
        if (l !== rid || u !== rid || rr !== rid || dd !== rid) {
          const ob = (l !== rid && own[l].owner !== r.owner) || (u !== rid && own[u].owner !== r.owner) || (rr !== rid && own[rr].owner !== r.owner) || (dd !== rid && own[dd].owner !== r.owner);
          if (ob && r.owner >= 0) { const c = borderCol[rid]; R = c[0]; Gc = c[1]; B = c[2]; }
          else if (ob) { R *= 0.7; Gc *= 0.7; B *= 0.7; }
          else { R *= 0.86; Gc *= 0.86; B *= 0.86; }
        }
      }
      const o = k * 4; d[o] = R; d[o + 1] = Gc; d[o + 2] = B; d[o + 3] = 255;
    }
    t.putImageData(img, 0, 0);
  }

  /* ---------- ספרייטים ---------- */
  const sprites = {};
  function soldierSprite(color, dark) {
    const key = color;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'), S = 3; c.width = 8 * S; c.height = 14 * S;
    const x = c.getContext('2d'); x.scale(S, S);
    x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(4, 12.6, 3.4, 1.3, 0, 0, 7); x.fill();
    x.fillStyle = dark; x.fillRect(2, 8, 1.6, 4); x.fillRect(4.4, 8, 1.6, 4);
    x.fillStyle = color; x.fillRect(1.5, 4, 5, 5);
    x.fillStyle = '#f2cfa8'; x.beginPath(); x.arc(4, 3, 1.9, 0, 7); x.fill();
    x.fillStyle = dark; x.fillRect(1.9, 0.8, 4.2, 1.4);
    x.strokeStyle = '#6b4a2a'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(7, 1); x.lineTo(7, 11); x.stroke();
    x.fillStyle = '#ddd'; x.beginPath(); x.moveTo(6.3, 1.4); x.lineTo(7, -0.6); x.lineTo(7.7, 1.4); x.fill();
    sprites[key] = c; return c;
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function badge(x, y, txt, f, sc, mine) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.font = 'bold 15px system-ui,Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.max(30, ctx.measureText(txt).width + 14);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; roundRect(-w / 2 + 1, -9, w, 22, 11); ctx.fill();
    ctx.fillStyle = mine ? '#fff' : f.dark; roundRect(-w / 2, -11, w, 22, 11); ctx.fill();
    ctx.fillStyle = f.color; roundRect(-w / 2 + 2, -9, w - 4, 18, 9); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(txt, 0, 1);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, 0, 1);
    ctx.restore();
  }
  function castle(x, y, f, sc) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 12, 16, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe9de'; ctx.fillRect(-12, -6, 24, 18);
    ctx.fillStyle = f.color; ctx.fillRect(-12, -6, 24, 5);
    ctx.fillStyle = '#efe9de'; for (let i = 0; i < 4; i++) ctx.fillRect(-12 + i * 7, -10, 4, 4);
    ctx.fillStyle = '#d9d0c0'; ctx.fillRect(-6, -18, 12, 12);
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(0, -28); ctx.lineTo(8, -18); ctx.fill();
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(-3, 4, 6, 8);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, -37); ctx.stroke();
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.moveTo(0, -37); ctx.lineTo(9, -34); ctx.lineTo(0, -31); ctx.fill();
    ctx.restore();
  }
  function mineIcon(x, y, sc) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = '#6d5a45'; ctx.beginPath(); ctx.moveTo(-11, 7); ctx.lineTo(0, -8); ctx.lineTo(11, 7); ctx.fill();
    ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(0, 7, 5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(7, -3, 3.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-5, 0, 2.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  function arrow(x1, y1, x2, y2, color, sc) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 6) return;
    const ux = dx / L, uy = dy / L, w = 10 * sc, hw = 20 * sc, hl = 24 * sc;
    const bx = x2 - ux * hl, by = y2 - uy * hl;
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - uy * w * 0.6, y1 + ux * w * 0.6); ctx.lineTo(bx - uy * w, by + ux * w); ctx.lineTo(bx - uy * hw, by + ux * hw);
    ctx.lineTo(x2, y2); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.lineTo(bx + uy * w, by - ux * w); ctx.lineTo(x1 + uy * w * 0.6, y1 - ux * w * 0.6);
    ctx.closePath(); ctx.stroke(); ctx.fill();
  }

  /* ---------- ציור ---------- */
  let time = 0;
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#2d6f9c'; ctx.fillRect(0, 0, VW, VH);
    if (!G) { drawIdle(); return; }
    const sig = G.regions.map(r => r.owner).join(',');
    if (sig !== terrSig) { terrSig = sig; renderTerritory(); }
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx(0) + 4, sy(0) + 6, CQ.W * cam.s, CQ.H * cam.s);
    ctx.drawImage(terr, sx(0), sy(0), CQ.W * cam.s, CQ.H * cam.s);
    const u = uiScale(), pts = MAP.pts;

    // חלקי מסלולים פעילים (קו מקווקו)
    ctx.setLineDash([5, 7]); ctx.lineWidth = 2.5;
    for (const a of G.armies) {
      const f = CQ.fac(a.o); ctx.strokeStyle = f.color; ctx.globalAlpha = a.o === me ? 0.7 : 0.4;
      const p = CQ.armyPos(G, a);
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y));
      let d = a.d, started = false;
      for (let i = 1; i < a.path.length; i++) {
        const s = MAP.dist(a.path[i - 1], a.path[i]);
        if (!started && d <= s) started = true;
        if (started) ctx.lineTo(sx(pts[a.path[i]].x), sy(pts[a.path[i]].y));
        d -= s;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // טבעות בחירה
    if (drag && drag.moved) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      for (const s of drag.sources) { ctx.beginPath(); ctx.arc(sx(pts[s].x), sy(pts[s].y), 30 * u, 0, 7); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (selRegion >= 0) {
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(pts[selRegion].x), sy(pts[selRegion].y), (32 + Math.sin(time * 6) * 2) * u, 0, 7); ctx.stroke();
    }

    // מחוזות
    for (const r of G.regions) {
      const f = CQ.fac(r.owner), p = pts[r.id], x = sx(p.x), y = sy(p.y);
      const fl = flash[r.id] || 0, pu = pulse[r.id] || 0;
      if (r.mine) mineIcon(x - 26 * u, y - 12 * u, u * 0.9);
      // חיילים
      const n = Math.min(18, Math.ceil(r.troops / 4));
      if (n > 0) {
        const spr = soldierSprite(f.color, f.dark), w = 8 * u * 1.05, h = 14 * u * 1.05;
        const cols = 6;
        for (let i = 0; i < n; i++) {
          const row = (i / cols) | 0, col = i % cols;
          const cx = x + (col - (Math.min(n, cols) - 1) / 2) * 7.5 * u + (row % 2) * 3 * u;
          const cy = y + 6 * u + row * 6.5 * u;
          const bob = Math.sin(time * 3 + i * 1.7 + r.id) * 0.6 * u;
          ctx.drawImage(spr, cx - w / 2, cy - h / 2 + bob, w, h);
        }
      }
      if (r.capital) castle(x + (p.x > CQ.W - 120 ? -25 : 25) * u, y - 2 * u, f, u * 0.85);
      const sc = u * (1 + pu * 0.25 + fl * 0.15);
      badge(x, y - 10 * u, String(Math.floor(r.troops)), f, sc, r.owner === me && me >= 0);
      if (r.level > 1) {
        ctx.font = `bold ${Math.round(12 * u)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.5)'; const st = '★'.repeat(r.level - 1);
        ctx.strokeText(st, x, y - 27 * u); ctx.fillStyle = '#ffd23f'; ctx.fillText(st, x, y - 27 * u);
      }
      if (fl > 0) { ctx.globalAlpha = fl; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, (20 + (1 - fl) * 26) * u, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }

    // צבאות בתנועה
    for (const a of G.armies) {
      const f = CQ.fac(a.o), p = CQ.armyPos(G, a), x = sx(p.x), y = sy(p.y);
      const spr = soldierSprite(f.color, f.dark), w = 8 * u, h = 14 * u;
      const n = Math.min(9, Math.ceil(a.n / 4)), ca = Math.cos(p.ang), sa = Math.sin(p.ang);
      for (let i = 0; i < n; i++) {
        const back = (i / 3 | 0) * 7 * u, side = ((i % 3) - 1) * 7 * u;
        const ox = -ca * back - sa * side, oy = -sa * back + ca * side;
        const bob = Math.abs(Math.sin(time * 12 + i)) * -1.5 * u;
        ctx.drawImage(spr, x + ox - w / 2, y + oy - h / 2 + bob, w, h);
      }
      if (a.d > 30) badge(x, y - 18 * u, String(a.n), f, u * 0.82, a.o === me);
    }

    // אפקטים
    for (const p of FX.parts) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(sx(p.x) - 2, sy(p.y) - 2, 4, 4); }
    ctx.globalAlpha = 1;
    for (const r of FX.rings) {
      ctx.globalAlpha = clamp(r.life, 0, 1); ctx.strokeStyle = r.c; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), (1 - r.life) * 60 * u + 10, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const fl of FX.floats) {
      ctx.globalAlpha = clamp(fl.t, 0, 1); ctx.font = `bold ${Math.round(16 * u)}px system-ui`;
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(fl.txt, sx(fl.x), sy(fl.y)); ctx.fillStyle = fl.c || '#ffe066'; ctx.fillText(fl.txt, sx(fl.x), sy(fl.y));
    }
    ctx.globalAlpha = 1;

    for (const g of FX.ghosts) {
      ctx.globalAlpha = clamp(g.life * 1.4, 0, 0.8);
      arrow(sx(pts[g.f].x), sy(pts[g.f].y), sx(pts[g.to].x), sy(pts[g.to].y), CQ.FACTIONS[me >= 0 ? me : 0].color, u * 0.8);
    }
    ctx.globalAlpha = 1;
    // חץ גרירה
    if (drag && drag.moved) {
      const tgt = regionAtScreen(drag.x, drag.y);
      const valid = tgt >= 0 && drag.valid;
      const tx = tgt >= 0 && !drag.sources.includes(tgt) ? sx(pts[tgt].x) : drag.x;
      const ty = tgt >= 0 && !drag.sources.includes(tgt) ? sy(pts[tgt].y) : drag.y;
      const col = tgt < 0 || drag.sources.includes(tgt) ? 'rgba(80,220,100,.75)' : valid ? 'rgba(80,220,100,.9)' : 'rgba(230,70,60,.85)';
      for (const s of drag.sources) arrow(sx(pts[s].x), sy(pts[s].y), tx, ty, col, u);
      if (tgt >= 0 && !drag.sources.includes(tgt)) {
        ctx.strokeStyle = valid ? '#fff' : '#ff6b5e'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(tx, ty, (34 + Math.sin(time * 8) * 3) * u, 0, 7); ctx.stroke();
        const total = drag.sources.reduce((s, i) => s + Math.floor(G.regions[i].troops), 0);
        const T = G.regions[tgt];
        const need = T.owner === me ? 0 : Math.floor(T.troops * CQ.defenseOf(T)) + 1;
        const lbl = T.owner === me ? `חיזוק +${total}` : valid ? `⚔ ${total} נגד ${need}` : 'אין דרך';
        badge(tx, ty + 44 * u, lbl, valid ? (total >= need ? CQ.FACTIONS[0] : CQ.FACTIONS[1]) : CQ.NEUTRAL, u * 0.9);
      }
    }
  }
  function drawIdle() {
    // רקע תפריט: מפה מסתובבת לאט
    if (!idleMap) return;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(terr, 0, 0, terr.width, terr.height, (VW - VH * CQ.W / CQ.H) / 2, 0, VH * CQ.W / CQ.H, VH);
    ctx.globalAlpha = 1;
  }

  /* ---------- אפקטים מתוך שינויים במצב (עובד גם אצל משתתפים שמקבלים רק תמונות מצב) ---------- */
  let prevOwner = [], prevTroops = [], prevAlive = [];
  const flash = [], pulse = [];
  let loseToastAt = 0;
  function diffEffects() {
    const pts = MAP.pts;
    G.regions.forEach((r, i) => {
      const po = prevOwner[i], pt = prevTroops[i];
      if (po !== undefined && po !== r.owner) {
        const c = CQ.fac(r.owner).color;
        for (let k = 0; k < 16; k++) FX.parts.push({ x: pts[i].x, y: pts[i].y, vx: (Math.random() - .5) * 160, vy: -Math.random() * 160, life: .5 + Math.random() * .5, c });
        FX.rings.push({ x: pts[i].x, y: pts[i].y, life: 1, c });
        pulse[i] = 1.4;
        if (r.owner === me && me >= 0) { SFX.cap(); buzz(20); FX.floats.push({ x: pts[i].x, y: pts[i].y - 40, t: 1.3, txt: r.mine ? '+10 🪙' : '+5 🪙' }); if (r.capital && po >= 0) toast(`🏯 כבשת את בירת ${G.players[po].name}!`, 2500); }
        if (po === me && me >= 0) { SFX.lose(); buzz([30, 40, 30]); if (time - loseToastAt > 4) { loseToastAt = time; toast(r.capital ? '🏯 הבירה שלך נפלה! הצבא שלך נחלש' : '⚠️ איבדת מחוז'); } }
      } else if (pt !== undefined && pt - r.troops > 2.5 && r.owner === po && !G.armies.some(a => a.path[0] === i && a.d < 60)) {
        flash[i] = 1;
        for (let k = 0; k < 6; k++) FX.parts.push({ x: pts[i].x + (Math.random() - .5) * 20, y: pts[i].y, vx: (Math.random() - .5) * 90, vy: -Math.random() * 90, life: .4, c: '#fff' });
      } else if (pt !== undefined && r.troops - pt > 2.5) pulse[i] = Math.max(pulse[i] || 0, 0.6);
      prevOwner[i] = r.owner; prevTroops[i] = r.troops;
    });
    G.players.forEach((p, i) => {
      if (prevAlive[i] === true && !p.alive && !G.over) {
        if (i === me) { toast('💀 הובסת… אפשר להמשיך לצפות', 3500); }
        else toast(`☠️ ${p.name} הובסה`, 2200);
      }
      prevAlive[i] = p.alive;
    });
  }
  function resetEffects() { prevOwner = []; prevTroops = []; prevAlive = []; flash.length = 0; pulse.length = 0; FX.parts = []; FX.floats = []; FX.rings = []; }
  function stepFX(dt) {
    for (const p of FX.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }
    FX.parts = FX.parts.filter(p => p.life > 0);
    for (const f of FX.floats) { f.t -= dt; f.y -= 30 * dt; }
    FX.floats = FX.floats.filter(f => f.t > 0);
    for (const g of FX.ghosts) g.life -= dt;
    FX.ghosts = FX.ghosts.filter(g => g.life > 0);
    for (const r of FX.rings) r.life -= dt * 1.6;
    FX.rings = FX.rings.filter(r => r.life > 0);
    for (let i = 0; i < flash.length; i++) if (flash[i]) flash[i] = Math.max(0, flash[i] - dt * 2.5);
    for (let i = 0; i < pulse.length; i++) if (pulse[i]) pulse[i] = Math.max(0, pulse[i] - dt * 2);
  }

  /* ---------- HUD ---------- */
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function hud() {
    if (!G) return;
    const mineN = G.regions.filter(r => r.owner === me).length;
    setText('coins', me >= 0 ? String(Math.floor(G.coins[me])) : '—');
    setText('myRegions', me >= 0 ? `${mineN}/${G.regions.length}` : 'צופה');
    const m = Math.floor(G.t / 60), s = Math.floor(G.t % 60);
    setText('clock', `${m}:${String(s).padStart(2, '0')}`);
    const counts = G.players.map(() => 0); let neu = 0;
    for (const r of G.regions) r.owner >= 0 ? counts[r.owner]++ : neu++;
    const key = counts.join(',') + '|' + neu;
    if (hudCache.bars !== key) {
      hudCache.bars = key;
      const N = G.regions.length;
      $('bars').innerHTML = counts.map((c, i) => c ? `<div style="width:${c / N * 100}%;background:${CQ.FACTIONS[i].color}${i === me ? ';box-shadow:inset 0 0 0 2px #fff' : ''}"></div>` : '').join('') +
        `<div style="width:${neu / N * 100}%;background:${CQ.NEUTRAL.color}"></div><i class="dom" style="left:${CQ.DOMINATE * 100}%"></i>`;
    }
    if (bubbleRegion >= 0) updateBubble();
  }

  /* ---------- קלט: גרירה, הקשה, זום ---------- */
  const pointers = new Map();
  let drag = null, pan = null, pinch = null, selRegion = -1, bubbleRegion = -1;
  function regionAtScreen(x, y) {
    if (!MAP) return -1;
    const X = wx(x), Y = wy(y);
    if (X < 0 || Y < 0 || X >= CQ.W || Y >= CQ.H) return -1;
    const gx = Math.floor(X / CQ.CELL), gy = Math.floor(Y / CQ.CELL);
    return MAP.grid[gy * MAP.GW + gx];
  }
  const canAct = () => G && !G.over && me >= 0 && G.players[me].alive && !paused;
  function updateValid() {
    const tgt = regionAtScreen(drag.x, drag.y);
    if (tgt < 0 || drag.sources.includes(tgt)) { drag.valid = false; return; }
    if (drag.lastTgt === tgt && drag.lastN === drag.sources.length) return;
    drag.lastTgt = tgt; drag.lastN = drag.sources.length;
    drag.valid = drag.sources.some(s => CQ.route(G, me, s, tgt));
  }
  cv.addEventListener('pointerdown', e => {
    if (!G) return;
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      drag = null; pan = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: cam.s, tx: cam.tx, ty: cam.ty };
      return;
    }
    if (pointers.size > 2) return;
    const r = regionAtScreen(e.clientX, e.clientY);
    if (r >= 0 && canAct() && G.regions[r].owner === me) {
      drag = { sources: [r], start: r, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, valid: false };
    } else {
      pan = { x: e.clientX, y: e.clientY, tx: cam.tx, ty: cam.ty, moved: false, r };
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ns = clamp(pinch.s * d / pinch.d, cam.s0, cam.s0 * 3.5);
      const wxp = (pinch.mx - pinch.tx) / pinch.s, wyp = (pinch.my - pinch.ty) / pinch.s;
      cam.s = ns; cam.tx = mx - wxp * ns; cam.ty = my - wyp * ns; clampCam();
      return;
    }
    if (drag) {
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 10) { drag.moved = true; hideBubble(); hint(null); }
      const r = regionAtScreen(drag.x, drag.y);
      if (r >= 0 && G.regions[r].owner === me && !drag.sources.includes(r)) {
        const p = MAP.pts[r];
        if (Math.hypot(sx(p.x) - drag.x, sy(p.y) - drag.y) < 30 * uiScale() && G.regions[r].troops >= 1) { drag.sources.push(r); buzz(8); }
      }
      if (drag.moved) updateValid();
    } else if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.hypot(dx, dy) > 8) pan.moved = true;
      if (cam.s > cam.s0 * 1.01) { cam.tx = pan.tx + dx; cam.ty = pan.ty + dy; clampCam(); }
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (drag) {
      const d = drag; drag = null;
      if (!d.moved) { openBubble(d.start); return; }
      const tgt = regionAtScreen(d.x, d.y);
      if (tgt < 0) return;
      // שחרור על אחד מהמקורות: חיזוק מהאחרים אליו
      const froms = d.sources.filter(s => s !== tgt);
      if (!froms.length) return;
      issueOrder(froms, tgt);
    } else if (pan) {
      const p = pan; pan = null;
      if (!p.moved) { if (p.r >= 0) openBubble(p.r); else hideBubble(); }
    }
  }
  cv.addEventListener('pointerup', pointerEnd);
  cv.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; pan = null; pinch = null; });
  cv.addEventListener('wheel', e => {
    if (!G) return; e.preventDefault();
    const ns = clamp(cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), cam.s0, cam.s0 * 3.5);
    const X = wx(e.clientX), Y = wy(e.clientY);
    cam.s = ns; cam.tx = e.clientX - X * ns; cam.ty = e.clientY - Y * ns; clampCam();
  }, { passive: false });
  let lastPtrType = 'mouse';
  cv.addEventListener('pointerdown', e => { lastPtrType = e.pointerType; }, true);
  cv.addEventListener('dblclick', () => { if (G && lastPtrType === 'mouse') fitCam(); });

  function issueOrder(froms, to) {
    if (!canAct()) return;
    const anyRoute = froms.some(f => CQ.route(G, me, f, to));
    if (!anyRoute) { SFX.bad(); toast('אין דרך: אפשר לתקוף רק מחוז שגובל בשטח שלך'); return; }
    let sent;
    if (mode === 'mp' && !MP.isHost) {
      // המארח מבצע; כאן רק חץ זמני עד שתמונת המצב הבאה מגיעה (בלי "קפיצות" של חיילים)
      MP.send('cmd', { gid: MP.gid, uid: UID, from: froms, to });
      sent = froms.filter(f => G.regions[f].owner === me && G.regions[f].troops >= 1 && CQ.route(G, me, f, to)).length;
      for (const f of froms) FX.ghosts.push({ f, to, life: 0.7 });
    } else sent = CQ.order(G, me, froms, to);
    if (sent) { SFX.send(); buzz(12); hintDone(); }
  }
  function doUpgrade(id) {
    if (!canAct()) return;
    const r = G.regions[id], c = CQ.upgradeCost(r);
    if (r.owner !== me || G.coins[me] < c) { SFX.bad(); return; }
    if (mode === 'mp' && !MP.isHost) { MP.send('up', { gid: MP.gid, uid: UID, id }); SFX.up(); buzz(15); return; }
    if (CQ.upgrade(G, me, id)) { SFX.up(); buzz(15); pulse[id] = 1.5; FX.floats.push({ x: MAP.pts[id].x, y: MAP.pts[id].y - 40, t: 1.2, txt: 'שודרג ★', c: '#fff' }); }
  }

  /* ---------- בועת מידע על מחוז ---------- */
  function openBubble(id) {
    if (bubbleRegion === id) { hideBubble(); return; }
    bubbleRegion = id; selRegion = id; updateBubble(true);
    $('bubble').classList.remove('hidden');
  }
  function hideBubble() { bubbleRegion = -1; selRegion = -1; $('bubble').classList.add('hidden'); }
  let bubbleKey = '';
  function updateBubble(force) {
    const id = bubbleRegion, r = G.regions[id], f = CQ.fac(r.owner), p = MAP.pts[id];
    const el = $('bubble');
    const x = clamp(sx(p.x), 90, VW - 90), above = sy(p.y) - 40 * uiScale();
    const below = above < TOP + 140;
    el.style.left = x + 'px';
    el.style.top = (below ? sy(p.y) + 45 * uiScale() : above) + 'px';
    el.style.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
    const own = r.owner === me && me >= 0;
    const cost = CQ.upgradeCost(r);
    const key = [id, r.owner, r.level, Math.floor(r.troops), own && G.coins[me] >= cost].join('|');
    if (!force && key === bubbleKey) return;
    bubbleKey = key;
    const who = r.owner < 0 ? 'שטח חופשי' : (r.owner === me ? 'שלך' : esc(G.players[r.owner].name));
    const lines = [
      `${Math.floor(r.troops)}/${CQ.capOf(r)} חיילים${r.owner >= 0 ? ` · +${CQ.growthOf(G, r).toFixed(1)}/שנ'` : ''}`,
      `רמה ${r.level}${r.level > 1 ? ' ' + '★'.repeat(r.level - 1) : ''} · הגנה ×${CQ.defenseOf(r).toFixed(2)}`,
    ];
    if (r.capital) lines.push('🏯 בירה: גדילה מהירה');
    if (r.mine) lines.push('⛏️ מכרה: +0.5 🪙 לשנייה');
    let btn = '';
    if (own) btn = r.level >= 3 ? '<button class="btn alt small" disabled>רמה מקסימלית</button>'
      : `<button class="btn small" id="upBtn" ${G.coins[me] < cost ? 'disabled' : ''}>שדרג ★ — ${cost} 🪙</button>`;
    el.innerHTML = `<div class="t" style="color:${f.color}">${who}</div><div class="s">${lines.join('<br>')}</div>${btn}`;
    const b = $('upBtn'); if (b) b.onclick = () => { doUpgrade(id); updateBubble(true); };
  }

  /* ---------- רמז למתחילים ---------- */
  function hint(t) { const h = $('hint'); if (!t) { h.classList.add('hidden'); return; } h.textContent = t; h.classList.remove('hidden'); }
  function hintDone() { if (!store.get('cq_hinted', false)) store.set('cq_hinted', true); hint(null); }

  /* ---------- התחלת משחק ---------- */
  function startGame(cfg, slot) {
    G = CQ.createGame(cfg);
    MAP = CQ.buildMap(G.seed, G.players.length);
    me = slot;
    terrSig = ''; shade = null; idleMap = false;
    resetEffects(); diffEffects();
    paused = false; simAcc = 0; submitted = false;
    fitCam(); hideBubble();
    show(null);
    $('pauseBtn').textContent = mode === 'solo' ? '⏸' : '☰';
    $('emoBtn').classList.toggle('hidden', mode !== 'mp');
    $('myDot').style.background = me >= 0 ? CQ.FACTIONS[me].color : '#777';
    if (me >= 0) {
      const cap = G.regions.find(r => r.owner === me && r.capital);
      if (cap) { const p = MAP.pts[cap.id]; FX.rings.push({ x: p.x, y: p.y, life: 1, c: '#fff' }); FX.floats.push({ x: p.x, y: p.y - 50, t: 3, txt: 'אתה כאן!', c: '#fff' }); }
      hint(store.get('cq_hinted', false) ? null : 'גרור מהמחוז שלך אל מחוז שכן כדי לתקוף 👆');
    } else hint('אתה צופה במשחק הזה');
  }

  function soloStart() {
    mode = 'solo';
    const n = soloCfg.n;
    const players = [{ name: myName(), bot: false, uid: UID }];
    for (let i = 1; i < n; i++) players.push({ name: CQ.FACTIONS[i].name, bot: true });
    startGame({ seed: (Math.random() * 2 ** 31) >>> 0, players, diff: soloCfg.diff }, 0);
  }

  /* ---------- סוף משחק ---------- */
  let submitted = false, endedFor = null;
  function endGame() {
    if (endedFor === G) return;
    endedFor = G;
    const rank = CQ.ranking(G);
    const place = me >= 0 ? rank.indexOf(me) + 1 : 0;
    const won = me >= 0 && G.winner === me;
    if (won) SFX.win(); else if (me >= 0) SFX.lose();
    $('endTitle').textContent = me < 0 ? `🏁 ${G.players[G.winner] ? G.players[G.winner].name : ''} ניצח/ה` : won ? '🏆 ניצחון!' : `מקום ${place} מתוך ${G.players.length}`;
    const m = Math.floor(G.t / 60), s = Math.floor(G.t % 60);
    $('endSub').textContent = `משך המשחק ${m}:${String(s).padStart(2, '0')}` + (won ? ' — כל הממלכות כורעות ברך!' : '');
    const counts = G.players.map(() => 0); for (const r of G.regions) if (r.owner >= 0) counts[r.owner]++;
    $('endRank').innerHTML = rank.map((i, k) => {
      const p = G.players[i], st = G.stats[i];
      return `<li class="${i === me ? 'me' : ''}"><b>${k + 1}</b><span class="dot" style="background:${CQ.FACTIONS[i].color}"></span>${esc(p.name)}${p.bot && !p.uid ? ' 🤖' : ''}<span class="tag">כבש ${st.cap} · שיא ${st.peak}</span></li>`;
    }).join('');
    $('againBtn').textContent = mode === 'mp' ? (MP.isHost ? 'סיבוב נוסף' : 'חזרה לחדר') : 'שחק שוב';
    clearTimeout(endTimer);
    endTimer = setTimeout(() => { if (G && G.over) show('scrEnd'); }, 900);
    if (me >= 0 && !submitted) {
      submitted = true;
      const humans = G.players.filter(p => p.uid).length;
      NET.submitScore({
        device: DEVICE, name: myName(), won, place, players: G.players.length, humans, secs: Math.round(G.t * 10) / 10,
        regions: G.stats[me].peak, captured: G.stats[me].cap, diff: G.diff, mode: mode === 'mp' ? 'mp' : 'solo', version: CQ.VERSION,
      }).catch(() => { /* בלי רשת — לא נורא */ });
    }
  }

  /* ---------- לולאה ---------- */
  const STEP = 1 / 30;
  function advance(dt, maxSteps) {
    if (!G || paused || G.over) return;
    const auth = mode === 'solo' || (mode === 'mp' && MP.isHost);
    simAcc += dt;
    let n = 0;
    while (simAcc >= STEP && n < maxSteps) { CQ.step(G, STEP, auth); simAcc -= STEP; n++; }
    if (n === maxSteps) simAcc = 0;
    G.events.length = 0;
    diffEffects();
    if (G.over) endGame();
  }
  function frame(now) {
    requestAnimationFrame(frame);   // קודם — כדי ששגיאה אחת לא תעצור את המשחק
    const dt = Math.min(0.25, (now - lastFrame) / 1000); lastFrame = now; time += dt;
    try { advance(dt, 10); stepFX(dt); draw(); hud(); } catch (e) { console.error(e); }
  }
  // מארח שהלשונית שלו ברקע: הדפדפן עוצר את הציור, אבל המשחק של כולם ממשיך מכאן
  setInterval(() => {
    if (!document.hidden || mode !== 'mp' || !MP.isHost) return;
    const t = performance.now(), dt = Math.min(2, (t - lastFrame) / 1000); lastFrame = t;
    try { advance(dt, 70); } catch (e) { console.error(e); }
  }, 250);

  /* ================================================================
     רב-משתתפים: המארח מריץ את הסימולציה ומשדר מצב 5 פעמים בשנייה.
     כולם משדרים "אני כאן" כל 1.5 שניות; אם המארח נעלם — הבא בתור ממשיך מהמצב האחרון.
     ================================================================ */
  const MP = {
    code: '', net: null, isHost: false, hostUid: '', epoch: 0, members: new Map(), cfg: { fill: 4, diff: 1 },
    started: false, gid: '', gameCfg: null, hostSeen: 0, timers: [], joinedAt: 0, away: new Set(), stTick: 0, oldVer: false,
    send(ev, p) { try { this.net && this.net.send(ev, p); } catch (e) { /* */ } },
  };
  const now = () => Date.now();
  const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join('');
  const keepParams = () => (NET.LOCAL ? '&net=local' : '') + (params.get('tab') ? '&tab=' + encodeURIComponent(params.get('tab')) : '');
  const roomLink = code => location.origin + location.pathname + '?room=' + code + keepParams();
  const isStr = (x, n) => typeof x === 'string' && x.length > 0 && x.length <= (n || 60);

  // מי הסמכות בחדר: עידן גבוה יותר מנצח; באותו עידן — המזהה הקטן. העידן עולה בכל החלפת מארח ובכל סיבוב חדש.
  function outranks(epoch, host) {
    if (!(Number.isInteger(epoch) && epoch >= 0 && epoch < 1e6) || !isStr(host)) return false;
    const m = MP.members.get(host);   // רק חבר חדר שנשמע לאחרונה יכול להיות מארח
    if (!m || now() - m.seen > 8000) return false;
    if (epoch !== MP.epoch) return epoch > MP.epoch;
    if (!MP.hostUid || host === MP.hostUid) return true;
    return host < MP.hostUid;
  }
  function adoptHost(epoch, host) {
    if (MP.isHost && host !== UID) MP.isHost = false;
    MP.epoch = epoch; MP.hostUid = host; MP.hostSeen = now();
  }

  function mpEnter(code, asHost) {
    mpLeave(true);
    mode = 'mp';
    Object.assign(MP, { code, isHost: asHost, hostUid: asHost ? UID : '', epoch: asHost ? 1 : 0, members: new Map(), started: false, gid: '', gameCfg: null, hostSeen: now(), joinedAt: now(), away: new Set(), oldVer: false });
    MP.members.set(UID, { name: myName(), seen: now(), t0: now() });
    G = null; MAP = null;
    $('lobCode').textContent = code;
    $('lobStatus').textContent = 'מתחבר…';
    lobbyKey = ''; show('scrLobby'); renderLobby();
    history.replaceState(null, '', roomLink(code).replace(location.origin, ''));
    NET.join(code, onNetSafe, st => { $('netBadge').classList.toggle('hidden', st === 'ok'); $('netBadge').textContent = '📡 החיבור נותק, מנסה שוב…'; })
      .then(n => {
        if (mode !== 'mp' || MP.code !== code) { n.close(); return; }
        MP.net = n;
        $('lobStatus').textContent = asHost ? 'שתף את הקישור עם החברים (עד 8 משתתפים)' : 'מחפש את המארח…';
        hello();
        if (asHost) sendLobby();
        MP.timers.push(setInterval(hello, 2000));
        MP.timers.push(setInterval(tick, 1000));
        // מצב המשחק: 4 בשנייה בזמן משחק, פעם בשנייה אחרי שנגמר
        MP.timers.push(setInterval(() => {
          if (!MP.isHost || !G || !MP.started) return;
          if (G.over && (MP.stTick++ % 4)) return;
          MP.send('st', { gid: MP.gid, host: UID, epoch: MP.epoch, s: CQ.snapshot(G) });
        }, 250));
        MP.timers.push(setInterval(() => { if (MP.isHost && (!MP.started || (MP.stTick++ % 2 === 0))) sendLobby(); }, 2000));
      })
      .catch(() => { $('lobStatus').textContent = 'אין חיבור לשרת. בדוק אינטרנט ונסה שוב.'; });
  }
  function mpLeave(silent) {
    MP.timers.forEach(clearInterval); MP.timers = [];
    if (MP.net) { MP.send('bye', { uid: UID }); const n = MP.net; setTimeout(() => n.close(), 150); }
    MP.net = null; MP.code = ''; MP.isHost = false; MP.started = false; MP.gid = '';
    if (!silent) history.replaceState(null, '', location.pathname + (keepParams() ? '?' + keepParams().slice(1) : ''));
  }
  function hello() { const m = MP.members.get(UID); m.seen = now(); m.name = myName(); MP.send('hello', { uid: UID, name: myName(), t0: MP.joinedAt, v: CQ.VERSION }); }
  function memberList() {
    return [...MP.members.entries()].filter(([, m]) => now() - m.seen < 7000).sort((a, b) => a[1].t0 - b[1].t0 || (a[0] < b[0] ? -1 : 1)).map(([uid, m]) => ({ uid, name: m.name }));
  }
  function sendLobby() {
    MP.send('lobby', { host: UID, epoch: MP.epoch, v: CQ.VERSION, members: memberList().slice(0, 16), cfg: MP.cfg, started: MP.started, gid: MP.gid, game: MP.gameCfg });
    renderLobby();
  }
  const slotOf = uid => (G ? G.players.findIndex(p => p.uid === uid) : -1);
  function backToLobby() {
    MP.started = false; MP.gid = ''; G = null; MAP = null; MP.away = new Set();
    clearTimeout(endTimer); lobbyKey = ''; show('scrLobby'); renderLobby();
  }
  function validGameCfg(c) {
    return c && Number.isInteger(c.seed) && c.seed >= 0 && Number.isInteger(c.diff) && c.diff >= 0 && c.diff <= 2 &&
      Array.isArray(c.players) && c.players.length >= 2 && c.players.length <= 8 &&
      c.players.every(x => x && typeof x.name === 'string' && x.name.length <= 40 && (x.uid == null || isStr(x.uid)));
  }

  // הודעה פגומה לא מפילה אף אחד
  function onNetSafe(ev, p) { try { onNet(ev, p); } catch (e) { console.warn('bad message', ev, e); } }
  function onNet(ev, p) {
    if (!p || typeof p !== 'object') return;
    if (ev === 'hello') {
      if (!isStr(p.uid)) return;
      const m = MP.members.get(p.uid);
      if (!m && MP.isHost) setTimeout(sendLobby, 50);
      MP.members.set(p.uid, { name: cleanName(p.name) || 'שחקן', seen: now(), t0: Number.isFinite(p.t0) ? p.t0 : now() });
      if (p.uid === MP.hostUid) MP.hostSeen = now();
      if (MP.isHost && G && MP.started) {
        const i = slotOf(p.uid);
        if (i >= 0 && MP.away.has(p.uid)) { MP.away.delete(p.uid); G.players[i].bot = false; toast(`🔌 ${G.players[i].name} חזר/ה`); }
      }
      if (!G || !MP.started) renderLobby();
    } else if (ev === 'bye') {
      if (!isStr(p.uid)) return;
      MP.members.delete(p.uid);
      if (p.uid === MP.hostUid) MP.hostSeen = 0;
      renderLobby();
    } else if (ev === 'lobby') {
      if (p.host === UID) return;
      if (!outranks(p.epoch, p.host)) { if (MP.isHost) sendLobby(); return; }
      if (p.v !== CQ.VERSION) {
        MP.oldVer = true;
        $('lobStatus').textContent = '⚠️ יש גרסה אחרת של המשחק בחדר — רעננו את הדף (כולם)';
        return;
      }
      adoptHost(p.epoch, p.host);
      if (Array.isArray(p.members)) for (const m of p.members.slice(0, 16)) if (m && isStr(m.uid) && !MP.members.has(m.uid)) MP.members.set(m.uid, { name: cleanName(m.name) || 'שחקן', seen: now(), t0: now() });
      if (p.cfg && typeof p.cfg === 'object') MP.cfg = { fill: clamp(Math.round(+p.cfg.fill) || 2, 2, 8), diff: clamp(Math.round(+p.cfg.diff) || 0, 0, 2) };
      if (p.started && validGameCfg(p.game) && isStr(p.gid, 20) && p.gid !== MP.gid) {
        MP.gid = p.gid; MP.gameCfg = p.game; MP.started = true; MP.away = new Set();
        startGame(p.game, p.game.players.findIndex(x => x.uid === UID));
      } else if (!p.started && MP.started) {
        backToLobby();   // המארח פתח סיבוב חדש
      }
      $('lobStatus').textContent = MP.isHost ? 'אתה המארח' : 'מחובר לחדר';
      renderLobby();
    } else if (ev === 'st') {
      if (!G || p.gid !== MP.gid || p.host === UID) return;
      if (!outranks(p.epoch, p.host)) return;
      if (!CQ.validSnapshot(G, p.s)) return;
      adoptHost(p.epoch, p.host);
      const wasOver = G.over;
      CQ.applySnapshot(G, p.s);
      if (G.over && !wasOver) endGame();
    } else if (ev === 'cmd') {
      // הערה: אין התחברות, אז הפקודה מזוהה לפי uid שנשלח. מספיק למשחק בין חברים.
      if (!MP.isHost || !G || p.gid !== MP.gid || !isStr(p.uid)) return;
      const i = slotOf(p.uid);
      if (i >= 0 && Array.isArray(p.from)) CQ.order(G, i, p.from.slice(0, 12).map(Number), Number(p.to));
    } else if (ev === 'up') {
      if (!MP.isHost || !G || p.gid !== MP.gid || !isStr(p.uid)) return;
      const i = slotOf(p.uid);
      if (i >= 0) CQ.upgrade(G, i, Number(p.id));
    } else if (ev === 'emo') {
      if (isStr(p.uid)) showEmote(p.uid, String(p.e).slice(0, 4));
    }
  }

  function tick() {
    const t = now();
    // בחירת מארח חדש אם המארח נעלם
    if (!MP.isHost && !MP.oldVer && t - MP.hostSeen > 5000 && t - MP.joinedAt > 3500 && !document.hidden) {
      let cands;
      if (G && MP.started) cands = G.players.filter(p => p.uid && (p.uid === UID || (MP.members.get(p.uid) && t - MP.members.get(p.uid).seen < 5000))).map(p => p.uid);
      else cands = memberList().map(m => m.uid);
      cands = cands.filter(u => u !== MP.hostUid).sort();
      if (cands[0] === UID) {
        MP.isHost = true; MP.hostUid = UID; MP.epoch++;
        if (MP.started) toast('👑 המארח התנתק — אתה ממשיך לנהל את המשחק', 3000);
        $('lobStatus').textContent = 'אתה המארח';
        sendLobby();
      }
    }
    // המארח: שחקן שנעלם — בוט ממשיך בשבילו
    if (MP.isHost && G && MP.started && !G.over) {
      G.players.forEach(p => {
        if (!p.uid || p.uid === UID || MP.away.has(p.uid)) return;
        const m = MP.members.get(p.uid);
        if (!m || t - m.seen > 12000) { MP.away.add(p.uid); p.bot = true; toast(`📴 ${p.name} התנתק/ה — בוט ממשיך במקומו`); }
      });
    }
    if (!G || !MP.started) renderLobby();
  }

  let lobbyKey = '';
  function renderLobby() {
    if (mode !== 'mp') return;
    const list = memberList();
    const fillMin = Math.max(2, Math.min(8, list.length));
    MP.cfg.fill = clamp(MP.cfg.fill, fillMin, 8);
    const key = JSON.stringify([list, MP.cfg, MP.isHost, MP.hostUid]);
    if (key === lobbyKey) return; lobbyKey = key;
    const humans = Math.min(8, list.length);
    $('lobPlayers').innerHTML = list.map((m, i) => `<li class="${m.uid === UID ? 'me' : ''}"><span class="dot" style="background:${i < 8 ? CQ.FACTIONS[i].color : '#777'}"></span>${esc(m.name)}<span class="tag">${m.uid === MP.hostUid ? '👑 מארח' : ''}${i >= 8 ? 'צופה' : ''}</span></li>`).join('') +
      Array.from({ length: Math.max(0, MP.cfg.fill - humans) }, (_, k) => `<li><span class="dot" style="background:${CQ.FACTIONS[humans + k].color}"></span>🤖 ${CQ.FACTIONS[humans + k].name}<span class="tag">בוט</span></li>`).join('');
    $('hostCtl').classList.toggle('hidden', !MP.isHost);
    $('waitHost').classList.toggle('hidden', MP.isHost);
    seg('lobFill', [2, 3, 4, 5, 6, 7, 8].filter(n => n >= fillMin).map(n => [n, String(n)]), MP.cfg.fill, v => { MP.cfg.fill = v; sendLobby(); });
    seg('lobDiff', CQ.DIFF.map((d, i) => [i, d.name]), MP.cfg.diff, v => { MP.cfg.diff = v; sendLobby(); });
  }
  function hostStart() {
    const list = memberList().slice(0, 8);
    const n = Math.max(MP.cfg.fill, list.length, 2);
    const players = list.map(m => ({ name: m.name, bot: false, uid: m.uid }));
    for (let i = players.length; i < n; i++) players.push({ name: CQ.FACTIONS[i].name, bot: true });
    MP.gameCfg = { seed: (Math.random() * 2 ** 31) >>> 0, diff: MP.cfg.diff, players };
    MP.gid = Math.random().toString(36).slice(2, 10);
    MP.started = true; MP.away = new Set(); MP.epoch++;
    startGame(MP.gameCfg, players.findIndex(p => p.uid === UID));
    sendLobby();
  }

  /* ---------- תגובות מהירות ---------- */
  const EMOS = ['👍', '😂', '😡', '🔥', '🤝', '🏳️'];
  let lastEmo = 0;
  $('emoBar').innerHTML = EMOS.map(e => `<button>${e}</button>`).join('');
  $('emoBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (now() - lastEmo < 1500) return; lastEmo = now();
    MP.send('emo', { uid: UID, e: b.textContent }); showEmote(UID, b.textContent);
    $('emoBar').classList.add('hidden');
  });
  $('emoBtn').onclick = () => $('emoBar').classList.toggle('hidden');
  function showEmote(uid, e) {
    if (!EMOS.includes(e)) return;
    const i = G ? G.players.findIndex(p => p.uid === uid) : -1;
    const m = MP.members.get(uid); const name = i >= 0 ? G.players[i].name : (m ? m.name : '');
    toast(`${name}: ${e}`, 2200);
    if (i >= 0 && MAP) {
      const r = G.regions.find(x => x.owner === i && x.capital) || G.regions.find(x => x.owner === i);
      if (r) FX.floats.push({ x: MAP.pts[r.id].x, y: MAP.pts[r.id].y - 55, t: 2.2, txt: e, c: '#fff' });
    }
  }

  /* ---------- כפתורי תפריטים ---------- */
  function seg(id, opts, cur, on) {
    const el = $(id);
    el.innerHTML = opts.map(([v, t]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${t}</button>`).join('');
    el.onclick = e => { const b = e.target.closest('button'); if (!b) return; on(+b.dataset.v); };
  }
  function renderSolo() {
    seg('soloCount', [2, 3, 4, 5, 6, 7, 8].map(n => [n, String(n)]), soloCfg.n, v => { soloCfg.n = v; store.set('cq_solo', soloCfg); renderSolo(); });
    seg('soloDiff', CQ.DIFF.map((d, i) => [i, d.name]), soloCfg.diff, v => { soloCfg.diff = v; store.set('cq_solo', soloCfg); renderSolo(); });
  }
  function needName() {
    const n = cleanName($('nameIn').value);
    if (!n) { $('nameIn').focus(); $('nameIn').style.borderColor = '#e8504a'; toast('כתוב שם קודם'); return false; }
    store.set('td_playerName', n); return true;
  }
  $('nameIn').value = cleanName(store.get('td_playerName', ''));
  $('nameIn').addEventListener('input', () => { $('nameIn').style.borderColor = ''; });
  $('soloBtn').onclick = () => { if (!needName()) return; renderSolo(); show('scrSolo'); };
  $('soloGo').onclick = soloStart;
  $('hostBtn').onclick = () => { if (!needName()) return; mpEnter(newCode(), true); };
  $('joinBtn').onclick = () => {
    if (!needName()) return;
    const c = $('codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) { toast('קוד חדר: 4 תווים'); return; }
    mpEnter(c, false);
  };
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
  $('howBtn').onclick = () => { backTo = 'scrMenu'; show('scrHow'); };
  $('boardBtn').onclick = () => {
    show('scrBoard');
    $('boardList').innerHTML = '<li>טוען…</li>';
    NET.leaderboard().then(rows => {
      $('boardList').innerHTML = rows.length ? rows.map((r, i) => `<li class="${r.device === DEVICE ? 'me' : ''}"><span class="n">${i + 1}</span>${esc(r.name)}<span class="w">${r.wins} 🏆</span><span class="tag">${r.games} משחקים</span></li>`).join('')
        : '<li>עדיין אין משחקים. תהיה הראשון!</li>';
    }).catch(() => { $('boardList').innerHTML = '<li>אין חיבור לשרת כרגע</li>'; });
  };
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show(backTo));
  $('shareBtn').onclick = () => {
    const url = roomLink(MP.code), text = `בוא לשחק איתי כיבוש הממלכות! חדר ${MP.code}`;
    if (navigator.share) navigator.share({ title: 'כיבוש הממלכות', text, url }).catch(() => {});
    else copy(url, 'הקישור הועתק');
  };
  $('copyBtn').onclick = () => copy(MP.code, 'הקוד הועתק');
  function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg), () => toast(t, 4000)); }
  $('startBtn').onclick = () => { if (MP.isHost) hostStart(); };
  $('leaveBtn').onclick = () => { mpLeave(); mode = 'menu'; G = null; show('scrMenu'); startIdle(); };
  $('muteBtn').onclick = () => { muted = !muted; store.set('cq_muted', muted); $('muteBtn').textContent = muted ? '🔇' : '🔊'; };
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
  $('pauseBtn').onclick = () => {
    if (!G) return;
    if (mode === 'solo') paused = true;
    $('pauseTitle').textContent = mode === 'solo' ? '⏸ הפסקה' : '☰ תפריט';
    $('resumeBtn').textContent = mode === 'solo' ? 'המשך' : 'חזרה למשחק';
    $('quitBtn').textContent = mode === 'solo' ? 'יציאה לתפריט' : 'עזיבת החדר';
    show('scrPause');
  };
  $('resumeBtn').onclick = () => { paused = false; lastFrame = performance.now(); show(null); };
  $('quitBtn').onclick = () => { if (mode === 'mp') mpLeave(); paused = false; mode = 'menu'; G = null; show('scrMenu'); startIdle(); };
  $('againBtn').onclick = () => {
    if (mode === 'solo') soloStart();
    else if (MP.isHost) { MP.epoch++; backToLobby(); sendLobby(); }
    else { G = null; MAP = null; clearTimeout(endTimer); lobbyKey = ''; show('scrLobby'); renderLobby(); }
  };
  $('endMenuBtn').onclick = () => { if (mode === 'mp') mpLeave(); mode = 'menu'; G = null; show('scrMenu'); startIdle(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'solo' && G && !G.over && !paused) $('pauseBtn').click();
    if (!document.hidden) { lastFrame = performance.now(); MP.hostSeen = Date.now(); }
  });
  window.addEventListener('pagehide', () => { if (MP.net) MP.send('bye', { uid: UID }); });

  /* ---------- רקע לתפריט ---------- */
  let idleMap = false;
  function startIdle() {
    const g = CQ.createGame({ seed: 4242, players: Array.from({ length: 4 }, () => ({ bot: true })), diff: 1 });
    for (let i = 0; i < 900; i++) CQ.step(g, 0.1, true, () => 0.5);
    const save = G; G = g; MAP = CQ.buildMap(g.seed, 4); shade = null; renderTerritory(); G = save; MAP = save ? MAP : null;
    idleMap = true; terrSig = '';
  }

  /* ---------- אתחול ---------- */
  resize();
  startIdle();
  show('scrMenu');
  const roomParam = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (roomParam) {
    $('codeIn').value = roomParam;
    if (cleanName(store.get('td_playerName', ''))) mpEnter(roomParam, false);
    else { $('nameIn').focus(); toast('כתוב שם ולחץ "הצטרף"', 3000); }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  requestAnimationFrame(frame);

  // לבדיקות אוטומטיות
  window.__cq = { get G() { return G; }, get me() { return me; }, get MP() { return MP; }, issueOrder, doUpgrade, cam, sx, sy };
})();
