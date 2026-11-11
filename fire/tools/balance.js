// בדיקת איזון: בוט שמשחק כמו שחקן רגיל (נכנס כל ~3 שעות ביום, ישן בלילה) ומדווח מתי הגיע לכל רמה.
// הרצה: node fire/tools/balance.js [seed] [days]
'use strict';
const E = require('../js/engine.js');
const seed = +(process.argv[2] || 7), days = +(process.argv[3] || 40);
const H = E.HOUR;
const s = E.newGame(0, seed);
const causes = {};
const _log = s.log; s.log = new Proxy(_log, { get(t, k) { if (k === 'unshift') return (x) => { const m = x.msg.match(/^💀 .*? (נהרג|מת|נטרף)/); if (m) causes[m[1]] = (causes[m[1]] || 0) + 1; return t.unshift(x); }; return Reflect.get(t, k); } });
const reached = { 1: 0 };
let minFood = 1e9, minFuel = 1e9, starveH = 0, darkH = 0;

const RES_ORDER = ['stonetools', 'weaving', 'torches', 'huts', 'firering', 'scout', 'dogs', 'traps', 'smoking', 'workshop', 'bow', 'pottery',
  'longhouse', 'herding', 'horses', 'charcoal', 'palisade', 'farming', 'tower', 'copper', 'wheel', 'writing'];

function need(s) { // מה חסר לשדרוג הבא + מזון
  const up = (E.LEVELS[s.level].up) || {};
  const w = {};
  for (const k in up) w[k] = Math.max(0, up[k] - s.res[k]) / up[k];
  const foodH = s.res.food / Math.max(0.1, E.foodRate(s) - E.foodProd(s));
  w.food = foodH < 24 ? 3 : foodH < 48 ? 1 : foodH < 200 ? 0.1 : 0;
  w.wood = (w.wood || 0) + (s.res.wood < 100 ? 1 : 0.2);
  w.fiber = s.res.fiber < 60 ? 0.8 : 0;
  if (E.has(s, 'stonetools')) w.flint = s.res.flint < 6 ? 0.8 : 0.05;
  if (E.has(s, 'scout') || s.level >= 2) w.hide = Math.max(w.hide || 0, s.res.hide < 30 ? 0.7 : 0);
  return w;
}
const SITE_FOR = { wood: 'forest', fiber: 'forest', food: 'bushes', stone: 'rocks', flint: 'rocks', hide: 'game', clay: 'clay', copper: 'copper', charcoal: null };
const TOOL_FOR = { forest: ['caxe', 'axe'], rocks: ['cpick', 'pick'], clay: ['cpick', 'pick'], copper: ['cpick', 'pick'], game: ['cspear', 'bow', 'spear'], bushes: ['basket'] };

function tryCraft(type) {
  const r = E.RECIPES.find(x => x.out === type); if (!r) return false;
  const slots = []; for (const k in r.in) for (let i = 0; i < r.in[k]; i++) slots.push(k);
  if (slots.length > E.craftSlots(s)) return false;
  return !!E.craft(s, slots).ok;
}

