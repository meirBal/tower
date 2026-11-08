// כיבוש הממלכות — מנוע המשחק (בלי ציור ובלי רשת).
// אותו קוד רץ אצל המארח (סמכות), אצל המשתתפים (חיזוי בין עדכונים) ובבדיקות (node).
(function (root) {
  'use strict';

  const W = 1000, H = 1700, CELL = 8;
  const SPEED = 120;            // יחידות עולם לשנייה
  const VERSION = 'c1.0.0';
  const DOMINATE = 0.75;

  const FACTIONS = [
    { name: 'שבט האזמרגד', color: '#3fcf5f', dark: '#1d7a33', land: [150, 214, 120] },
    { name: 'אימפריית הארגמן', color: '#e8504a', dark: '#8f201c', land: [228, 146, 132] },
    { name: 'ממלכת החולות', color: '#f2b632', dark: '#946400', land: [238, 208, 130] },
    { name: 'ברית הסגול', color: '#a86ff0', dark: '#55289a', land: [190, 165, 226] },
    { name: 'צי התכלת', color: '#3a9df0', dark: '#16508a', land: [140, 190, 232] },
    { name: 'שבט הלהבה', color: '#ff8a2a', dark: '#9a4300', land: [244, 180, 128] },
    { name: 'אחוות הטורקיז', color: '#22c7b8', dark: '#0d6f66', land: [130, 214, 202] },
    { name: 'מסדר הוורד', color: '#f06aa8', dark: '#94245b', land: [238, 168, 200] },
  ];
  const NEUTRAL = { name: 'שטח חופשי', color: '#9aa3ad', dark: '#59616b', land: [200, 198, 186] };

  const DIFF = [
    { name: 'קל', think: [2.6, 4.0], grow: 0.8, margin: 6, neutral: [4, 10] },
    { name: 'רגיל', think: [1.5, 2.6], grow: 1.0, margin: 3, neutral: [6, 14] },
    { name: 'קשה', think: [1.0, 1.8], grow: 1.1, margin: 2, neutral: [8, 18] },
  ];

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- מפה: נגזרת מהזרע ומספר הממלכות בלבד, זהה בכל המכשירים ---------- */
  const mapCache = {};
  function buildMap(seed, nFactions) {
    const key = seed + ':' + nFactions;
    if (mapCache[key]) return mapCache[key];
    const R = rng(seed);
    const N = Math.min(60, 14 + nFactions * 5 + Math.floor(R() * 4));
    const pts = [];
    const minD = Math.sqrt(W * H / N) * 0.66;
    let tries = 0;
    while (pts.length < N && tries < 20000) {
      tries++;
      const x = 70 + R() * (W - 140), y = 70 + R() * (H - 140);
      const d = tries > 8000 ? minD * 0.8 : minD;
      if (pts.every(p => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) > d * d)) pts.push({ x, y });
    }
    const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
    // Lloyd: מחוזות בגודל דומה
    for (let pass = 0; pass < 3; pass++) {
      const sx = new Float64Array(pts.length), sy = new Float64Array(pts.length), sc = new Float64Array(pts.length);
      for (let gy = 0; gy < GH; gy += 2) for (let gx = 0; gx < GW; gx += 2) {
        const x = gx * CELL, y = gy * CELL;
        let best = 0, bd = 1e18;
        for (let i = 0; i < pts.length; i++) { const dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
        sx[best] += x; sy[best] += y; sc[best]++;
      }
      for (let i = 0; i < pts.length; i++) if (sc[i]) { pts[i].x = sx[i] / sc[i]; pts[i].y = sy[i] / sc[i]; }
    }
    const grid = new Int16Array(GW * GH);
    const water = new Uint8Array(GW * GH);
    const ph1 = R() * 6, ph2 = R() * 6, amp = 0.07 + R() * 0.05, pos = 0.38 + R() * 0.24;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const x = gx * CELL + Math.sin(gy * 0.21 + gx * 0.07 + ph1) * 9, y = gy * CELL + Math.cos(gx * 0.19 + gy * 0.08 + ph2) * 9;
      let best = 0, bd = 1e18;
      for (let i = 0; i < pts.length; i++) { const dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      const k = gy * GW + gx;
      grid[k] = best;
      const cy = H * (pos + amp * Math.sin(gx * CELL / W * 7 + ph1));
      if (Math.abs(gy * CELL - cy) < 11) water[k] = 1;
    }
    const nb = pts.map(() => new Set());
    const cells = new Int32Array(pts.length);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const k = gy * GW + gx, r = grid[k]; cells[r]++;
      if (gx + 1 < GW && grid[k + 1] !== r) { nb[r].add(grid[k + 1]); nb[grid[k + 1]].add(r); }
      if (gy + 1 < GH && grid[k + GW] !== r) { nb[r].add(grid[k + GW]); nb[grid[k + GW]].add(r); }
    }
    // נקודת התווית בתוך היבשה
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      for (let step = 0; step < 6; step++) {
        const gx = Math.floor(p.x / CELL), gy = Math.floor(p.y / CELL), k = gy * GW + gx;
        if (!water[k] && grid[k] === i) break;
        p.y += 10;
      }
    }
    const mine = pts.map(() => R() < 0.16);
    const map = { seed, W, H, CELL, GW, GH, grid, water, pts, nb: nb.map(s => Array.from(s)), mine, cells };
    map.dist = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
    mapCache[key] = map;
    return map;
  }

  /* ---------- יצירת משחק ---------- */
  // players: [{ name, bot, uid }]
  function createGame(opts) {
    const seed = opts.seed >>> 0;
    const players = opts.players.map((p, i) => ({ name: p.name || FACTIONS[i].name, bot: !!p.bot, uid: p.uid || null, alive: true, out: 0 }));
    const nF = players.length;
    const map = buildMap(seed, nF);
    const R = rng(seed ^ 0x9e3779b9);
    const diff = opts.diff == null ? 1 : opts.diff;
    const regions = map.pts.map((p, i) => ({ id: i, owner: -1, troops: 0, level: 1, capital: false, mine: map.mine[i] }));
    // עמדות פתיחה: דגימת הנקודה הרחוקה ביותר
    const starts = [];
    const firstCorner = Math.floor(R() * 4);
    const cx = [0.18, 0.82, 0.82, 0.18][firstCorner] * W, cy = [0.85, 0.85, 0.15, 0.15][firstCorner] * H;
    let s0 = 0, bd = 1e18;
    map.pts.forEach((p, i) => { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; s0 = i; } });
    starts.push(s0);
    while (starts.length < nF) {
      let best = -1, bv = -1;
      for (let i = 0; i < regions.length; i++) {
        if (starts.includes(i)) continue;
        const p = map.pts[i];
        const edge = Math.min(p.x, W - p.x, p.y, H - p.y);
        const m = Math.min(...starts.map(s => map.dist(s, i))) + Math.min(edge, 160) * 0.6;
        if (m > bv) { bv = m; best = i; }
      }
      starts.push(best);
    }
    // ערבוב: מי מתחיל איפה
    for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
    starts.forEach((rid, f) => {
      const r = regions[rid];
      r.owner = f; r.capital = true; r.troops = 20; r.mine = false;
      const n = map.nb[rid].map(i => regions[i]).filter(x => x.owner < 0 && !x.capital).sort((a, b) => map.dist(rid, a.id) - map.dist(rid, b.id))[0];
      if (n) { n.owner = f; n.troops = 8; }
    });
    const [a, b] = DIFF[diff].neutral;
    for (const r of regions) if (r.owner < 0) r.troops = Math.round(a + R() * (b - a)) + (r.mine ? 4 : 0);
    return {
      v: VERSION, seed, diff, t: 0, players, regions, armies: [], nextArmy: 1,
      coins: players.map(() => 0), stats: players.map(() => ({ cap: 0, lost: 0, peak: 0, sent: 0 })),
      over: false, winner: -1, events: [], aiT: players.map((_, i) => 1 + i * 0.37),
    };
  }

  const fac = o => (o < 0 ? NEUTRAL : FACTIONS[o]);
  const capOf = r => 25 + r.level * 20 + (r.capital ? 20 : 0);
  function growthOf(g, r) {
    if (r.owner < 0) return 0;
    let v = 0.8 + 0.5 * (r.level - 1);
    if (r.capital) v += 0.6;
    if (g.players[r.owner] && g.players[r.owner].bot) v *= DIFF[g.diff].grow;
    if (g.noCap && g.noCap[r.owner]) v *= 0.6;   // ממלכה בלי בירה גדלה לאט
    return v;
  }
  const upgradeCost = r => (r.level >= 3 ? Infinity : 12 * r.level + 6);
  const defenseOf = r => 1 + 0.1 * (r.level - 1) + (r.capital ? 0.15 : 0);

  /* ---------- מסלול: דרך שטחים שלך עד היעד ---------- */
  function route(g, pid, from, to) {
    const map = buildMap(g.seed, g.players.length);
    if (from === to) return null;
    if (g.regions[from].owner !== pid) return null;
    // BFS לפי מרחק (Dijkstra קטן) — צמתי ביניים חייבים להיות שלך
    const n = g.regions.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[from] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) return null;
      if (u === to) break;
      done[u] = 1;
      if (u !== from && g.regions[u].owner !== pid) continue;
      for (const v of map.nb[u]) {
        const d = dist[u] + map.dist(u, v);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    const path = [];
    for (let u = to; u >= 0; u = prev[u]) path.unshift(u);
    return path[0] === from ? path : null;
  }

  function pathLen(map, path) { let L = 0; for (let i = 1; i < path.length; i++) L += map.dist(path[i - 1], path[i]); return L; }

  function armyPos(g, a) {
    const map = buildMap(g.seed, g.players.length);
    let d = a.d;
    for (let i = 1; i < a.path.length; i++) {
      const s = map.dist(a.path[i - 1], a.path[i]);
      if (d <= s || i === a.path.length - 1) {
        const p0 = map.pts[a.path[i - 1]], p1 = map.pts[a.path[i]], f = s ? Math.min(1, d / s) : 1;
        return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, ang: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
      }
      d -= s;
    }
    const p = map.pts[a.path[0]];
    return { x: p.x, y: p.y, ang: 0 };
  }

  /* ---------- פקודות ---------- */
  function order(g, pid, froms, to) {
    if (g.over || !g.players[pid] || !g.players[pid].alive) return 0;
    if (!(to >= 0 && to < g.regions.length)) return 0;
    const map = buildMap(g.seed, g.players.length);
    let sent = 0;
    const seen = new Set();
    for (const f of froms) {
      if (seen.has(f) || f === to || !(f >= 0 && f < g.regions.length)) continue;
      seen.add(f);
      const src = g.regions[f];
      if (src.owner !== pid) continue;
      const n = Math.floor(src.troops);
      if (n < 1) continue;
      const path = route(g, pid, f, to);
      if (!path) continue;
      src.troops -= n;
      g.armies.push({ id: g.nextArmy++, o: pid, n, path, d: 0, L: pathLen(map, path) });
      g.stats[pid].sent += n;
      sent += n;
    }
    return sent;
  }

  function upgrade(g, pid, id) {
    const r = g.regions[id];
    if (!r || r.owner !== pid || g.over) return false;
    const c = upgradeCost(r);
    if (g.coins[pid] < c) return false;
    g.coins[pid] -= c; r.level++;
    g.events.push({ k: 'up', r: id, o: pid });
    return true;
  }

  function arrive(g, a) {
    const r = g.regions[a.path[a.path.length - 1]];
    if (r.owner === a.o) { r.troops += a.n; g.events.push({ k: 'reinf', r: r.id, o: a.o }); return; }
    const def = defenseOf(r);
    const dmg = a.n / def;
    if (dmg <= r.troops) { r.troops -= dmg; g.events.push({ k: 'hit', r: r.id, o: a.o }); return; }
    const prev = r.owner;
    r.troops = (dmg - r.troops) * def;
    r.owner = a.o;
    r.level = 1;
    g.coins[a.o] += 5 + (r.mine ? 5 : 0) + (r.capital && prev >= 0 ? 15 : 0);
    g.stats[a.o].cap++;
    if (prev >= 0) g.stats[prev].lost++;
    g.events.push({ k: 'cap', r: r.id, o: a.o, p: prev });
  }

  /* ---------- בינה מלאכותית ---------- */
  function aiThink(g, pid) {
    const map = buildMap(g.seed, g.players.length);
    const D = DIFF[g.diff];
    const mine = g.regions.filter(r => r.owner === pid);
    if (!mine.length) return;
    // שדרוג בירה/חזית כשיש כסף
    if (g.coins[pid] > 30) {
      const pick = mine.filter(r => r.level < 3).sort((a, b) => (b.capital - a.capital) || (b.troops - a.troops))[0];
      if (pick) upgrade(g, pid, pick.id);
    }
    // מי מוביל? קצת לחץ עליו כדי שהמשחק לא יוכרע מוקדם
    const counts = g.players.map((_, i) => 0);
    for (const r of g.regions) if (r.owner >= 0) counts[r.owner]++;
    let leader = -1, lc = 0;
    counts.forEach((c, i) => { if (c > lc) { lc = c; leader = i; } });
    const total = g.regions.length;
    const aliveN = g.players.filter(p => p.alive).length;

    const frontier = new Set();
    for (const r of mine) for (const v of map.nb[r.id]) if (g.regions[v].owner !== pid) frontier.add(v);
    let best = null, bestScore = -1e9;
    const peace = g.t < 35 + 4 * g.players.length;   // שלב הקמה: בוטים לא תוקפים שחקנים ב-40 השניות הראשונות
    for (const t of frontier) {
      const tr = g.regions[t];
      if (peace && tr.owner >= 0) continue;
      const incoming = g.armies.reduce((s, a) => s + (a.o === pid && a.path[a.path.length - 1] === t ? a.n : 0), 0);
      // מקורות: השכנים שלי של היעד + עוד אחד מהעורף
      const adj = map.nb[t].map(i => g.regions[i]).filter(r => r.owner === pid && r.troops >= 3).sort((a, b) => b.troops - a.troops);
      // גם הטבעת השנייה (שכנים של השכנים) יכולה לשלוח דרך השטח שלי
      const ring2 = [];
      for (const r of adj) for (const v of map.nb[r.id]) { const x = g.regions[v]; if (x.owner === pid && x.troops >= 8 && !adj.includes(x) && !ring2.includes(x)) ring2.push(x); }
      ring2.sort((a, b) => b.troops - a.troops);
      if (!adj.length) continue;
      const travel = map.dist(adj[0].id, t) / SPEED;
      const need = (tr.troops + growthOf(g, tr) * travel) * defenseOf(tr) + D.margin - incoming;
      let have = 0; const use = [];
      for (const s of adj.concat(ring2)) { if (have > need) break; have += Math.floor(s.troops); use.push(s.id); }
      if (have <= need) continue;
      let score = 30 - need * 0.9 + have * 0.05;
      if (tr.owner < 0) score += 5 + (tr.mine ? 6 : 0);
      if (tr.capital) score += 10;
      if (tr.owner >= 0 && tr.owner === leader && lc > total * 0.3 && leader !== pid && aliveN > 2) score += 14;
      if (tr.owner >= 0 && aliveN <= 2) score += 6;
      if (tr.owner >= 0 && g.players[tr.owner] && !g.players[tr.owner].bot) score += D.margin < 3 ? 4 : 0;
      if (score > bestScore) { bestScore = score; best = [use, t]; }
    }
    if (best) { order(g, pid, best[0], best[1]); return; }
    // אין התקפה טובה: מעבירים כוחות מהעורף לחזית
    const interior = mine.filter(r => map.nb[r.id].every(v => g.regions[v].owner === pid) && r.troops >= 12);
    if (interior.length) {
      const front = mine.filter(r => map.nb[r.id].some(v => g.regions[v].owner !== pid));
      if (front.length) {
        const s = interior.sort((a, b) => b.troops - a.troops)[0];
        const tgt = front.sort((a, b) => map.dist(s.id, a.id) - map.dist(s.id, b.id))[0];
        order(g, pid, [s.id], tgt.id);
      }
    }
  }

  /* ---------- צעד סימולציה ----------
     auth=true: מארח/משחק יחיד — מכריע קרבות, בוטים, ניצחון.
     auth=false: חיזוי אצל משתתף — רק גדילה ותנועה. */
  function step(g, dt, auth, rand) {
    if (g.over) return;
    rand = rand || Math.random;
    g.t += dt;
    const map = buildMap(g.seed, g.players.length);
    const counts = g.players.map(() => 0);
    const caps = g.players.map(() => 0);
    for (const r of g.regions) if (r.capital && r.owner >= 0) caps[r.owner]++;
    g.noCap = caps.map(c => c === 0);
    for (const r of g.regions) {
      if (r.owner < 0) continue;
      counts[r.owner]++;
      const cap = capOf(r);
      if (r.troops < cap) r.troops = Math.min(cap, r.troops + growthOf(g, r) * dt);
      else r.troops = Math.max(cap, r.troops - dt * 0.5);
      g.coins[r.owner] += (0.16 + (r.mine ? 0.5 : 0)) * dt;
    }
    for (const a of g.armies) a.d = Math.min(a.L, a.d + SPEED * dt);
    if (!auth) return;

    // התנגשות צבאות בדרך
    if (g.armies.length > 1) {
      const pos = g.armies.map(a => armyPos(g, a));
      for (let i = 0; i < g.armies.length; i++) for (let j = i + 1; j < g.armies.length; j++) {
        const a = g.armies[i], b = g.armies[j];
        if (a.o === b.o || a.n <= 0 || b.n <= 0) continue;
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        if (dx * dx + dy * dy < 22 * 22) {
          const m = Math.min(a.n, b.n); a.n -= m; b.n -= m;
          g.events.push({ k: 'clash', x: (pos[i].x + pos[j].x) / 2, y: (pos[i].y + pos[j].y) / 2 });
        }
      }
    }
    const keep = [];
    for (const a of g.armies) {
      if (a.n <= 0) continue;
      if (a.d >= a.L) arrive(g, a); else keep.push(a);
    }
    g.armies = keep;

    g.players.forEach((p, i) => {
      if (!p.alive) return;
      if (!p.bot) return;
      g.aiT[i] -= dt;
      if (g.aiT[i] <= 0) {
        const [lo, hi] = DIFF[g.diff].think;
        g.aiT[i] = lo + (hi - lo) * rand();
        aiThink(g, i);
      }
    });

    // מי עוד בחיים
    const has = g.players.map(() => false);
    for (const r of g.regions) if (r.owner >= 0) has[r.owner] = true;
    for (const a of g.armies) has[a.o] = true;
    let aliveN = 0, last = -1;
    g.players.forEach((p, i) => {
      if (p.alive && !has[i]) { p.alive = false; p.out = g.t; g.events.push({ k: 'out', o: i }); }
      if (p.alive) { aliveN++; last = i; }
      g.stats[i].peak = Math.max(g.stats[i].peak, counts[i]);
    });
    // שליטה: מי שמחזיק 75% מהמפה מנצח מיד (מונע סופי משחק ארוכים)
    let dom = -1;
    counts.forEach((c, i) => { if (c >= Math.ceil(g.regions.length * DOMINATE)) dom = i; });
    if (dom >= 0 && aliveN > 1) {
      g.players.forEach((p, i) => { if (i !== dom && p.alive) { p.alive = false; p.out = g.t + counts[i] / 1000; } });
      aliveN = 1; last = dom;
    }
    if (aliveN <= 1) { g.over = true; g.winner = last; g.events.push({ k: 'win', o: last }); }
  }

  /* מקום בטבלה: מנצח 1, השאר לפי זמן ההדחה (מאוחר = טוב), ואז לפי מחוזות */
  function ranking(g) {
    const counts = g.players.map(() => 0);
    for (const r of g.regions) if (r.owner >= 0) counts[r.owner]++;
    return g.players.map((p, i) => i).sort((a, b) => {
      if (a === g.winner) return -1; if (b === g.winner) return 1;
      const pa = g.players[a], pb = g.players[b];
      if (pa.alive !== pb.alive) return pa.alive ? -1 : 1;
      if (pa.alive) return counts[b] - counts[a];
      return pb.out - pa.out;
    });
  }

  /* ---------- סנכרון: תמונת מצב קומפקטית ---------- */
  function snapshot(g) {
    return {
      t: Math.round(g.t * 100) / 100,
      r: g.regions.map(r => [r.owner, Math.round(r.troops * 10) / 10, r.level, r.capital ? 1 : 0]),
      a: g.armies.map(a => [a.id, a.o, a.n, a.path, Math.round(a.d)]),
      c: g.coins.map(c => Math.round(c * 10) / 10),
      p: g.players.map(p => [p.alive ? 1 : 0, p.bot ? 1 : 0, Math.round(p.out)]),
      s: g.stats.map(s => [s.cap, s.lost, s.peak, s.sent]),
      o: g.over ? 1 : 0, w: g.winner, n: g.nextArmy,
    };
  }
  /* בדיקת תמונת מצב שהגיעה מהרשת — הודעה פגומה לא תגיע לציור */
  function validSnapshot(g, s) {
    const n = g.regions.length, P = g.players.length;
    const num = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    if (!s || typeof s !== 'object' || !num(s.t, 0, 1e6)) return false;
    if (!Array.isArray(s.r) || s.r.length !== n || !Array.isArray(s.a) || s.a.length > 500) return false;
    if (!Array.isArray(s.c) || s.c.length !== P || !Array.isArray(s.p) || s.p.length !== P || !Array.isArray(s.s) || s.s.length !== P) return false;
    if (!s.r.every(x => Array.isArray(x) && int(x[0], -1, P - 1) && num(x[1], 0, 1e6) && int(x[2], 1, 3))) return false;
    if (!s.a.every(x => Array.isArray(x) && int(x[1], 0, P - 1) && num(x[2], 1, 1e6) && Array.isArray(x[3]) && x[3].length >= 2 && x[3].length <= n &&
      x[3].every(v => int(v, 0, n - 1)) && num(x[4], 0, 1e6))) return false;
    if (!s.c.every(c => num(c, 0, 1e7)) || !s.p.every(x => Array.isArray(x)) || !s.s.every(x => Array.isArray(x) && x.every(v => num(v, 0, 1e7)))) return false;
    if (!int(s.w, -1, P - 1) || !int(s.n, 0, 1e9)) return false;
    return true;
  }
  function applySnapshot(g, s) {
    const map = buildMap(g.seed, g.players.length);
    g.t = s.t;
    s.r.forEach((x, i) => { const r = g.regions[i]; r.owner = x[0]; r.troops = x[1]; r.level = x[2]; r.capital = !!x[3]; });
    g.armies = s.a.map(x => ({ id: x[0], o: x[1], n: x[2], path: x[3], d: x[4], L: pathLen(map, x[3]) }));
    g.coins = s.c.slice();
    s.p.forEach((x, i) => { const p = g.players[i]; p.alive = !!x[0]; p.bot = !!x[1]; p.out = x[2]; });
    s.s.forEach((x, i) => { g.stats[i] = { cap: x[0], lost: x[1], peak: x[2], sent: x[3] }; });
    g.over = !!s.o; g.winner = s.w; g.nextArmy = s.n;
  }

  const CQ = { DOMINATE, W, H, CELL, SPEED, VERSION, FACTIONS, NEUTRAL, DIFF, rng, buildMap, createGame, step, order, upgrade, route, armyPos, aiThink, ranking, snapshot, applySnapshot, validSnapshot, fac, capOf, growthOf, upgradeCost, defenseOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = CQ; else root.CQ = CQ;
})(typeof self !== 'undefined' ? self : this);
