// מסע האלקטרון — סימולציות אינטראקטיביות (canvas)
// כל סימולציה: SEMI.sims.<name>(container) → מחזירה פונקציית ניקוי.
(function () {
  'use strict';
  const K = SEMI.consts, kT = K.kT;
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sci(x, d = 2) {
    if (!isFinite(x)) return '∞';
    if (x === 0) return '0';
    const s = x < 0 ? '-' : ''; x = Math.abs(x);
    const e = Math.floor(Math.log10(x)); const m = x / Math.pow(10, e);
    if (e >= -2 && e <= 3) return s + (+x.toPrecision(3));
    return s + m.toFixed(d) + '×10' + String(e).split('').map(c => SUP[c]).join('');
  }
  function fmtA(i) { // זרם עם יחידות
    const a = Math.abs(i), s = i < 0 ? '−' : '';
    if (a >= 1) return s + a.toFixed(2) + ' A';
    if (a >= 1e-3) return s + (a * 1e3).toFixed(2) + ' mA';
    if (a >= 1e-6) return s + (a * 1e6).toFixed(2) + ' µA';
    if (a >= 1e-9) return s + (a * 1e9).toFixed(2) + ' nA';
    return s + sci(a, 1) + ' A';
  }

  // ---------- תשתית ----------
  function setup(box, h) {
    const cv = document.createElement('canvas'); box.appendChild(cv);
    const ctx = cv.getContext('2d');
    const ctrls = document.createElement('div'); box.appendChild(ctrls);
    const ro = document.createElement('div'); ro.className = 'readout'; box.appendChild(ro);
    const g = { cv, ctx, W: 300, H: h, ctrls, ro, alive: true, t: 0 };
    function size() {
      const w = Math.max(240, box.clientWidth || 300), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (g.W !== w || cv.width !== Math.round(w * dpr)) { g.W = w; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    }
    size();
    g.slider = (label, min, max, step, val, fmt, on) => {
      const d = document.createElement('div'); d.className = 'ctrl';
      d.innerHTML = `<label>${label}<span></span></label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`;
      const inp = d.querySelector('input'), sp = d.querySelector('span');
      const upd = () => { const v = +inp.value; sp.textContent = fmt(v); on(v); };
      inp.addEventListener('input', upd); ctrls.appendChild(d); upd();
      return inp;
    };
    g.seg = (opts, val, on) => {
      const d = document.createElement('div'); d.className = 'seg';
      opts.forEach(([k, lbl]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = lbl; b.dataset.k = k; d.appendChild(b); });
      const set = k => { d.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === String(k))); on(k); };
      d.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.k); });
      ctrls.appendChild(d); set(val);
    };
    g.button = (lbl, cls, on) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || 'sec') + ' mt'; b.textContent = lbl; b.addEventListener('click', on); ctrls.appendChild(b); return b; };
    g.readout = items => { ro.innerHTML = items.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join(''); };
    g.tag = (el => { el.className = 'tag'; el.style.display = 'none'; box.appendChild(el); return (txt, col) => { el.textContent = txt; el.style.display = ''; el.style.background = col + '33'; el.style.color = col; el.style.border = '1px solid ' + col; }; })(document.createElement('span'));
    g.loop = fn => {
      let last = performance.now();
      const step = now => { if (!g.alive) return; size(); const dt = Math.min(0.05, (now - last) / 1000); last = now; g.t += dt; ctx.clearRect(0, 0, g.W, h); fn(dt); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    g.destroy = () => { g.alive = false; };
    return g;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function text(ctx, s, x, y, col = '#cfd6ff', size = 12, align = 'center', bold) { ctx.fillStyle = col; ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, Arial`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
  function dot(ctx, x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; ctx.stroke(); } }
  function line(ctx, pts, col, w = 2, dash) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
  function arrow(ctx, x1, y1, x2, y2, col, w = 2) { line(ctx, [[x1, y1], [x2, y2]], col, w); const a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(a - .4), y2 - 9 * Math.sin(a - .4)); ctx.lineTo(x2 - 9 * Math.cos(a + .4), y2 - 9 * Math.sin(a + .4)); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
  const ELEC = '#6fa8ff', HOLE = '#ff8fa3';
  // ריכוז אינטרינזי מנורמל כך ש-Si ב-300K = 1.5e10
  const niOf = (Eg, T) => T <= 1 ? 0 : 1.5e10 * Math.pow(T / 300, 1.5) * Math.exp(-Eg / (2 * 8.617e-5 * T) + 1.12 / (2 * 8.617e-5 * 300));

  const sims = {};

  // ======================================================= 1. פסי אנרגיה
  sims.bands = box => {
    const g = setup(box, 260);
    const mats = { Ge: 0.66, Si: 1.12, GaAs: 1.42, SiO2: 9 };
    let mat = 'Si', T = 300, ni = 0;
    const N = 40; const ps = [];
    for (let i = 0; i < N; i++) ps.push({ x: Math.random(), y: Math.random(), up: false, j: 0 });
    g.seg([['Ge', 'Ge'], ['Si', 'Si'], ['GaAs', 'GaAs'], ['SiO2', 'מבודד']], 'Si', k => { mat = k; upd(); });
    g.slider('טמפרטורה', 0, 700, 10, 300, v => v + ' K', v => { T = v; upd(); });
    function upd() {
      const Eg = mats[mat]; ni = niOf(Eg, T);
      g.readout([['פער אנרגיה Eg', Eg + ' eV'], ['ni (אלקטרונים חופשיים)', sci(ni) + ' cm⁻³'], ['λ מקסימלי לבליעה', (1.24 / Eg).toFixed(2) + ' µm'], ['kT', (8.617e-5 * T).toFixed(4) + ' eV']]);
    }
    g.loop(dt => {
      const { ctx, W, H } = g, Eg = mats[mat];
      const gap = Math.min(150, 34 + Eg * 42);
      const cbTop = 20, cbBot = (H - gap) / 2 - 10, vbTop = cbBot + gap, vbBot = H - 20;
      // פסים
      const grd = (y1, y2, c) => { ctx.fillStyle = c; ctx.fillRect(40, y1, W - 60, y2 - y1); };
      grd(cbTop, cbBot, 'rgba(111,168,255,.14)'); grd(vbTop, vbBot, 'rgba(255,143,163,.16)');
      line(ctx, [[40, cbBot], [W - 20, cbBot]], ELEC, 2); line(ctx, [[40, vbTop], [W - 20, vbTop]], HOLE, 2);
      text(ctx, 'Ec', 22, cbBot, ELEC, 13, 'center', true); text(ctx, 'Ev', 22, vbTop, HOLE, 13, 'center', true);
      text(ctx, 'פס הולכה', W - 26, cbTop + 12, '#9fb8ff', 12, 'right'); text(ctx, 'פס ערכיות', W - 26, vbBot - 12, '#ffb3c0', 12, 'right');
      arrow(ctx, 30 + (W - 60) / 2, vbTop - 4, 30 + (W - 60) / 2, cbBot + 4, 'rgba(255,210,87,.5)', 1.5);
      text(ctx, 'Eg = ' + Eg + ' eV', 30 + (W - 60) / 2 + 48, (cbBot + vbTop) / 2, '#ffd257', 13, 'center', true);
      // כמה אלקטרונים למעלה — סקאלה לוגריתמית
      const target = ni <= 0 ? 0 : Math.max(0, Math.min(N - 4, Math.round((Math.log10(ni) - 4) * 2.4)));
      let upN = ps.filter(p => p.up).length;
      if (upN < target && Math.random() < .25) { const p = ps.find(p => !p.up); if (p) { p.up = true; p.j = 1; } }
      if (upN > target && Math.random() < .25) { const p = ps.find(p => p.up); if (p) { p.up = false; p.j = 1; } }
      ps.forEach(p => {
        const sp = .05 + T / 4000;
        p.x += rnd(-sp, sp) * dt * 3; p.y += rnd(-sp, sp) * dt * 3;
        p.x = Math.min(.98, Math.max(.02, p.x)); p.y = Math.min(.95, Math.max(.05, p.y));
        const x = 46 + p.x * (W - 72);
        const yv = vbTop + 6 + p.y * (vbBot - vbTop - 12), yc = cbTop + 6 + p.y * (cbBot - cbTop - 12);
        if (p.up) {
          dot(ctx, x, yc, 5, ELEC); dot(ctx, x, yv, 5, null, HOLE);
          if (p.j > 0) { line(ctx, [[x, yv], [x, yc]], 'rgba(255,210,87,' + p.j + ')', 2, [3, 3]); p.j -= dt * 1.5; }
        } else dot(ctx, x, yv, 5, '#ff8fa3aa');
      });
      if (mat === 'SiO2') text(ctx, 'הפער ענק — אף אלקטרון לא מצליח לקפוץ', W / 2 + 10, (cbBot + vbTop) / 2 + 22, '#ff9aa9', 12);
    });
    return g.destroy;
  };

  // ======================================================= 2. אילוח ורמת פרמי
  sims.doping = box => {
    const g = setup(box, 270);
    let v = 0, n = K.ni, p = K.ni, N = 0, type = 'i';
    g.slider('אילוח (שמאל = p, ימין = n)', -100, 100, 1, 50, val => {
      if (Math.abs(val) < 4) return 'אינטרינזי';
      const L = 12 + (Math.abs(val) / 100) * 7; return (val > 0 ? 'Nd' : 'Na') + ' = ' + sci(Math.pow(10, L), 1);
    }, val => {
      v = val;
      if (Math.abs(val) < 4) { N = 0; type = 'i'; } else { N = Math.pow(10, 12 + (Math.abs(val) / 100) * 7); type = val > 0 ? 'n' : 'p'; }
      const maj = N / 2 + Math.sqrt(N * N / 4 + K.ni * K.ni), min = K.ni * K.ni / maj;
      if (type === 'p') { p = maj; n = min; } else if (type === 'n') { n = maj; p = min; } else { n = p = K.ni; }
      const efi = kT * Math.log(n / K.ni);
      g.readout([['n (אלקטרונים)', sci(n) + ' cm⁻³'], ['p (חורים)', sci(p) + ' cm⁻³'], ['n·p', sci(n * p) + ' = ni²'], ['EF − Ei', (efi >= 0 ? '+' : '') + efi.toFixed(3) + ' eV']]);
    });
    const atoms = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) atoms.push({ r, c, d: Math.random(), ph: Math.random() * 6 });
    g.loop(dt => {
      const { ctx, W } = g;
      // דיאגרמת פסים
      const top = 22, bot = 150, Ec = top + 10, Ev = bot - 10, Ei = (Ec + Ev) / 2;
      const efi = kT * Math.log(n / K.ni); // eV
      const pxPerEv = (Ev - Ec) / 1.12;
      const EF = Math.max(Ec + 3, Math.min(Ev - 3, Ei - efi * pxPerEv));
      ctx.fillStyle = 'rgba(111,168,255,.12)'; ctx.fillRect(30, top - 14, W - 40, Ec - top + 14);
      ctx.fillStyle = 'rgba(255,143,163,.12)'; ctx.fillRect(30, Ev, W - 40, bot - Ev + 14);
      line(ctx, [[30, Ec], [W - 10, Ec]], ELEC, 2); line(ctx, [[30, Ev], [W - 10, Ev]], HOLE, 2);
      line(ctx, [[30, Ei], [W - 10, Ei]], '#8890c0', 1.2, [4, 4]);
      line(ctx, [[30, EF], [W - 10, EF]], '#ffd257', 3);
      text(ctx, 'Ec', 16, Ec, ELEC, 12, 'center', true); text(ctx, 'Ev', 16, Ev, HOLE, 12, 'center', true); text(ctx, 'Ei', 16, Ei, '#8890c0', 12, 'center', true);
      text(ctx, 'EF', W - 26, EF - 10, '#ffd257', 13, 'center', true);
      // נשאים בפסים (לוגריתמי)
      const ne = Math.round(Math.max(0, Math.log10(n) - 9) * 1.6), nh = Math.round(Math.max(0, Math.log10(p) - 9) * 1.6);
      for (let i = 0; i < ne; i++) dot(ctx, 50 + ((i * 53 + g.t * 30 * (i % 3 + 1)) % (W - 80)), Ec - 8 - (i % 2) * 6, 4, ELEC);
      for (let i = 0; i < nh; i++) dot(ctx, 50 + ((i * 47 + g.t * 18 * (i % 3 + 1)) % (W - 80)), Ev + 8 + (i % 2) * 6, 4, null, HOLE);
      const lbl = type === 'n' ? 'סוג n — EF עולה לכיוון Ec' : type === 'p' ? 'סוג p — EF יורדת לכיוון Ev' : 'אינטרינזי — EF באמצע';
      text(ctx, lbl, W / 2 + 10, bot + 14, '#e6e9ff', 13, 'center', true);
      // סריג
      const y0 = 190, sx = (W - 40) / 9;
      const frac = type === 'i' ? 0 : Math.min(.45, (Math.abs(v) / 100) * .45);
      atoms.forEach(a => {
        const x = 30 + a.c * sx + sx / 2, y = y0 + a.r * 20;
        const dop = a.d < frac;
        if (a.c < 8) line(ctx, [[x, y], [x + sx, y]], '#2c3470', 1.5);
        if (a.r < 3) line(ctx, [[x, y], [x, y + 20]], '#2c3470', 1.5);
        dot(ctx, x, y, 7, dop ? (type === 'n' ? '#ff9f43' : '#3fd68f') : '#5c6499');
        text(ctx, dop ? (type === 'n' ? 'P' : 'B') : 'Si', x, y + .5, '#0d0f1f', 8, 'center', true);
        if (dop) {
          const ox = Math.cos(g.t * 2 + a.ph) * 9, oy = Math.sin(g.t * 2 + a.ph) * 6;
          if (type === 'n') dot(ctx, x + ox, y + oy - 2, 3, ELEC); else dot(ctx, x + ox, y + oy - 2, 3, null, HOLE);
        }
      });
    });
    return g.destroy;
  };

  // ======================================================= 3. סחיפה
  sims.drift = box => {
    const g = setup(box, 220);
    let E = 500, T = 300, car = 'e', mu = 0, vd = 0;
    const ps = []; for (let i = 0; i < 26; i++) ps.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, f: 0 });
    const hits = [];
    g.seg([['e', 'אלקטרונים'], ['h', 'חורים']], 'e', k => { car = k; upd(); });
    g.slider('שדה חשמלי E', 0, 2000, 50, 500, v => v + ' V/cm', v => { E = v; upd(); });
    g.slider('טמפרטורה', 150, 500, 10, 300, v => v + ' K', v => { T = v; upd(); });
    function upd() {
      mu = (car === 'e' ? K.mun : K.mup) * Math.pow(T / 300, -1.5); vd = mu * E;
      g.readout([['ניידות μ', Math.round(mu) + ' cm²/V·s'], ['מהירות סחיפה v', sci(vd) + ' cm/s'], ['צפיפות זרם (10¹⁶ cm⁻³)', (K.q * 1e16 * vd).toFixed(1) + ' A/cm²'], ['D = μkT/q', (mu * 8.617e-5 * T).toFixed(1) + ' cm²/s']]);
    }
    g.loop(dt => {
      const { ctx, W, H } = g;
      ctx.fillStyle = '#12163a'; ctx.fillRect(10, 30, W - 20, H - 50);
      // שדה (מימין לשמאל ב-RTL? מציירים משמאל לימין)
      arrow(ctx, 30, 16, 30 + Math.min(W - 60, 30 + E / 2000 * (W - 90)), 16, '#ffd257', 2);
      text(ctx, 'E', 20, 16, '#ffd257', 13, 'center', true);
      // אטומי סריג
      for (let x = 30; x < W - 20; x += 34) for (let y = 48; y < H - 24; y += 30) dot(ctx, x + (Math.sin(g.t * 20 + x + y) * T / 300), y, 3, '#2c3470');
      const dir = car === 'e' ? -1 : 1; // אלקטרונים נגד השדה
      const scat = 3 * Math.pow(T / 300, 1.5); // קצב התנגשויות
      const drift = dir * vd / 1.35e6 * 0.25; // נורמליזציה לתצוגה
      const th = 0.35 * Math.sqrt(T / 300);
      ps.forEach(p => {
        p.vx += drift * dt * 6; // האצה מהשדה
        if (Math.random() < scat * dt) { const a = rnd(0, 6.28); p.vx = Math.cos(a) * th; p.vy = Math.sin(a) * th; p.f = .25; hits.push({ x: p.x, y: p.y, l: .3 }); }
        p.x += (p.vx + drift) * dt * .5; p.y += p.vy * dt * .5;
        if (p.x > 1) p.x -= 1; if (p.x < 0) p.x += 1; if (p.y > 1 || p.y < 0) { p.vy *= -1; p.y = Math.min(1, Math.max(0, p.y)); }
        const x = 14 + p.x * (W - 28), y = 36 + p.y * (H - 62);
        if (car === 'e') dot(ctx, x, y, 5, ELEC); else dot(ctx, x, y, 5, '#12163a', HOLE);
      });
      for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; h.l -= dt; if (h.l <= 0) { hits.splice(i, 1); continue; } dot(ctx, 14 + h.x * (W - 28), 36 + h.y * (H - 62), 9 * (1 - h.l / .3) + 2, null, 'rgba(255,255,255,' + h.l * 2 + ')'); }
      text(ctx, car === 'e' ? 'אלקטרונים זזים נגד כיוון השדה' : 'חורים זזים עם כיוון השדה', W / 2, H - 9, '#9aa3d6', 12);
    });
    return g.destroy;
  };

  // ======================================================= 4. אפקט הול
  sims.hall = box => {
    const g = setup(box, 240);
    let B = 0.5, I = 1, type = 'n', acc = 0, VH = 0;
    const ps = []; for (let i = 0; i < 30; i++) ps.push({ x: Math.random(), y: rnd(.1, .9) });
    g.seg([['n', 'סוג n'], ['p', 'סוג p']], 'n', k => { type = k; acc = 0; upd(); });
    g.slider('שדה מגנטי B', 0, 1, 0.05, 0.5, v => v.toFixed(2) + ' T', v => { B = v; upd(); });
    g.slider('זרם I', 0, 5, 0.1, 1, v => v.toFixed(1) + ' mA', v => { I = v; upd(); });
    function upd() {
      VH = (I * 1e-3 * B) / (K.q * 1e22 * 1e-4) * (type === 'n' ? -1 : 1);
      g.readout([['מתח הול VH', (VH >= 0 ? '+' : '') + (VH * 1e3).toFixed(2) + ' mV'], ['RH', (type === 'n' ? '−' : '+') + '625 cm³/C'], ['n או p', '10¹⁶ cm⁻³'], ['עובי t', '100 µm']]);
      g.tag(type === 'n' ? 'VH שלילי ← נשאים שליליים (n)' : 'VH חיובי ← נשאים חיוביים (p)', type === 'n' ? '#6fa8ff' : '#ff8fa3');
    }
    g.loop(dt => {
      const { ctx, W, H } = g;
      const x0 = 40, x1 = W - 40, y0 = 50, y1 = H - 50;
      ctx.fillStyle = '#1a1f4a'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeStyle = '#3a4590'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      // B לתוך המסך
      for (let x = x0 + 18; x < x1; x += 40) for (let y = y0 + 14; y < y1; y += 30) { ctx.globalAlpha = .18 + B * .5; text(ctx, '⊗', x, y, '#b39bff', 13); ctx.globalAlpha = 1; }
      text(ctx, 'B ⊗ (לתוך המסך)', W / 2, 14, '#b39bff', 12, 'center', true);
      arrow(ctx, 8, H / 2, x0 - 4, H / 2, '#ffd257', 2.5); text(ctx, 'I', 14, H / 2 - 12, '#ffd257', 13, 'center', true);
      arrow(ctx, x1 + 4, H / 2, W - 6, H / 2, '#ffd257', 2.5);
      // הצטברות
      const target = Math.min(1, B * I / 2.5);
      acc += (target - acc) * dt * 1.5;
      const nAcc = Math.round(acc * 14);
      for (let i = 0; i < nAcc; i++) {
        const x = x0 + 10 + i * ((x1 - x0 - 20) / 14);
        text(ctx, type === 'n' ? '−' : '+', x, y0 + 8, type === 'n' ? ELEC : HOLE, 15, 'center', true);
        text(ctx, type === 'n' ? '+' : '−', x, y1 - 8, type === 'n' ? HOLE : ELEC, 15, 'center', true);
      }
      // נשאים
      const dir = type === 'n' ? -1 : 1, sp = .08 + I * .04;
      ps.forEach(p => {
        p.x += dir * sp * dt;
        const push = B * I * .06 * (1 - acc * .95); // נדחפים למעלה, עד שהשדה החשמלי מאזן
        p.y -= push * dt * 3; p.y += (rnd(-1, 1)) * .02;
        if (p.y < .08) p.y = .08 + Math.random() * .05; if (p.y > .92) p.y = .92;
        if (p.x > 1) { p.x = 0; p.y = rnd(.2, .9); } if (p.x < 0) { p.x = 1; p.y = rnd(.2, .9); }
        const x = x0 + p.x * (x1 - x0), y = y0 + p.y * (y1 - y0);
        if (type === 'n') dot(ctx, x, y, 4.5, ELEC); else dot(ctx, x, y, 4.5, '#1a1f4a', HOLE);
      });
      text(ctx, 'שני הסוגים נדחפים לצד העליון — רק המטען שמצטבר שונה', W / 2, H - 14, '#9aa3d6', 11.5);
    });
    upd();
    return g.destroy;
  };

  // ======================================================= 5. נשאים עודפים
  sims.excess = box => {
    const g = setup(box, 250);
    let tau = 1, light = false;
    const pairs = []; const hist = [];
    let acc = 0;
    g.slider('זמן חיים τ', 0.2, 5, 0.1, 1, v => v.toFixed(1) + ' µs', v => { tau = v; upd(); });
    const row = document.createElement('div'); row.className = 'row'; g.ctrls.appendChild(row);
    const fl = g.button('⚡ הבזק', 'gold', () => { for (let i = 0; i < 40; i++) pairs.push(mk()); });
    const lt = g.button('💡 אור רציף: כבוי', 'sec', () => { light = !light; lt.textContent = '💡 אור רציף: ' + (light ? 'דולק' : 'כבוי'); });
    row.appendChild(fl); row.appendChild(lt);
    function mk() { return { x: rnd(.02, .25), y: rnd(.1, .9), vx: 0, vy: 0, a: 1 }; }
    function upd() {
      const L = Math.sqrt(12.4 * tau * 1e-6) * 1e4;
      g.readout([['τ', tau.toFixed(1) + ' µs'], ['Lp = √(Dp·τ)', L.toFixed(1) + ' µm'], ['אחרי τ נשאר', '37%'], ['Δn במצב יציב', 'G·τ']]);
    }
    upd();
    for (let i = 0; i < 40; i++) pairs.push(mk());
    g.loop(dt => {
      const { ctx, W } = g;
      const sx0 = 30, sx1 = W - 14, sy0 = 14, sy1 = 120;
      ctx.fillStyle = '#151a40'; ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      if (light) { for (let i = 0; i < 4; i++) arrow(ctx, 2, sy0 + 15 + i * 26, sx0 - 2, sy0 + 15 + i * 26, '#ffe066', 2); acc += dt * 30; while (acc > 1) { pairs.push(mk()); acc--; } }
      // זמן מואט: 1µs = 1s
      const pDie = 1 - Math.exp(-dt / tau);
      for (let i = pairs.length - 1; i >= 0; i--) {
        const p = pairs[i];
        p.x += rnd(-1, 1) * dt * .12; p.y += rnd(-1, 1) * dt * .3;
        p.x = Math.max(0, Math.min(1, p.x)); p.y = Math.max(.05, Math.min(.95, p.y));
        if (Math.random() < pDie) { p.dying = .3; }
        if (p.dying !== undefined) { p.dying -= dt; if (p.dying <= 0) { pairs.splice(i, 1); continue; } }
        const x = sx0 + p.x * (sx1 - sx0), y = sy0 + p.y * (sy1 - sy0);
        if (p.dying !== undefined) dot(ctx, x, y, 8 * (1 - p.dying / .3) + 2, null, 'rgba(255,224,102,.8)');
        else { dot(ctx, x - 3, y, 3.5, ELEC); dot(ctx, x + 4, y, 3.5, null, HOLE); }
      }
      // גרף Δn(t)
      hist.push(pairs.length); if (hist.length > 300) hist.shift();
      const gy0 = 140, gy1 = 236, gx0 = 30, gx1 = W - 14;
      line(ctx, [[gx0, gy0], [gx0, gy1], [gx1, gy1]], '#3a4590', 1.5);
      text(ctx, 'Δn', 16, gy0 + 6, '#9aa3d6', 12); text(ctx, 'זמן ←', gx1 - 20, gy1 + 9, '#9aa3d6', 11);
      const mx = Math.max(40, ...hist);
      line(ctx, hist.map((h, i) => [gx1 - (hist.length - 1 - i) * (gx1 - gx0) / 300, gy1 - (h / mx) * (gy1 - gy0 - 6)]), '#ffe066', 2.2);
    });
    return g.destroy;
  };

  // ======================================================= 6. צומת PN
  sims.pn = box => {
    const g = setup(box, 300);
    const Na = 1e17, Nd = 1e16, Vbi = kT * Math.log(Na * Nd / (K.ni * K.ni)), es = K.epsSi * K.eps0, Is = 1e-14, VBR = -4.5;
    let Va = 0, W = 0, I = 0;
    const flow = [];
    g.slider('מתח ממתח Va', -5, 0.8, 0.01, 0, v => v.toFixed(2) + ' V', v => {
      Va = v;
      W = Math.sqrt(2 * es * Math.max(0.03, Vbi - Va) / K.q * (Na + Nd) / (Na * Nd));
      I = Is * (Math.exp(Va / kT) - 1); if (Va < VBR) I -= 2e-3 * Math.expm1((VBR - Va) * 6);
      g.readout([['רוחב מחסור W', (W * 1e4).toFixed(3) + ' µm'], ['זרם I', fmtA(I)], ['מחסום q(Vbi−Va)', Math.max(0, Vbi - Va).toFixed(2) + ' eV'], ['Vbi', Vbi.toFixed(3) + ' V']]);
      g.tag(Va < VBR ? '⚡ פריצה!' : Va > 0.05 ? 'ממתח קדמי — הדיודה מוליכה' : Va < -0.05 ? 'ממתח אחורי — כמעט אין זרם' : 'שיווי משקל', Va < VBR ? '#ff5d73' : Va > 0.05 ? '#3fd68f' : '#9aa3d6');
    });
    g.loop(dt => {
      const { ctx, W: CW } = g;
      const x0 = 14, x1 = CW - 14, y0 = 26, y1 = 116, mid = (x0 + x1) / 2;
      const scale = (x1 - x0) * 0.42 / (Math.sqrt(2 * es * (Vbi + 5) / K.q * (Na + Nd) / (Na * Nd)));
      const xn = W * Na / (Na + Nd) * scale, xp = W * Nd / (Na + Nd) * scale;
      ctx.fillStyle = 'rgba(255,143,163,.18)'; ctx.fillRect(x0, y0, mid - xp - x0, y1 - y0);
      ctx.fillStyle = 'rgba(111,168,255,.18)'; ctx.fillRect(mid + xn, y0, x1 - mid - xn, y1 - y0);
      ctx.fillStyle = '#0d0f1f'; ctx.fillRect(mid - xp, y0, xp + xn, y1 - y0);
      ctx.strokeStyle = '#3a4590'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      text(ctx, 'p  (Na=10¹⁷)', x0 + 44, 14, HOLE, 12, 'center', true); text(ctx, 'n  (Nd=10¹⁶)', x1 - 44, 14, ELEC, 12, 'center', true);
      // יונים באזור המחסור
      for (let x = mid - xp + 5; x < mid; x += 9) for (let y = y0 + 12; y < y1; y += 20) text(ctx, '−', x, y, '#ff8fa3', 13, 'center', true);
      for (let x = mid + 5; x < mid + xn; x += 9) for (let y = y0 + 12; y < y1; y += 20) text(ctx, '+', x, y, '#6fa8ff', 12, 'center', true);
      // נשאים ניידים
      for (let i = 0; i < 16; i++) { const xx = x0 + 6 + ((i * 37 + Math.sin(g.t + i) * 6) % Math.max(10, mid - xp - x0 - 12)); dot(ctx, xx, y0 + 12 + (i * 23) % (y1 - y0 - 20), 3.5, null, HOLE); }
      for (let i = 0; i < 16; i++) { const xx = mid + xn + 6 + ((i * 41 + Math.cos(g.t + i) * 6) % Math.max(10, x1 - mid - xn - 12)); dot(ctx, xx, y0 + 12 + (i * 29) % (y1 - y0 - 20), 3.5, ELEC); }
      // זרם חוצה בממתח קדמי
      const rate = Va > 0 ? Math.min(25, Math.max(0, Math.log10(Math.max(I, 1e-12)) + 8) * 3) : 0;
      if (Math.random() < rate * dt) flow.push({ x: x1 - 20, y: rnd(y0 + 10, y1 - 10), e: true }, { x: x0 + 20, y: rnd(y0 + 10, y1 - 10), e: false });
      for (let i = flow.length - 1; i >= 0; i--) { const f = flow[i]; f.x += (f.e ? -1 : 1) * 120 * dt; if (f.x < x0 || f.x > x1) { flow.splice(i, 1); continue; } f.e ? dot(ctx, f.x, f.y, 4, '#9fd0ff') : dot(ctx, f.x, f.y, 4, null, '#ffc2cd'); }
      text(ctx, 'אזור מחסור', mid, y1 + 10, '#cfd6ff', 11);
      // עקומת I-V
      const gx0 = 24, gx1 = CW - 10, gy0 = 140, gy1 = 290, vMin = -5, vMax = 0.8, iMax = 10e-3;
      const X = v => gx0 + (v - vMin) / (vMax - vMin) * (gx1 - gx0), Y = i => (gy0 + gy1) / 2 - Math.max(-1, Math.min(1, i / iMax)) * (gy1 - gy0) / 2;
      line(ctx, [[gx0, Y(0)], [gx1, Y(0)]], '#3a4590', 1); line(ctx, [[X(0), gy0], [X(0), gy1]], '#3a4590', 1);
      text(ctx, 'I', X(0) + 8, gy0 + 4, '#9aa3d6', 12); text(ctx, 'V', gx1 - 6, Y(0) - 9, '#9aa3d6', 12);
      const pts = []; for (let v = vMin; v <= vMax; v += 0.01) { let i = Is * (Math.exp(v / kT) - 1); if (v < VBR) i -= 2e-3 * Math.expm1((VBR - v) * 6); pts.push([X(v), Y(i)]); }
      line(ctx, pts, '#9b6bff', 2.4);
      dot(ctx, X(Va), Y(I), 6, '#ffd257');
      text(ctx, '0.7V', X(0.7), Y(0) + 10, '#9aa3d6', 10); text(ctx, 'פריצה', X(VBR) + 4, gy1 - 8, '#ff9aa9', 11);
    });
    return g.destroy;
  };

  // ======================================================= 7. מגע מתכת-מל"מ
  sims.ms = box => {
    const g = setup(box, 260);
    const metals = [['Al', 4.28], ['Ti', 4.33], ['W', 4.55], ['Au', 5.1], ['Pt', 5.65]];
    let mi = 3, type = 'n', phm = 5.1, Vbi = 0, phiB = 0, sch = true;
    const phiS = { n: K.chi + kT * Math.log(K.Nc / 1e16), p: K.chi + K.Eg - kT * Math.log(K.Nv / 1e16) };
    g.seg(metals.map(([m], i) => [i, m]), 3, k => { mi = +k; upd(); });
    g.seg([['n', 'מל"מ סוג n'], ['p', 'מל"מ סוג p']], 'n', k => { type = k; upd(); });
    function upd() {
      phm = metals[mi][1]; const ps = phiS[type]; Vbi = phm - ps;
      phiB = type === 'n' ? phm - K.chi : K.chi + K.Eg - phm;
      sch = type === 'n' ? phm > ps : phm < ps;
      g.readout([['φm (' + metals[mi][0] + ')', phm.toFixed(2) + ' eV'], ['φs', ps.toFixed(2) + ' eV'], ['מחסום ' + (type === 'n' ? 'φBn = φm − χ' : 'φBp = χ + Eg − φm'), phiB.toFixed(2) + ' eV'], ['Vbi = φm − φs', (Vbi >= 0 ? '+' : '') + Vbi.toFixed(2) + ' V']]);
      g.tag(sch ? 'מגע שוטקי — מיישר' : 'מגע אוהמי — אין מחסום לנשאי הרוב', sch ? '#ff9f43' : '#3fd68f');
    }
    g.loop(() => {
      const { ctx, W, H } = g;
      const xi = W * 0.32, ppe = 34; // פיקסלים ל-eV
      const EFy = 150, ec = e => EFy - e * ppe; // אנרגיה (יחסית ל-EF) → y
      // מתכת
      ctx.fillStyle = 'rgba(176,190,197,.25)'; ctx.fillRect(10, EFy, xi - 10, H - EFy - 10);
      line(ctx, [[10, EFy], [xi, EFy]], '#ffd257', 2.5); text(ctx, 'EF', 22, EFy - 9, '#ffd257', 12, 'center', true);
      text(ctx, 'מתכת', (10 + xi) / 2, H - 22, '#cfd6ff', 13, 'center', true);
      const vac = ec(phm); line(ctx, [[10, vac], [xi, vac]], '#8890c0', 1.2, [4, 4]); text(ctx, 'ואקום', 30, vac - 9, '#8890c0', 11);
      arrow(ctx, xi - 22, EFy, xi - 22, vac + 3, '#cfd6ff', 1.2); text(ctx, 'φm', xi - 36, (EFy + vac) / 2, '#cfd6ff', 12);
      // מל"מ
      const ecB = phiS[type] - K.chi; // Ec-EF בגוף
      const ecI = phm - K.chi;      // Ec-EF בממשק
      const wd = (W - xi - 10) * (sch ? 0.45 : 0.18);
      const pts = [], ptsV = [], ptsVac = [];
      for (let x = xi; x <= W - 10; x += 3) {
        const u = Math.min(1, (x - xi) / wd), e = ecB + (ecI - ecB) * (1 - u) * (1 - u);
        pts.push([x, ec(e)]); ptsV.push([x, ec(e - K.Eg)]); ptsVac.push([x, ec(e + K.chi)]);
      }
      line(ctx, pts, ELEC, 2.5); line(ctx, ptsV, HOLE, 2.5); line(ctx, ptsVac, '#8890c0', 1.2, [4, 4]);
      line(ctx, [[xi, EFy], [W - 10, EFy]], '#ffd257', 2, [6, 4]);
      text(ctx, 'Ec', W - 20, ec(ecB) - 9, ELEC, 12, 'center', true); text(ctx, 'Ev', W - 20, ec(ecB - K.Eg) + 10, HOLE, 12, 'center', true);
      text(ctx, 'מל"מ ' + type, (xi + W) / 2, H - 22, '#cfd6ff', 13, 'center', true);
      line(ctx, [[xi, 10], [xi, H - 10]], '#5c6499', 2);
      // חץ המחסום
      if (sch) {
        if (type === 'n') { arrow(ctx, xi + 8, EFy, xi + 8, ec(ecI) + 3, '#ff9f43', 1.8); text(ctx, 'φB', xi + 24, (EFy + ec(ecI)) / 2, '#ff9f43', 12, 'center', true); }
        else { arrow(ctx, xi + 8, EFy, xi + 8, ec(ecI - K.Eg) - 3, '#ff9f43', 1.8); text(ctx, 'φB', xi + 24, (EFy + ec(ecI - K.Eg)) / 2, '#ff9f43', 12, 'center', true); }
      }
      // אלקטרונים / חורים בגוף
      for (let i = 0; i < 6; i++) {
        const x = W - 20 - ((i * 19 + g.t * 20) % (W - xi - 40));
        if (type === 'n') { const u = Math.min(1, (x - xi) / wd), e = ecB + (ecI - ecB) * (1 - u) * (1 - u); dot(ctx, x, ec(e) - 6, 3.5, ELEC); }
        else { const u = Math.min(1, (x - xi) / wd), e = ecB + (ecI - ecB) * (1 - u) * (1 - u) - K.Eg; dot(ctx, x, ec(e) + 6, 3.5, null, HOLE); }
      }
    });
    upd();
    return g.destroy;
  };

  // ======================================================= 8. BJT
  sims.bjt = box => {
    const g = setup(box, 290);
    const Is = 1e-15, bF = 100, bR = 1, VA = 50;
    let VBE = 0.65, VCE = 3, IC = 0, IB = 0, reg = '';
    const el = [];
    function calc(vbe, vce) {
      const vbc = vbe - vce, ef = Math.exp(vbe / kT), er = Math.exp(vbc / kT);
      const ic = (Is * (ef - er) - (Is / bR) * (er - 1)) * (1 + Math.max(0, vce) / VA);
      const ib = (Is / bF) * (ef - 1) + (Is / bR) * (er - 1);
      return [ic, ib];
    }
    function upd() {
      [IC, IB] = calc(VBE, VCE);
      const vbc = VBE - VCE, beF = VBE > 0.5, bcF = vbc > 0.5;
      reg = beF && !bcF ? 'active' : beF && bcF ? 'sat' : !beF && !bcF ? 'cut' : 'rev';
      const names = { active: ['פעיל — מגבר! IC ≈ β·IB', '#3fd68f'], sat: ['רוויה — מתג סגור', '#ffd257'], cut: ['קטעון — מתג פתוח', '#9aa3d6'], rev: ['פעיל הפוך', '#ff8fa3'] };
      g.tag(names[reg][0], names[reg][1]);
      g.readout([['IC', fmtA(IC)], ['IB', fmtA(IB)], ['IC / IB', IB > 1e-13 ? (IC / IB).toFixed(1) : '—'], ['VBC', vbc.toFixed(2) + ' V']]);
    }
    g.slider('VBE (בסיס-פולט)', 0, 0.8, 0.005, 0.65, v => v.toFixed(3) + ' V', v => { VBE = v; upd(); });
    g.slider('VCE (קולט-פולט)', 0, 5, 0.02, 3, v => v.toFixed(2) + ' V', v => { VCE = v; upd(); });
    g.loop(dt => {
      const { ctx, W } = g;
      const y0 = 18, y1 = 108, xE = 14, wE = (W - 28) * .3, wB = (W - 28) * .14, xB = xE + wE, xC = xB + wB, x1 = W - 14;
      ctx.fillStyle = 'rgba(111,168,255,.28)'; ctx.fillRect(xE, y0, wE, y1 - y0);
      ctx.fillStyle = 'rgba(255,143,163,.22)'; ctx.fillRect(xB, y0, wB, y1 - y0);
      ctx.fillStyle = 'rgba(111,168,255,.15)'; ctx.fillRect(xC, y0, x1 - xC, y1 - y0);
      text(ctx, 'פולט n⁺', xE + wE / 2, y1 + 11, '#9fb8ff', 12, 'center', true); text(ctx, 'בסיס p', xB + wB / 2, y1 + 11, '#ffb3c0', 12, 'center', true); text(ctx, 'קולט n', (xC + x1) / 2, y1 + 11, '#9fb8ff', 12, 'center', true);
      // זרימה
      const rate = IC > 1e-9 ? Math.min(40, (Math.log10(IC) + 9) * 6) : 0;
      if (Math.random() < rate * dt) el.push({ x: xE + 8, y: rnd(y0 + 10, y1 - 10), rec: Math.random() < 1 / (reg === 'sat' ? 4 : 30) });
      for (let i = el.length - 1; i >= 0; i--) {
        const e = el[i]; e.x += 90 * dt * (e.x > xB && e.x < xC ? .6 : 1);
        if (e.rec && e.x > xB + wB / 2) { dot(ctx, e.x, e.y, 9, null, 'rgba(255,210,87,.7)'); el.splice(i, 1); continue; }
        if (e.x > x1) { el.splice(i, 1); continue; }
        dot(ctx, e.x, e.y, 3.5, ELEC);
      }
      // עקומת פלט IC-VCE
      const gx0 = 26, gx1 = W - 12, gy0 = 140, gy1 = 282;
      line(ctx, [[gx0, gy0], [gx0, gy1], [gx1, gy1]], '#3a4590', 1.5);
      text(ctx, 'IC', 14, gy0 + 6, '#9aa3d6', 11); text(ctx, 'VCE', gx1 - 12, gy1 - 9, '#9aa3d6', 11);
      const iMax = Math.max(1e-6, calc(VBE, 5)[0] * 1.15);
      [VBE - 0.03, VBE, VBE + 0.02].forEach((vb, k) => {
        const pts = []; for (let v = 0; v <= 5; v += 0.02) pts.push([gx0 + v / 5 * (gx1 - gx0), gy1 - Math.max(0, Math.min(1.05, calc(vb, v)[0] / iMax)) * (gy1 - gy0)]);
        line(ctx, pts, k === 1 ? '#ff8a4c' : 'rgba(255,138,76,.3)', k === 1 ? 2.4 : 1.2);
      });
      dot(ctx, gx0 + VCE / 5 * (gx1 - gx0), gy1 - Math.max(0, Math.min(1.05, IC / iMax)) * (gy1 - gy0), 6, '#ffd257');
      text(ctx, 'רוויה', gx0 + 22, gy0 + 10, '#9aa3d6', 11); text(ctx, 'אזור פעיל', (gx0 + gx1) / 2 + 20, gy0 + 10, '#9aa3d6', 11);
    });
    upd();
    return g.destroy;
  };

  // ======================================================= 9. MOSFET
  sims.mos = box => {
    const g = setup(box, 300);
    const VT = 0.7, k = 2e-3; // k'·W/L = 2 mA/V²
    let VGS = 1.5, VDS = 0.5, ID = 0, reg = '';
    const el = [];
    const idOf = (vgs, vds) => { const ov = vgs - VT; if (ov <= 0) return 0; return vds < ov ? k * (ov * vds - vds * vds / 2) : 0.5 * k * ov * ov; };
    function upd() {
      ID = idOf(VGS, VDS); const ov = VGS - VT;
      reg = VGS < 0 ? 'acc' : ov <= 0 ? 'cut' : VDS < ov ? 'lin' : 'sat';
      const names = { acc: ['הצטברות חורים — אין תעלה', '#ff8fa3'], cut: ['מחסור / קטעון — אין תעלה', '#9aa3d6'], lin: ['היפוך — אזור לינארי', '#3fd68f'], sat: ['היפוך — רוויה (pinch-off)', '#ffd257'] };
      g.tag(names[reg][0], names[reg][1]);
      g.readout([['ID', fmtA(ID)], ['VGS − VT', (ov).toFixed(2) + ' V'], ['VT', VT + ' V'], ['k\'·W/L', '2 mA/V²']]);
    }
    g.slider('VGS (שער)', -1, 3, 0.02, 1.5, v => v.toFixed(2) + ' V', v => { VGS = v; upd(); });
    g.slider('VDS (נקז)', 0, 3, 0.02, 0.5, v => v.toFixed(2) + ' V', v => { VDS = v; upd(); });
    g.loop(dt => {
      const { ctx, W } = g;
      const sy = 46, x0 = 14, x1 = W - 14, sw = (x1 - x0) * .2, chx0 = x0 + sw, chx1 = x1 - sw, bot = 140;
      ctx.fillStyle = 'rgba(255,143,163,.14)'; ctx.fillRect(x0, sy, x1 - x0, bot - sy);
      text(ctx, 'מצע p', W / 2, bot - 10, '#ffb3c0', 12, 'center', true);
      ctx.fillStyle = 'rgba(111,168,255,.4)'; ctx.fillRect(x0, sy, sw, 40); ctx.fillRect(chx1, sy, sw, 40);
      text(ctx, 'מקור n⁺', x0 + sw / 2, sy + 20, '#e6e9ff', 11, 'center', true); text(ctx, 'נקז n⁺', chx1 + sw / 2, sy + 20, '#e6e9ff', 11, 'center', true);
      ctx.fillStyle = '#c9d4ff55'; ctx.fillRect(chx0, sy - 8, chx1 - chx0, 8); // תחמוצת
      ctx.fillStyle = '#8a95c8'; ctx.fillRect(chx0, sy - 26, chx1 - chx0, 18); // שער
      text(ctx, 'שער  VGS=' + VGS.toFixed(2), W / 2, sy - 17, '#0d0f1f', 11, 'center', true);
      text(ctx, 'SiO₂', chx1 - 18, sy - 4, '#cfd6ff', 9);
      const ov = VGS - VT;
      if (VGS < 0) { for (let x = chx0 + 6; x < chx1; x += 12) dot(ctx, x, sy + 5, 3.5, null, HOLE); }
      else {
        // אזור מחסור מתחת לשער
        const dep = Math.min(40, 8 + Math.min(VGS, VT) / VT * 26);
        ctx.fillStyle = 'rgba(13,15,31,.55)'; ctx.fillRect(chx0, sy, chx1 - chx0, dep);
        for (let x = chx0 + 8; x < chx1; x += 14) text(ctx, '−', x, sy + dep / 2 + 4, '#ff8fa3', 11);
      }
      // תעלה
      if (ov > 0) {
        const vsat = Math.min(VDS, ov);
        ctx.beginPath(); ctx.moveTo(chx0, sy);
        const pts = [];
        for (let x = chx0; x <= chx1; x += 2) {
          const u = (x - chx0) / (chx1 - chx0);
          // קירוב התעלה ההדרגתית: עובי התעלה ∝ VGS − VT − V(x) = √(ov² − 2u·F)
          const F = ov * vsat - vsat * vsat / 2;
          const r = Math.sqrt(Math.max(0, ov * ov - 2 * u * F)); // ∝ VGS − VT − V(x)
          const th = r > 0.01 ? Math.min(26, 4 + r * 10) : 0;
          pts.push([x, sy + th]);
        }
        ctx.lineTo(...pts[0]); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(chx1, sy); ctx.closePath();
        ctx.fillStyle = 'rgba(111,168,255,.75)'; ctx.fill();
        if (reg === 'sat') text(ctx, 'pinch-off', chx1 - 28, sy + 16, '#ffd257', 10, 'center', true);
        const rate = Math.min(30, ID * 1e4);
        if (Math.random() < rate * dt) el.push({ x: x0 + sw / 2, y: sy + 3 + Math.random() * 3 });
      }
      for (let i = el.length - 1; i >= 0; i--) { const e = el[i]; e.x += (60 + ID * 3e4) * dt; if (e.x > x1 - sw / 2) { el.splice(i, 1); continue; } dot(ctx, e.x, e.y, 3, '#d6e6ff'); }
      // עקומת ID-VDS
      const gx0 = 26, gx1 = W - 12, gy0 = 162, gy1 = 292;
      line(ctx, [[gx0, gy0], [gx0, gy1], [gx1, gy1]], '#3a4590', 1.5);
      text(ctx, 'ID', 14, gy0 + 6, '#9aa3d6', 11); text(ctx, 'VDS', gx1 - 12, gy1 - 9, '#9aa3d6', 11);
      const iMax = Math.max(0.5 * k * Math.pow(3 - VT, 2), 1e-6);
      [1.5, 2, 2.5, 3].forEach(vg => { const pts = []; for (let v = 0; v <= 3; v += 0.03) pts.push([gx0 + v / 3 * (gx1 - gx0), gy1 - idOf(vg, v) / iMax * (gy1 - gy0)]); line(ctx, pts, 'rgba(47,214,255,.25)', 1.2); });
      if (ov > 0) {
        const pts = []; for (let v = 0; v <= 3; v += 0.03) pts.push([gx0 + v / 3 * (gx1 - gx0), gy1 - idOf(VGS, v) / iMax * (gy1 - gy0)]); line(ctx, pts, '#2fd6ff', 2.4);
        // קו הרוויה VDS = VGS − VT
        const lp = []; for (let o = 0; o <= 3 - VT; o += 0.05) lp.push([gx0 + o / 3 * (gx1 - gx0), gy1 - 0.5 * k * o * o / iMax * (gy1 - gy0)]); line(ctx, lp, 'rgba(255,210,87,.5)', 1, [4, 4]);
      }
      dot(ctx, gx0 + VDS / 3 * (gx1 - gx0), gy1 - ID / iMax * (gy1 - gy0), 6, '#ffd257');
    });
    upd();
    return g.destroy;
  };

  SEMI.sims = sims;
  SEMI._sci = sci;
})();