function session() {
  // מחקר
  if (!s.research.cur) for (const id of RES_ORDER) { if (!E.startResearch(s, id)) break; }
  // שדרוג
  while (!E.upgrade(s)) reached[s.level] = s.t / H;
  // בנייה
  const R = E.lightR(s) * 0.8;
  const spot = () => { for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, d = 0.6 + Math.random() * (R - 0.6); const x = Math.cos(a) * d, y = Math.sin(a) * d; if (s.buildings.every(b => Math.hypot(b.x - x, b.y - y) > 0.45)) return [x, y]; } return [0.7, 0]; };
  const tryB = t => { const [x, y] = spot(); return !E.build(s, t, x, y); };
  if (s.people.length >= E.housing(s) && s.people.length < (E.LEVELS[s.level].pop || 20) + 4) { if (E.has(s, 'longhouse')) tryB('longhouse'); else tryB('hut'); }
  const net = E.foodProd(s) - E.foodRate(s);
  if (net < 0) { tryB('field') || tryB('pen') || tryB('trap'); }
  if (E.count(s, 'kennel') < 1) tryB('kennel');
  while (!E.buyAnimal(s, 'dogs')) { /* */ }
  if (E.count(s, 'stable') < 1) tryB('stable');
  while (!E.buyAnimal(s, 'horses')) { /* */ }
  if (E.count(s, 'kiln') < 2) tryB('kiln');
  if (E.count(s, 'palisade') < 1) tryB('palisade');
  if (E.count(s, 'tower') < 1) tryB('tower');
  s.kilnOn = s.res.charcoal < 400;
  // לפידים
  if (s.res.torch < 2) tryCraft('torch');
  // תכנון עבודה
  const w = need(s);
  const want = Object.entries(w).sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(k => SITE_FOR[k]);
  E.idle(s).forEach((p, i) => {
    let sent = false;
    const order = want.slice(i % Math.min(3, want.length)).concat(want.slice(0, i % Math.min(3, want.length)));
    for (const r of order) {
      const type = SITE_FOR[r];
      const sites = s.sites.filter(o => o.seen && o.type === type && o.stock > 20 && (!E.SITES[type].req || E.has(s, E.SITES[type].req)))
        .sort((a, b) => (E.isLit(s, a.x, a.y) ? 0 : 3) + a.d - ((E.isLit(s, b.x, b.y) ? 0 : 3) + b.d));
      if (!sites.length) {
        if (r !== 'fiber' && r !== 'flint' && !s.exps.some(e => e.kind === 'explore')) { // לחקור
          const a = Math.random() * 6.28, d = E.lightR(s) + 1;
          const pl = E.planExplore(s, Math.cos(a) * d, Math.sin(a) * d, [p.id], { torch: true });
          if (!pl.err) { E.start(s, pl, false); sent = true; break; }
        }
        continue;
      }
      // כלי מתאים
      const tt = TOOL_FOR[type] || [];
      if (!p.tool || !tt.includes(E.toolOf(s, p).type)) {
        let tool = s.tools.find(t => tt.includes(t.type) && !s.people.some(o => o.tool === t.id));
        if (!tool) for (const ty of tt) if (tryCraft(ty)) { tool = s.tools[s.tools.length - 1]; break; }
        if (tool) E.equip(s, p.id, tool.id);
      }
      const pl = E.planGather(s, sites[0].id, [p.id], { horses: 1, dogs: E.isLit(s, sites[0].x, sites[0].y) ? 0 : 1 });
      if (!pl.err) { E.start(s, pl, true); sent = true; break; }
    }
    void sent;
  });
  if (!E.toolOf(s, s.people[0] || {}) && !s.tools.some(t => t.type === 'hammer')) tryCraft('hammer');
}

for (let h = 0; h < days * 24 && !s.over; h++) {
  const hod = (h + 8) % 24; // מתחילים ב-8 בבוקר
  const awake = hod >= 8 && hod <= 23;
  if (awake && h % 3 === 0) session();
  for (let m = 0; m < 60; m++) {
    E.step(s);
    minFood = Math.min(minFood, s.res.food); minFuel = Math.min(minFuel, s.fuel);
  }
  if (s.starving) starveH++; if (s.fuel <= 0) darkH++;
}
const fmt = h => h < 48 ? h.toFixed(1) + 'h' : (h / 24).toFixed(1) + 'd';
console.log('seed', seed, '| level', s.level, '| pop', s.people.length, '| died', s.stats.died, '| born', s.stats.born, '| over', s.over);
console.log('reached:', Object.entries(reached).map(([l, h]) => `L${l}@${fmt(h)}`).join('  '));
console.log('deaths by cause', causes);
console.log('starving hours', starveH, '| dark hours', darkH, '| minFood', minFood.toFixed(1), '| minFuel', minFuel.toFixed(1));
console.log('res', Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, Math.round(v)])));
console.log('research', Object.keys(s.research.done).length, '/', E.RESEARCH.length, '| buildings', s.buildings.map(b => b.type).join(','), '| dogs', s.dogs, 'horses', s.horses);
console.log('last log:', s.log.slice(0, 6).map(l => l.msg).join(' | '));
if (process.env.DBG) {
  const all = s.log.slice().reverse();
  const causes = {}; all.forEach(l => { const m = l.msg.match(/💀 \S+(?: \d+)? (.*)/); if (m) causes[m[1]] = (causes[m[1]] || 0) + 1; });
  console.log('death causes (last 120 log):', causes);
}
