// מהמדורה למעצמה — ציור המפה, מגע, לוחות ושמירה.
(function () {
  'use strict';
  const E = window.FireEngine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SAVE = 'fire_save_v1';

  /* ---------- שמירה ---------- */
  function load() { try { const v = localStorage.getItem(SAVE); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* מצב פרטי */ } }

  let S = load();
  let fresh = false;
  if (!S || S.v !== 1) { S = E.newGame(Date.now()); fresh = true; }

  /* ---------- עזרי תצוגה ---------- */
  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + ' ד׳';
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 100) return h + ' שע׳' + (m && h < 10 ? ' ' + m + ' ד׳' : '');
    const d = Math.floor(h / 24), hh = h % 24;
    return d + (d === 1 ? ' יום' : ' ימים') + (hh ? ' ' + hh + ' שע׳' : '');
  }
  const minsLeft = t => (t - S.t) / E.MIN;
  const resTxt = (c, mark) => Object.entries(c).map(([k, v]) => {
    const no = mark && S.res[k] < v; return `<span class="${no ? 'no' : ''}">${E.RES[k].i}${Math.ceil(v)}</span>`;
  }).join(' ');
  const yieldsTxt = y => Object.entries(y).filter(([, v]) => v >= 0.5).map(([k, v]) => E.RES[k].i + Math.round(v)).join(' ') || '—';
  function toast(msg, kind) {
    const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 400); }, 2600);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } };

  /* ---------- זמן ---------- */
  function tick(showSummary) {
    const r = E.advance(S, Date.now());
    if (showSummary && r.minutes >= 3) welcomeBack(r);
    else if (r.events) r.events.filter(e => e.k === 'bad' || e.k === 'level' || e.k === 'good').slice(-2).forEach(e => toast(e.msg, e.k));
    if (r.minutes) { save(); refreshHud(); if (sheet.open && !sheet.noAuto) renderSheet(); }
    if (S.over) gameOver();
  }

  /* ---------- מצלמה ומגע ---------- */
  const cv = $('c'), ctx = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1;
  const cam = { x: 0, y: 0, view: 2.6 }; // view = כמה יחידות עולם מהמרכז לקצה הקצר
  let scale = 100, CX = 0, CY = 0;
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = innerWidth; VH = innerHeight;
    cv.width = VW * DPR; cv.height = VH * DPR;
    dark.width = Math.ceil(VW / 2); dark.height = Math.ceil(VH / 2);
  }
  addEventListener('resize', resize); resize();
  function layout() {
    const top = $('top').getBoundingClientRect().bottom, bot = VH - $('nav').getBoundingClientRect().top;
    const sheetH = sheet.open ? $('sheet').getBoundingClientRect().height : 0;
    const h = VH - top - bot - sheetH;
    scale = Math.min(VW, Math.max(140, h)) / 2 / cam.view;
    CX = VW / 2; CY = top + Math.max(140, h) / 2;
  }
  const toScreen = (x, y) => [CX + (x - cam.x) * scale, CY + (y - cam.y) * scale];
  const toWorld = (px, py) => [(px - CX) / scale + cam.x, (py - CY) / scale + cam.y];

  const ptrs = new Map(); let drag = null, pinch = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), v: cam.view }; drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      cam.view = clamp(pinch.v * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 1.2, 9);
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 8) drag.moved = true;
      if (drag.moved) { cam.x = clamp(drag.cx - dx / scale, -12, 12); cam.y = clamp(drag.cy - dy / scale, -12, 12); }
    }
  });
  const up = e => {
    const wasTap = drag && !drag.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (wasTap) onTap(e.clientX, e.clientY);
    if (!ptrs.size) drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.view = clamp(cam.view * (e.deltaY > 0 ? 1.1 : 0.9), 1.2, 9); }, { passive: false });

  let placing = null; // סוג מבנה שמציבים
  function onTap(px, py) {
    const [x, y] = toWorld(px, py);
    if (placing) {
      const err = E.build(S, placing, x, y);
      if (err) { toast(err, 'bad'); buzz(40); } else { toast(`${E.BUILD[placing].i} ${E.BUILD[placing].n} נבנה/תה`, 'good'); placing = null; $('placeBar').classList.add('hidden'); save(); refreshHud(); }
      return;
    }
    const hitR = 22 / scale;
    if (Math.hypot(x, y) < Math.max(0.3, hitR)) return openSheet('fire');
    const site = S.sites.filter(o => o.seen).map(o => [o, Math.hypot(o.x - x, o.y - y)]).filter(([, d]) => d < Math.max(0.3, hitR)).sort((a, b) => a[1] - b[1])[0];
    if (site) return openSheet('site', { id: site[0].id });
    const b = S.buildings.find(o => Math.hypot(o.x - x, o.y - y) < Math.max(0.25, hitR));
    if (b) { const d = E.BUILD[b.type]; toast(`${d.i} ${d.n} — ${d.d}${E.isLit(S, b.x, b.y) ? '' : ' · ⚠️ מחוץ לאור!'}`); return; }
    if (!E.isLit(S, x, y)) return openSheet('explore', { x, y });
    closeSheet();
  }

  /* ---------- ציור ---------- */
  const flames = [], eyes = [];
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    layout();
    const c = ctx; c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = '#0d0b08'; c.fillRect(0, 0, VW, VH);
    const R = E.lightR(S), nowMs = Date.now();
    // קרקע
    const [fx, fy] = toScreen(0, 0);
    const g = c.createRadialGradient(fx, fy, 0, fx, fy, R * scale * 1.05);
    g.addColorStop(0, '#5a4128'); g.addColorStop(0.5, '#3a2c1c'); g.addColorStop(1, '#1d170f');
    c.fillStyle = g; c.beginPath(); c.arc(fx, fy, R * scale * 1.3, 0, 7); c.fill();
    S.torches.forEach(t => { const [tx, ty] = toScreen(t.x, t.y); const tg = c.createRadialGradient(tx, ty, 0, tx, ty, 1.1 * scale); tg.addColorStop(0, '#4a3520'); tg.addColorStop(1, 'rgba(29,23,15,0)'); c.fillStyle = tg; c.beginPath(); c.arc(tx, ty, 1.1 * scale, 0, 7); c.fill(); });
    // מסלולי משלחות
    c.setLineDash([4, 6]); c.lineWidth = 1.5;
    S.exps.forEach(e => { const [ex, ey] = toScreen(e.x, e.y); c.strokeStyle = e.kind === 'explore' ? 'rgba(90,169,230,.5)' : 'rgba(255,204,102,.45)'; c.beginPath(); c.moveTo(fx, fy); c.lineTo(ex, ey); c.stroke(); });
    c.setLineDash([]);
    // מקומות
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const siteFont = Math.round(clamp(scale * 0.32, 16, 34));
    S.sites.forEach(o => {
      if (!o.seen) return;
      const [sx, sy] = toScreen(o.x, o.y);
      if (sx < -40 || sy < -40 || sx > VW + 40 || sy > VH + 40) return;
      const lit = E.isLit(S, o.x, o.y, R);
      c.globalAlpha = o.stock < 5 ? 0.25 : 1;
      c.font = siteFont + 'px serif'; c.fillText(E.SITES[o.type].i, sx, sy);
      c.globalAlpha = 1;
      if (lit) { c.fillStyle = 'rgba(0,0,0,.5)'; const w = siteFont * 1.2; c.fillRect(sx - w / 2, sy + siteFont * 0.6, w, 4); c.fillStyle = '#7fc76b'; c.fillRect(sx - w / 2, sy + siteFont * 0.6, w * o.stock / o.max, 4); }
    });
    // מבנים
    S.buildings.forEach(b => { const [bx, by] = toScreen(b.x, b.y); c.font = Math.round(siteFont * 0.95) + 'px serif'; c.fillText(E.BUILD[b.type].i, bx, by); });
    // לפידים
    S.torches.forEach(t => { const [tx, ty] = toScreen(t.x, t.y); c.font = '16px serif'; c.fillText('🔥', tx, ty - 4); });
    // חושך
    const dw = dark.width, dh = dark.height, k = 0.5;
    dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, dw, dh);
    dctx.fillStyle = 'rgba(3,3,8,.94)'; dctx.fillRect(0, 0, dw, dh);
    dctx.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(now / 130) * 0.012 + Math.sin(now / 57) * 0.008;
    const hole = (x, y, r) => { const gg = dctx.createRadialGradient(x * k, y * k, r * k * 0.55, x * k, y * k, r * k); gg.addColorStop(0, 'rgba(0,0,0,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); dctx.fillStyle = gg; dctx.beginPath(); dctx.arc(x * k, y * k, r * k, 0, 7); dctx.fill(); };
    hole(fx, fy, R * scale * 1.18 * flick);
    S.torches.forEach(t => { const [tx, ty] = toScreen(t.x, t.y); hole(tx, ty, 1.25 * scale); });
    c.drawImage(dark, 0, 0, VW, VH);
    // מקומות ידועים בחושך — צלליות
    c.globalAlpha = 0.45;
    S.sites.forEach(o => { if (!o.seen || E.isLit(S, o.x, o.y, R) || o.stock < 5) return; const [sx, sy] = toScreen(o.x, o.y); c.font = siteFont + 'px serif'; c.fillText(E.SITES[o.type].i, sx, sy); });
    S.buildings.forEach(b => { if (E.isLit(S, b.x, b.y, R)) return; const [bx, by] = toScreen(b.x, b.y); c.font = Math.round(siteFont * 0.95) + 'px serif'; c.fillText(E.BUILD[b.type].i, bx, by); c.fillText('⚠️', bx + siteFont * 0.6, by - siteFont * 0.5); });
    c.globalAlpha = 1;
    // עיניים באפלה
    if (Math.random() < dt * 0.7 && eyes.length < 6) { const a = Math.random() * 6.28, d = R + 0.4 + Math.random() * 1.5; eyes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, life: 0, max: 1.5 + Math.random() * 2 }); }
    for (let i = eyes.length - 1; i >= 0; i--) {
      const e = eyes[i]; e.life += dt; if (e.life > e.max) { eyes.splice(i, 1); continue; }
      const blink = (e.life % 1.3) < 0.08 ? 0 : 1, al = Math.min(1, e.life * 2, (e.max - e.life) * 2) * blink;
      const [ex, ey] = toScreen(e.x, e.y); c.fillStyle = `rgba(255,${120 + (i * 30) % 80},40,${al * 0.85})`;
      c.beginPath(); c.arc(ex - 4, ey, 2, 0, 7); c.arc(ex + 4, ey, 2, 0, 7); c.fill();
    }
    // אנשים במשלחות
    S.exps.forEach(e => {
      const t = nowMs, out = e.start + e.travel, back = out + e.work;
      let f; if (t < out) f = (t - e.start) / e.travel; else if (t < back) f = 1; else f = 1 - (t - back) / e.travel;
      f = clamp(f, 0, 1);
      e.people.forEach((id, i) => {
        const p = S.people.find(q => q.id === id); if (!p) return;
        const ang = Math.atan2(e.y, e.x) + (i - (e.people.length - 1) / 2) * 0.12;
        const dd = Math.hypot(e.x, e.y) * f + (f === 1 ? Math.sin(now / 300 + i) * 0.08 : 0);
        drawPerson(c, ...toScreen(Math.cos(ang) * dd, Math.sin(ang) * dd), p, e.kind === 'explore');
      });
    });
    // אנשים בבית — סביב המדורה
    const home = S.people.filter(p => !p.exp);
    home.forEach((p, i) => { const a = i / Math.max(1, home.length) * 6.28 + now / 20000, d = 0.3 + (i % 2) * 0.08; drawPerson(c, ...toScreen(Math.cos(a) * d, Math.sin(a) * d), p); });
    // מדורה
    drawFire(c, fx, fy, dt, now);
    requestAnimationFrame(frame);
  }
  function drawPerson(c, x, y, p, scout) {
    c.fillStyle = p.hp <= 4 ? '#e2553d' : scout ? '#5aa9e6' : '#f3e9dc';
    c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
    c.strokeStyle = '#000a'; c.lineWidth = 1.5; c.stroke();
    const td = E.toolDef(S, p); if (td) { c.font = '12px serif'; c.fillText(td.i, x + 8, y - 7); }
  }
  function drawFire(c, x, y, dt, now) {
    const lvl = S.level, fuel = S.fuel, size = (10 + lvl * 1.6) * (fuel > 0 ? 0.6 + 0.4 * Math.min(1, fuel / E.fuelMax(S)) : 0.3);
    // אבנים
    c.fillStyle = '#6b6158';
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; c.beginPath(); c.arc(x + Math.cos(a) * size * 1.1, y + Math.sin(a) * size * 0.55 + 6, 4, 0, 7); c.fill(); }
    if (fuel > 0) {
      for (let i = 0; i < 3; i++) flames.push({ x: (Math.random() - 0.5) * size, y: 4, vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 40, life: 0, max: 0.5 + Math.random() * 0.5, r: size * (0.4 + Math.random() * 0.4) });
    }
    c.globalCompositeOperation = 'lighter';
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i]; f.life += dt; if (f.life > f.max) { flames.splice(i, 1); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt * (size / 18); const k = 1 - f.life / f.max;
      c.fillStyle = `rgba(255,${Math.round(90 + 140 * k)},${Math.round(30 * k)},${0.35 * k})`;
      c.beginPath(); c.arc(x + f.x, y + f.y, f.r * k + 1, 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    if (flames.length > 260) flames.splice(0, flames.length - 260);
    // מונה אש מעל המדורה, זמן מתחת
    const hrs = fuel / E.burnRate(S);
    const top = `🔥 ${Math.floor(fuel)}/${E.fuelMax(S)}`, bot = `⏳ ${fmtDur(hrs * 60)}`;
    c.font = 'bold 14px system-ui'; c.textAlign = 'center';
    const pill = (txt, yy, col) => { const w = c.measureText(txt).width + 16; c.fillStyle = 'rgba(20,14,9,.85)'; c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, yy - 11, w, 22, 11) : c.rect(x - w / 2, yy - 11, w, 22); c.fill(); c.fillStyle = col; c.fillText(txt, x, yy + 1); };
    pill(top, y - size - 30, fuel / E.fuelMax(S) < 0.25 ? '#ff8a70' : '#ffcc66');
    pill(bot, y + size + 22, hrs < 6 ? '#ff8a70' : '#f3e9dc');
  }

  /* ---------- HUD ---------- */
  function refreshHud() {
    $('lvlTxt').textContent = `🔥 רמה ${S.level} · ${E.LEVELS[S.level].n}`;
    const home = S.people.filter(p => !p.exp).length;
    $('popTxt').textContent = `${home}/${S.people.length}`;
    const net = E.foodProd(S) - E.foodRate(S);
    $('foodTxt').textContent = net >= 0 ? '+' + net.toFixed(1) + '/ש׳' : fmtDur(S.res.food / -net * 60);
    $('foodChip').title = 'מזון: ' + (net >= 0 ? 'עודף' : 'מספיק ל-' + fmtDur(S.res.food / -net * 60));
    $('resbar').innerHTML = E.RES_KEYS.filter(k => S.res[k] >= 1 || ['wood', 'stone', 'fiber', 'food'].includes(k))
      .map(k => `<span class="chip">${E.RES[k].i} <b>${Math.floor(S.res[k])}</b></span>`).join('')
      + (S.dogs ? `<span class="chip">🐕 <b>${S.dogs}</b></span>` : '') + (S.horses ? `<span class="chip">🐎 <b>${S.horses}</b></span>` : '') + (S.carts ? `<span class="chip">🛒 <b>${S.carts}</b></span>` : '');
    const al = [];
    if (S.fuel <= 0) al.push('🌑 האש כבתה — הכפר חשוף! הוסיפו עץ');
    else if (S.fuel / E.burnRate(S) < 6) al.push(`🔥 האש תכבה בעוד ${fmtDur(S.fuel / E.burnRate(S) * 60)}`);
    if (S.starving) al.push('🍂 אין מזון — האנשים רעבים ונחלשים');
    else if (net < 0 && S.res.food / -net < 6) al.push(`🍖 המזון ייגמר בעוד ${fmtDur(S.res.food / -net * 60)}`);
    const exposed = S.buildings.filter(b => !E.isLit(S, b.x, b.y)).length;
    if (exposed) al.push(`⚠️ ${exposed} מבנים מחוץ לאור — חשופים לאויבים`);
    $('alerts').innerHTML = al.map(a => `<div class="alert">${esc(a)}</div>`).join('');
  }

  /* ---------- גיליון תחתון ---------- */
  const sheet = { open: false, kind: null, arg: null, noAuto: false };
  const ui = { sel: new Set(), dogs: 0, horses: 0, carts: 0, loop: true, torch: true, slots: Array(9).fill(null) };
  function openSheet(kind, arg) {
    if (sheet.kind !== kind || JSON.stringify(sheet.arg) !== JSON.stringify(arg || null)) {
      if (kind === 'site' || kind === 'explore') { ui.sel = new Set(); ui.dogs = 0; ui.horses = 0; ui.carts = 0; }
    }
    sheet.open = true; sheet.kind = kind; sheet.arg = arg || null;
    sheet.noAuto = kind === 'craft';
    $('sheet').classList.remove('hidden');
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === kind));
    renderSheet();
  }
  function closeSheet() {
    sheet.open = false; sheet.kind = null; $('sheet').classList.add('hidden');
    document.querySelectorAll('#nav button').forEach(b => b.classList.remove('on'));
  }
  $('sheetClose').onclick = closeSheet;
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => sheet.kind === b.dataset.tab ? closeSheet() : openSheet(b.dataset.tab));
  $('lvlBtn').onclick = () => openSheet('fire');
  $('popChip').onclick = () => openSheet('people');
  $('foodChip').onclick = () => openSheet('people');

  function renderSheet() {
    if (!sheet.open) return;
    const body = $('sheetBody'), keep = body.scrollTop;
    const R = RENDER[sheet.kind];
    const out = R(sheet.arg || {});
    $('sheetTitle').textContent = out.title;
    body.innerHTML = out.html;
    if (out.bind) out.bind(body);
    body.scrollTop = keep;
  }
  const on = (root, sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', ev => { fn(el, ev); }));
  function act(fn) { const err = fn(); if (err) { toast(err, 'bad'); buzz(40); } save(); refreshHud(); renderSheet(); return !err; }

  function peoplePicker() {
    const idle = E.idle(S);
    if (!idle.length) return '<p class="muted">כל האנשים בחוץ. אפשר לחכות שיחזרו או להחזיר משלחת מלשונית "שבט".</p>';
    const animals = [['dogs', '🐕', E.homeDogs(S)], ['horses', '🐎', S.horses - S.exps.reduce((a, e) => a + (e.horses || 0), 0)], ['carts', '🛒', S.carts - S.exps.reduce((a, e) => a + (e.carts || 0), 0)]]
      .filter(([, , n]) => n > 0);
    return `<h3>מי יוצא?</h3><ul class="list">${idle.map(p => {
      const td = E.toolDef(S, p);
      return `<li class="item spread pick ${ui.sel.has(p.id) ? 'sel' : ''}" data-id="${p.id}"><span><b>${ui.sel.has(p.id) ? '✅' : '⬜'} ${esc(p.name)}</b> <span class="tag">${td ? td.i + ' ' : ''}${esc(E.profession(S, p))}</span></span>
        <span class="hp"><i class="${p.hp <= 4 ? 'low' : ''}" style="width:${p.hp * 10}%"></i></span></li>`;
    }).join('')}</ul>
    ${animals.length ? `<div class="row" style="margin-top:8px">${animals.map(([k, i, n]) => `<span class="stepper">${i}<button data-an="${k}" data-d="-1">−</button><b>${Math.min(ui[k], n)}</b><button data-an="${k}" data-d="1">+</button><span class="muted">/${n}</span></span>`).join('')}</div>` : ''}`;
  }
  function bindPicker(body) {
    on(body, '.pick', el => { const id = +el.dataset.id; ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id); renderSheet(); });
    on(body, '[data-an]', el => { const k = el.dataset.an; ui[k] = Math.max(0, ui[k] + +el.dataset.d); renderSheet(); });
  }
  function riskBox(r) {
    if (!r) return '';
    const pct = Math.round(r.p * 100), cls = r.lit ? 'safe' : r.def >= r.pow * 1.3 ? 'mid' : 'high';
    return `<div class="risk ${cls}">${r.lit ? '☀️ באור — כמעט בטוח' : '🌑 בחושך'} · סיכוי להיתקל ביצורים: <b>${pct}%</b>
      ${r.lit ? '' : `<br>עוצמת יצורים ~${Math.round(r.pow)} מול הגנת המשלחת ${r.def}${r.def < r.pow ? ' — מסוכן! קחו שומר (חנית/קשת) או כלב' : ''}`}</div>`;
  }

  const RENDER = {
    fire() {
      const max = E.fuelMax(S), burn = E.burnRate(S), hrs = S.fuel / burn, chk = E.upgradeCheck(S), L = E.LEVELS[S.level];
      const stockH = (S.res.wood + S.res.charcoal * 4) / burn;
      const road = [[S.level, E.LEVELS[S.level].n], ...E.LEVELS.slice(S.level + 1).filter(Boolean).map((l, i) => [S.level + 1 + i, l.n]), ...E.ROADMAP];
      return {
        title: `🔥 המדורה — רמה ${S.level}: ${L.n}`,
        html: `<div class="spread"><span class="big">${Math.floor(S.fuel)}/${max}</span><span class="muted">שורפת ${burn.toFixed(2)} לשעה</span></div>
          <div class="bar"><i style="width:${S.fuel / max * 100}%"></i></div>
          <p>⏳ האש מספיקה ל-<b>${fmtDur(hrs * 60)}</b>${S.auto ? ` · עם המלאי בתיבה: עוד <b>${fmtDur(stockH * 60)}</b>` : ''}</p>
          <p class="muted">רדיוס האור: ${E.lightR(S).toFixed(1)} · כשהאש יורדת, האור מצטמצם ומה שבחוץ חשוף לאויבים.</p>
          <label class="tog"><input type="checkbox" id="autoT" ${S.auto ? 'checked' : ''}> הזנה אוטומטית מהתיבה (עץ, ופחם אם יש)</label>
          <div class="row" style="margin-top:8px">
            <button class="btn small" data-feed="wood" data-n="10">+10 🪵</button>
            <button class="btn small" data-feed="wood" data-n="999">מלא 🪵</button>
            ${S.res.charcoal >= 1 ? '<button class="btn small" data-feed="charcoal" data-n="999">מלא ⚫ (פחם=4)</button>' : ''}
          </div>
          <h3>🔺 הגדלת האש — רמה ${S.level + 1}${E.LEVELS[S.level + 1] ? ': ' + E.LEVELS[S.level + 1].n : ''}</h3>
          ${L.up ? `<div class="cost">דרוש: ${resTxt(L.up, true)} · 👥 <span class="${S.people.length < L.pop ? 'no' : ''}">${S.people.length}/${L.pop}</span></div>
          <p class="muted">אש גדולה יותר = יותר אור, יותר דלק במדורה (וגם שורפת יותר), מחקרים ומבנים חדשים.</p>
          <button class="btn wide" id="upBtn" ${chk.ok ? '' : 'disabled'}>🔥 הגדל את האש</button>` : '<p>הגעתם לסוף הגרסה הנוכחית. רמות 11–50 יגיעו בהמשך.</p>'}
          <h3>🗺️ הדרך לטירת ה-AI (רמה 50)</h3>
          <div class="road">${road.map(([n, t]) => `<span class="${n === S.level ? 'now' : ''}">${n}·${esc(t)}</span>`).join('')}</div>`,
        bind(b) {
          b.querySelector('#autoT').onchange = e => { S.auto = e.target.checked; save(); };
          on(b, '[data-feed]', el => act(() => { const n = E.feed(S, el.dataset.feed, +el.dataset.n); return n ? null : 'המדורה מלאה או שאין מספיק'; }));
          const ub = b.querySelector('#upBtn'); if (ub) ub.onclick = () => { if (act(() => E.upgrade(S))) { buzz([30, 40, 30]); toast(`🔥 רמה ${S.level}: ${E.LEVELS[S.level].n}!`, 'good'); } };
        },
      };
    },
    site({ id }) {
      const o = S.sites.find(x => x.id === id); if (!o) return { title: 'לא נמצא', html: '' };
      const d = E.SITES[o.type], lit = E.isLit(S, o.x, o.y);
      const plan = ui.sel.size ? E.planGather(S, o.id, [...ui.sel], ui) : null;
      const here = S.exps.filter(e => e.site === o.id);
      return {
        title: `${d.i} ${d.n}`,
        html: `<div class="muted">מרחק ${o.d.toFixed(1)} · ${lit ? '☀️ באור' : '🌑 בחושך'} · נשאר ${Math.floor(o.stock)}/${o.max}${d.regen ? ' (מתחדש)' : ''}</div>
          <div class="cost">מה יש כאן: ${d.y.map(([r]) => E.RES[r].i + ' ' + E.RES[r].n).join(', ')}</div>
          ${d.req && !E.has(S, d.req) ? `<p class="muted">🔒 צריך מחקר: ${E.RESEARCH_BY[d.req].n}</p>` : ''}
          ${here.length ? `<p>🚶 ${here.map(e => e.people.length).reduce((a, b) => a + b, 0)} אנשים עובדים כאן עכשיו</p>` : ''}
          ${peoplePicker()}
          ${plan && !plan.err ? `<div class="item" style="margin-top:8px">⏱ סבב: <b>${fmtDur(plan.total)}</b> (הליכה ${fmtDur(plan.travel)} לכל כיוון)<br>🎒 מביאים: <b>${yieldsTxt(plan.yields)}</b> <span class="muted">(משא ${plan.cap})</span>${riskBox(plan.risk)}</div>` : plan ? `<p class="cost"><span class="no">${esc(plan.err)}</span></p>` : ''}
          <label class="tog" style="margin-top:8px"><input type="checkbox" id="loopT" ${ui.loop ? 'checked' : ''}> 🔁 לחזור שוב ושוב (ממשיך גם כשהמשחק סגור)</label>
          <button class="btn wide" id="goBtn" ${plan && !plan.err ? '' : 'disabled'}>שלחו משלחת</button>`,
        bind(b) {
          bindPicker(b);
          b.querySelector('#loopT').onchange = e => { ui.loop = e.target.checked; };
          b.querySelector('#goBtn').onclick = () => { const pl = E.planGather(S, o.id, [...ui.sel], ui); if (act(() => E.start(S, pl, ui.loop))) { ui.sel.clear(); toast('🚶 המשלחת יצאה', 'good'); closeSheet(); } };
        },
      };
    },
    explore({ x, y }) {
      const plan = ui.sel.size ? E.planExplore(S, x, y, [...ui.sel], { dogs: ui.dogs, torch: ui.torch }) : null;
      const canTorch = E.has(S, 'torches');
      return {
        title: '🔦 חקר החושך',
        html: `<p class="muted">מרחק ${Math.hypot(x, y).toFixed(1)} מהמדורה. החוקרים יגלו מקומות במרחק ${plan && !plan.err ? plan.scout.toFixed(1) : '1.6'} סביב הנקודה.${canTorch ? ' לפיד שמוצב שם מאיר את האזור ל-48 שעות.' : ' (מחקר "לפידים" יאפשר להציב לפידים)'}</p>
          ${peoplePicker()}
          ${canTorch ? `<label class="tog" style="margin-top:8px"><input type="checkbox" id="torchT" ${ui.torch ? 'checked' : ''}> 🔥 להציב לפיד (יש ${Math.floor(S.res.torch)})</label>` : ''}
          ${plan && !plan.err ? `<div class="item" style="margin-top:8px">⏱ <b>${fmtDur(plan.total)}</b>${plan.torch ? ' · מציבים לפיד' : ''}${riskBox(plan.risk)}</div>` : plan ? `<p class="cost"><span class="no">${esc(plan.err)}</span></p>` : ''}
          <button class="btn wide" id="goBtn" ${plan && !plan.err ? '' : 'disabled'}>צאו לחקור</button>`,
        bind(b) {
          bindPicker(b);
          const tt = b.querySelector('#torchT'); if (tt) tt.onchange = e => { ui.torch = e.target.checked; renderSheet(); };
          b.querySelector('#goBtn').onclick = () => { const pl = E.planExplore(S, x, y, [...ui.sel], { dogs: ui.dogs, torch: ui.torch }); if (act(() => E.start(S, pl, false))) { ui.sel.clear(); toast('🔦 החוקרים יצאו לחושך', 'good'); closeSheet(); } };
        },
      };
    },
    people() {
      const free = S.tools.filter(t => !S.people.some(p => p.tool === t.id));
      const net = E.foodProd(S) - E.foodRate(S);
      return {
        title: `👥 השבט (${S.people.length}/${E.housing(S)} מגורים)`,
        html: `<div class="cost">🍖 אוכלים ${E.foodRate(S).toFixed(1)} לשעה · מייצרים ${E.foodProd(S).toFixed(1)} · ${net >= 0 ? 'עודף' : 'מזון ל-' + fmtDur(S.res.food / -net * 60)}</div>
          <p class="muted">צוותו כלי לאדם והוא הופך לבעל מקצוע. את הכלים יוצרים בתיבה.</p>
          <ul class="list">${S.people.map(p => {
            const e = S.exps.find(x => x.id === p.exp);
            const where = e ? (e.kind === 'explore' ? '🔦 חוקר' : '🚶 ' + E.SITES[S.sites.find(x => x.id === e.site).type].n) + ` · חוזר בעוד ${fmtDur(minsLeft(e.end))}${e.loop ? ' 🔁' : ''}` : '🔥 ליד המדורה';
            const t = E.toolOf(S, p);
            const opts = [`<option value="">ללא כלי</option>`].concat((t ? [t] : []).concat(free).map(x => `<option value="${x.id}" ${t && t.id === x.id ? 'selected' : ''}>${E.TOOLS[x.type].i} ${E.TOOLS[x.type].n}${x.uses != null ? ' (' + x.uses + ')' : ''}</option>`));
            return `<li class="item"><div class="spread"><span class="t">${esc(p.name)} <span class="tag">${esc(E.profession(S, p))}</span></span><span class="hp"><i class="${p.hp <= 4 ? 'low' : ''}" style="width:${p.hp * 10}%"></i></span></div>
              <div class="spread" style="margin-top:4px"><span class="muted">${where}</span>
              ${e ? `<button class="btn alt small" data-recall="${e.id}">${e.loop ? 'עצור סבב' : 'החזר'}</button>` : `<select data-eq="${p.id}">${opts.join('')}</select>`}</div></li>`;
          }).join('')}</ul>
          ${free.length ? `<h3>כלים פנויים</h3><div class="row">${free.map(t => `<span class="tag">${E.TOOLS[t.type].i} ${E.TOOLS[t.type].n}</span>`).join('')}</div>` : ''}
          ${E.has(S, 'dogs') || E.has(S, 'horses') ? '<h3>🐾 חיות</h3>' : ''}
          ${Object.entries(E.ANIMALS).filter(([k]) => E.has(S, k)).map(([k, a]) => { const cap = a.cap(S); return `<div class="item spread"><span>${a.i} ${a.n}: <b>${S[k]}</b>/${cap} <span class="cost">${resTxt(a.cost, true)}</span></span><button class="btn small" data-buy="${k}" ${cap > S[k] ? '' : 'disabled'}>הוסף</button></div>`; }).join('')}
          ${E.has(S, 'dogs') ? '<p class="muted">🐕 כלבים ליד המדורה מגדילים את הטווח הבטוח ומגינים; כלב במשלחת מוסיף הגנה. 🐎 סוס נושא 25 משא נוסף.</p>' : ''}`,
        bind(b) {
          b.querySelectorAll('[data-eq]').forEach(sel => sel.onchange = () => act(() => E.equip(S, +sel.dataset.eq, sel.value ? +sel.value : null)));
          on(b, '[data-recall]', el => act(() => {
            const e = S.exps.find(x => x.id === +el.dataset.recall); if (!e) return null;
            if (e.loop) { e.loop = false; toast('הסבב ייעצר כשיחזרו'); return null; }
            E.recall(S, e.id); toast('המשלחת חזרה בלי שלל'); return null;
          }));
          on(b, '[data-buy]', el => act(() => E.buyAnimal(S, el.dataset.buy)));
        },
      };
    },
    craft() {
      const n = E.craftSlots(S), slots = ui.slots.slice(0, n);
      const used = {}; slots.forEach(k => { if (k) used[k] = (used[k] || 0) + 1; });
      const r = E.matchRecipe(S, slots), ok = r && E.has(S, r.req);
      const outIcon = r ? (E.TOOLS[r.out] || E.ITEMS[r.out]).i : '❔';
      const known = E.RECIPES.filter(x => E.has(S, x.req));
      const box = E.RES_KEYS.filter(k => k !== 'torch' && k !== 'food');
      return {
        title: '🧺 התיבה ויצירת כלים',
        html: `<p class="muted">הקישו על משאב כדי לשים אותו במשבצת, ועל משבצת כדי להוציא. שילוב נכון יוצר כלי.</p>
          <div class="box">${box.map(k => { const left = Math.floor(S.res[k]) - (used[k] || 0); return `<div class="cell ${left < 1 ? 'empty' : ''}" data-res="${k}">${E.RES[k].i}<small>${left}</small></div>`; }).join('')}</div>
          <div class="craft-area">
            <div class="grid ${n === 9 ? 'g9' : 'g4'}">${slots.map((k, i) => `<div class="slot ${k ? 'full' : ''}" data-slot="${i}">${k ? E.RES[k].i : ''}</div>`).join('')}</div>
            <div class="arrow">⬅</div>
            <div class="result ${ok ? 'ok' : r ? 'hint' : ''}">${slots.some(Boolean) ? outIcon : ''}</div>
          </div>
          <div class="row"><button class="btn" id="craftBtn" ${slots.some(Boolean) ? '' : 'disabled'}>✨ צור${ok ? ': ' + (E.TOOLS[r.out] || E.ITEMS[r.out]).n : ''}</button><button class="btn alt" id="clearBtn">נקה</button></div>
          ${n === 4 ? '<p class="muted">מחקר "סדנה" (רמה 4) פותח תיבת יצירה 3×3.</p>' : ''}
          <h3>📖 מתכונים ידועים</h3>
          ${known.length ? `<ul class="list">${known.map(x => { const d = E.TOOLS[x.out] || E.ITEMS[x.out]; const size = Object.values(x.in).reduce((a, b) => a + b, 0);
            return `<li class="item spread"><span>${d.i} <b>${d.n}</b>${d.prof ? ` <span class="tag">→ ${d.prof}</span>` : ''}<br><span class="cost">${resTxt(x.in, true)}</span></span><button class="btn small alt" data-fill="${E.RECIPES.indexOf(x)}" ${size > n ? 'disabled' : ''}>${size > n ? '3×3' : 'מלא'}</button></li>`; }).join('')}</ul>` : '<p class="muted">עוד לא ידוע אף מתכון. חקרו "כלי אבן" או "קליעה".</p>'}
          <h3>🧰 כלים בשבט</h3>
          <div class="row">${S.tools.length ? S.tools.map(t => { const owner = S.people.find(p => p.tool === t.id); return `<span class="tag">${E.TOOLS[t.type].i} ${E.TOOLS[t.type].n}${owner ? ' · ' + esc(owner.name) : ' · פנוי'}</span>`; }).join('') : '<span class="muted">אין עדיין</span>'}${S.res.torch >= 1 ? `<span class="tag">🔥 לפידים ×${Math.floor(S.res.torch)}</span>` : ''}</div>`,
        bind(b) {
          on(b, '[data-res]', el => { const k = el.dataset.res; if (Math.floor(S.res[k]) - (used[k] || 0) < 1) return; const i = ui.slots.slice(0, n).indexOf(null); if (i < 0) return toast('כל המשבצות מלאות'); ui.slots[i] = k; renderSheet(); });
          on(b, '[data-slot]', el => { ui.slots[+el.dataset.slot] = null; renderSheet(); });
          b.querySelector('#clearBtn').onclick = () => { ui.slots.fill(null); renderSheet(); };
          on(b, '[data-fill]', el => { const x = E.RECIPES[+el.dataset.fill]; ui.slots.fill(null); let i = 0; for (const k in x.in) for (let j = 0; j < x.in[k]; j++) ui.slots[i++] = k; renderSheet(); });
          b.querySelector('#craftBtn').onclick = () => {
            const res = E.craft(S, ui.slots.slice(0, n));
            if (res.err) { toast(res.err, res.hint ? '' : 'bad'); buzz(30); return; }
            toast('✨ ' + res.ok, 'good'); buzz(25); save(); refreshHud();
            // משאירים את המתכון במשבצות אם יש מספיק ליצירה נוספת
            const again = {}; ui.slots.slice(0, n).forEach(k => { if (k) again[k] = (again[k] || 0) + 1; });
            if (!E.canPay(S, again)) ui.slots.fill(null);
            renderSheet();
          };
        },
      };
    },
    research() {
      const cur = S.research.cur, curR = cur && E.RESEARCH_BY[cur.id];
      const groups = {}; E.RESEARCH.forEach(r => { (groups[r.lv] = groups[r.lv] || []).push(r); });
      return {
        title: '💡 מחקר',
        html: (cur ? `<div class="item"><b>חוקרים עכשיו: ${curR.n}</b> · נשאר ${fmtDur(minsLeft(cur.end))}<div class="bar blue" style="margin-top:6px"><i style="width:${(S.t - cur.start) / (cur.end - cur.start) * 100}%"></i></div></div>` : '<p class="muted">בחרו מחקר. מחקר אחד בכל פעם, והוא ממשיך גם כשהמשחק סגור.</p>')
          + Object.entries(groups).map(([lv, rs]) => `<h3>רמה ${lv}${+lv > S.level ? ' 🔒' : ''}</h3><ul class="list">${rs.map(r => {
            const st = E.researchState(S, r);
            return `<li class="item ${st === 'done' ? 'done' : st === 'locked' ? 'locked' : ''}"><div class="spread"><span class="t">${st === 'done' ? '✅ ' : ''}${r.n}</span>
              ${st === 'open' ? `<button class="btn small" data-r="${r.id}" ${cur || !E.canPay(S, r.cost) ? 'disabled' : ''}>חקור</button>` : st === 'cur' ? '<span class="tag">בתהליך</span>' : ''}</div>
              <div class="muted">${r.d}</div>${st !== 'done' ? `<div class="cost">${resTxt(r.cost, true)} · ⏱ ${fmtDur(r.min * E.effMul(S, 'research'))}</div>` : ''}</li>`;
          }).join('')}</ul>`).join(''),
        bind(b) { on(b, '[data-r]', el => act(() => E.startResearch(S, el.dataset.r))); },
      };
    },
    build() {
      const avail = Object.entries(E.BUILD).filter(([, d]) => E.has(S, d.req));
      return {
        title: '🏗️ בנייה',
        html: `<p class="muted">בונים רק בתוך האור. אם האש תקטן — מה שמחוץ לאור חשוף לאויבים מהאפלה.${S.people.some(p => (E.toolDef(S, p) || {}).build) ? ' 🔨 יש בנאי: הנחה של 20%.' : ' 🔨 בנאי (פטיש) מוזיל ב-20%.'}</p>
          ${avail.length ? `<ul class="list">${avail.map(([k, d]) => { const c = E.buildCost(S, k); return `<li class="item"><div class="spread"><span class="t">${d.i} ${d.n} <span class="tag">יש ${E.count(S, k)}</span></span><button class="btn small" data-b="${k}" ${E.canPay(S, c) ? '' : 'disabled'}>הצב</button></div><div class="muted">${d.d}</div><div class="cost">${resTxt(c, true)}</div></li>`; }).join('')}</ul>`
            : '<p>עוד אין מה לבנות. מחקר "בקתות" (רמה 2) פותח את המבנה הראשון.</p>'}
          ${E.count(S, 'kiln') ? `<label class="tog" style="margin-top:10px"><input type="checkbox" id="kilnT" ${S.kilnOn !== false ? 'checked' : ''}> 🧱 כבשני הפחם פועלים</label>` : ''}
          <p class="muted">מגורים: ${S.people.length}/${E.housing(S)} · כל 4 שעות מצטרף אדם חדש אם יש מקום, מזון ואש.</p>`,
        bind(b) {
          on(b, '[data-b]', el => { placing = el.dataset.b; const d = E.BUILD[placing]; $('placeTxt').textContent = `${d.i} הקישו על המפה בתוך האור כדי להציב ${d.n}`; $('placeBar').classList.remove('hidden'); closeSheet(); });
          const k = b.querySelector('#kilnT'); if (k) k.onchange = e => { S.kilnOn = e.target.checked; save(); };
        },
      };
    },
    log() {
      return {
        title: '📜 יומן',
        html: S.log.map(l => `<div class="log-line ${l.k}">${esc(l.msg)}<span class="tm">${ago(l.t)}</span></div>`).join(''),
      };
    },
  };
  function ago(t) { const m = (Date.now() - t) / E.MIN; return m < 1 ? 'עכשיו' : 'לפני ' + fmtDur(m); }
  $('placeCancel').onclick = () => { placing = null; $('placeBar').classList.add('hidden'); };

  /* ---------- מודאלים ---------- */
  function modal(html, bind) { $('modalCard').innerHTML = html; $('modal').classList.remove('hidden'); if (bind) bind($('modalCard')); }
  const closeModal = () => $('modal').classList.add('hidden');
  function welcomeBack(r) {
    const diff = E.RES_KEYS.map(k => [k, S.res[k] - r.before.res[k]]).filter(([, v]) => Math.abs(v) >= 1);
    const ev = r.events.filter(e => e.k !== 'info').slice(-14).reverse();
    modal(`<div class="logo">🔥</div><h1>בזמן שלא הייתם</h1><p class="muted">עברו ${fmtDur(r.minutes)}</p>
      <div class="grid-res">${diff.map(([k, v]) => `<span class="chip" style="pointer-events:none">${E.RES[k].i} <b style="color:${v > 0 ? 'var(--good)' : 'var(--bad)'}">${v > 0 ? '+' : ''}${Math.round(v)}</b></span>`).join('') || '<span class="muted">אין שינוי במלאי</span>'}</div>
      ${S.people.length !== r.before.pop ? `<p>👥 ${r.before.pop} ← ${S.people.length}</p>` : ''}
      ${ev.length ? `<div class="ev">${ev.map(e => `<div class="log-line ${e.k}">${esc(e.msg)}</div>`).join('')}</div>` : ''}
      <button class="btn wide" id="mOk">להמשיך</button>`, c => { c.querySelector('#mOk').onclick = closeModal; });
  }
  let overShown = false;
  function gameOver() {
    if (overShown) return; overShown = true;
    modal(`<div class="logo">☠️</div><h1>השבט נכחד</h1><p>הגעתם לרמה ${S.level} (${E.LEVELS[S.level].n}). נולדו ${S.stats.born}, מתו ${S.stats.died}.</p>
      <p class="muted">רעב, חושך ויצורים מהאפלה. נסו שוב — הפעם שמרו על האש ועל המזון.</p>
      <button class="btn wide" id="mNew">🔥 מדורה חדשה</button><a class="btn alt wide" href="../conquest/">⚔️ לכיבוש הממלכות</a>`, c => { c.querySelector('#mNew').onclick = restart; });
  }
  function restart() { S = E.newGame(Date.now()); overShown = false; save(); closeModal(); closeSheet(); refreshHud(); intro(); }
  function intro() {
    modal(`<div class="logo">🔥</div><h1>מהמדורה למעצמה</h1>
      <p style="text-align:right;line-height:1.6">עידן האבן. מדורה אחת ושלושה אנשים בחושך.<br>
      • <b>הקישו על מקום במפה</b> (🌲🫐🪨) ושלחו אנשים להביא משאבים.<br>
      • <b>הקישו על החושך</b> כדי לשלוח חוקרים לגלות מקומות חדשים.<br>
      • בתיבה 🧺 שמים משאבים במשבצות ויוצרים כלים. כלי הופך אדם לבעל מקצוע.<br>
      • האש צריכה עץ והאנשים צריכים מזון — <b>הזמן ממשיך גם כשהמשחק סגור</b>.<br>
      • הגדילו את האש כדי להגדיל את הכפר — עד טירת ה-AI ברמה 50.</p>
      <button class="btn wide" id="mGo">יאללה</button>`, c => { c.querySelector('#mGo').onclick = closeModal; });
  }
  $('menuBtn').onclick = () => modal(`<h1>☰ תפריט</h1>
    <a class="btn alt wide" href="../conquest/">⚔️ כיבוש הממלכות</a>
    <a class="btn alt wide" href="../semi/">⚡ מסע האלקטרון</a>
    <button class="btn alt wide" id="mHow">❓ איך משחקים</button>
    <button class="btn alt wide" id="mReset">🗑️ התחל מחדש</button>
    <button class="btn wide" id="mClose">חזרה למשחק</button>`, c => {
    c.querySelector('#mClose').onclick = closeModal;
    c.querySelector('#mHow').onclick = intro;
    c.querySelector('#mReset').onclick = () => { if (confirm('למחוק את הכפר ולהתחיל מדורה חדשה?')) restart(); };
  });

  /* ---------- הפעלה ---------- */
  refreshHud();
  if (fresh) { save(); intro(); } else tick(true);
  setInterval(() => tick(false), 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(true); });
  addEventListener('pagehide', save);
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
