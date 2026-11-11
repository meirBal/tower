// מהמדורה למעצמה — מנוע: כלכלה, זמן, משלחות, יצירה, מחקר, בנייה ואויבים.
// אין כאן ציור או DOM: רץ גם ב-node לבדיקות איזון (tools/balance.js).
// יחידת זמן: דקה אמיתית. הזמן ממשיך גם כשהמשחק סגור (advance משלים את מה שעבר).
(function (root) {
  'use strict';
  const MIN = 60000, HOUR = 60 * MIN;

  /* ---------- כל המספרים במקום אחד ---------- */
  const CFG = {
    startFuel: 47, fuelMax: L => 50 + 30 * (L - 1),
    burn: L => 1 + 0.35 * (L - 1),                 // יחידות אש לשעה
    eat: L => 0.5 + 0.03 * L,                      // מזון לאדם לשעה
    dogEat: 0.25, horseEat: 0.4,
    baseR: L => 1.6 + 0.45 * (L - 1),              // רדיוס אור מלא
    travel: 4,                                      // דקות לכל יחידת מרחק, לכל כיוון
    rate: 0.4,                                     // משאב לדקה לאדם (לפני בונוס)
    carry: 10, horseCarry: 25, cartCarry: 40,
    minWork: 8, maxWork: 90,
    torchLife: 48 * 60, torchR: 1.1,
    house0: 3, growEvery: 240,
    starveEvery: 180, healEvery: 45, hp: 10, restHp: 4,
    raid: L => 0.02 + 0.012 * L,                    // סיכוי לשעה
    raidPow: L => 4 + 3 * L,
    maxLevel: 10,
  };

  const RES = {
    wood: { n: 'עץ', i: '🪵' }, stone: { n: 'אבן', i: '🪨' }, fiber: { n: 'סיבים', i: '🌿' }, food: { n: 'מזון', i: '🍖' },
    flint: { n: 'צור', i: '🔺' }, hide: { n: 'עור', i: '🦬' }, clay: { n: 'חימר', i: '🏺' }, charcoal: { n: 'פחם', i: '⚫' },
    copper: { n: 'נחושת', i: '🟠' }, torch: { n: 'לפיד', i: '🔥' },
  };
  const RES_KEYS = Object.keys(RES);

  const TOOLS = {
    axe: { n: 'גרזן אבן', i: '🪓', prof: 'חוטב עצים', bonus: { wood: 2 }, uses: 15 },
    pick: { n: 'מכוש צור', i: '⛏️', prof: 'כורה', bonus: { stone: 2, flint: 2, clay: 2, copper: 2 }, uses: 15 },
    spear: { n: 'חנית', i: '🔱', prof: 'צייד ושומר', bonus: { hunt: 2, hide: 2 }, def: 4, uses: 15 },
    basket: { n: 'סל קלוע', i: '🧺', prof: 'לקט', bonus: { gather: 2, fiber: 1.5 }, carry: 8, uses: 20 },
    hammer: { n: 'פטיש אבן', i: '🔨', prof: 'בנאי', build: 0.8 },
    pack: { n: 'תרמיל סייר', i: '🎒', prof: 'סייר', scout: 2.6, safe: 0.5, uses: 15 },
    bow: { n: 'קשת', i: '🏹', prof: 'קשת', bonus: { hunt: 3, hide: 3 }, def: 6, uses: 20 },
    caxe: { n: 'גרזן נחושת', i: '🪓', prof: 'חוטב מומחה', bonus: { wood: 3.5 }, uses: 30 },
    cpick: { n: 'מכוש נחושת', i: '⚒️', prof: 'כורה מומחה', bonus: { stone: 3.5, flint: 3.5, clay: 3.5, copper: 3.5 }, uses: 30 },
    cspear: { n: 'רומח נחושת', i: '🗡️', prof: 'לוחם', bonus: { hunt: 2.5, hide: 2.5 }, def: 10, uses: 30 },
  };
  // מתכונים ללא צורה: מה ששמים במשבצות (יחידה אחת בכל משבצת)
  const RECIPES = [
    { out: 'axe', in: { wood: 1, stone: 1, fiber: 1 }, req: 'stonetools' },
    { out: 'pick', in: { wood: 1, flint: 1, fiber: 1 }, req: 'stonetools' },
    { out: 'spear', in: { wood: 2, flint: 1 }, req: 'stonetools' },
    { out: 'hammer', in: { wood: 1, stone: 2 }, req: 'stonetools' },
    { out: 'basket', in: { fiber: 3 }, req: 'weaving' },
    { out: 'torch', in: { wood: 1, fiber: 1 }, req: 'torches', n: 2 },
    { out: 'pack', in: { hide: 1, fiber: 2 }, req: 'scout' },
    { out: 'bow', in: { wood: 2, fiber: 1, hide: 1 }, req: 'bow' },
    { out: 'caxe', in: { wood: 1, copper: 2, charcoal: 1 }, req: 'copper' },
    { out: 'cpick', in: { wood: 1, copper: 2, charcoal: 1 }, req: 'copper' },
    { out: 'cspear', in: { wood: 2, copper: 2, hide: 1 }, req: 'copper' },
    { out: 'cart', in: { wood: 5, copper: 2, hide: 2 }, req: 'wheel' },
  ];
  const ITEMS = { torch: { n: 'לפידים', i: '🔥' }, cart: { n: 'עגלה', i: '🛒' } };

  const SITES = {
    forest: { n: 'חורשה', i: '🌲', y: [['wood', 1, 'wood'], ['fiber', 0.3, 'fiber']], stock: [400, 800], regen: 4 },
    bushes: { n: 'שיחי פירות', i: '🫐', y: [['food', 1, 'gather'], ['fiber', 0.5, 'fiber']], stock: [250, 500], regen: 5 },
    rocks: { n: 'סלעים', i: '🪨', y: [['stone', 0.9, 'stone'], ['flint', 0.3, 'flint']], stock: [900, 1800], regen: 0 },
    game: { n: 'שטח ציד', i: '🦌', y: [['food', 0.8, 'hunt'], ['hide', 0.2, 'hide']], stock: [300, 600], regen: 4 },
    clay: { n: 'בור חימר', i: '🏺', y: [['clay', 0.8, 'clay']], stock: [500, 900], regen: 0 },
    copper: { n: 'עורק נחושת', i: '⛰️', y: [['copper', 0.4, 'copper'], ['stone', 0.4, 'stone']], stock: [500, 900], regen: 0, req: 'copper' },
  };

  const BUILD = {
    hut: { n: 'בקתה', i: '🛖', cost: { wood: 40, fiber: 20 }, req: 'huts', house: 2, d: '+2 מקומות מגורים' },
    trap: { n: 'מלכודות', i: '🪤', cost: { wood: 30, fiber: 30 }, req: 'traps', food: 1.5, d: '+1.5 מזון לשעה' },
    kennel: { n: 'מלונה', i: '🐕', cost: { wood: 50, hide: 6 }, req: 'dogs', dogs: 2, d: 'מקום ל-2 כלבי שמירה' },
    pen: { n: 'מכלאה', i: '🐐', cost: { wood: 120, fiber: 60 }, req: 'herding', food: 4, d: '+4 מזון לשעה' },
    stable: { n: 'אורווה', i: '🐎', cost: { wood: 150, hide: 15 }, req: 'horses', horses: 2, d: 'מקום ל-2 סוסים' },
    longhouse: { n: 'בית ארוך', i: '🏠', cost: { wood: 200, stone: 80, clay: 40 }, req: 'longhouse', house: 6, d: '+6 מקומות מגורים' },
    kiln: { n: 'כבשן פחם', i: '🧱', cost: { stone: 80, clay: 60 }, req: 'charcoal', kiln: 1, d: 'הופך 6 עץ ל-2 פחם בשעה (משאיר 60 עץ במלאי)' },
    palisade: { n: 'גדר עץ', i: '🚧', cost: { wood: 250, stone: 60 }, req: 'palisade', def: 15, d: '+15 הגנה לכפר' },
    tower: { n: 'מגדל שמירה', i: '🗼', cost: { wood: 200, stone: 200 }, req: 'tower', radius: 0.5, def: 6, d: '+0.5 רדיוס אור, +6 הגנה' },
    field: { n: 'שדה', i: '🌾', cost: { wood: 80, clay: 30, food: 40 }, req: 'farming', food: 6, d: '+6 מזון לשעה' },
  };

  const RESEARCH = [
    { id: 'stonetools', n: 'כלי אבן', lv: 1, cost: { wood: 8, stone: 8 }, min: 3, d: 'מתכונים: גרזן, מכוש, חנית, פטיש' },
    { id: 'weaving', n: 'קליעה', lv: 1, cost: { fiber: 8 }, min: 3, d: 'מתכון: סל קלוע (לקט)' },
    { id: 'torches', n: 'לפידים', lv: 1, cost: { wood: 10, fiber: 6 }, min: 5, d: 'מתכון: לפידים. משלחות חקר מציבות לפידים בחושך' },
    { id: 'firering', n: 'אבני מדורה', lv: 2, cost: { stone: 40 }, min: 15, d: 'המדורה שורפת 15% פחות', eff: { burn: 0.85 } },
    { id: 'huts', n: 'בקתות', lv: 2, cost: { wood: 40, fiber: 20 }, min: 20, d: 'בנייה: בקתה (+2 מגורים)' },
    { id: 'scout', n: 'סיירות', lv: 2, cost: { fiber: 20, hide: 2 }, min: 20, d: 'מתכון: תרמיל סייר — חוקר רחוק ובטוח יותר' },
    { id: 'traps', n: 'מלכודות', lv: 3, cost: { wood: 50, fiber: 40 }, min: 30, d: 'בנייה: מלכודות (מזון קבוע)' },
    { id: 'dogs', n: 'ביות כלבים', lv: 3, cost: { food: 60, hide: 8 }, min: 40, d: 'מלונה וכלבי שמירה: מגדילים את הטווח הבטוח ומגינים' },
    { id: 'smoking', n: 'עישון בשר', lv: 3, cost: { wood: 60, hide: 8 }, min: 40, d: 'הכפר אוכל 15% פחות', eff: { food: 0.85 } },
    { id: 'workshop', n: 'סדנה', lv: 4, cost: { wood: 120, stone: 80 }, min: 60, d: 'תיבת יצירה 3×3' },
    { id: 'bow', n: 'קשת וחץ', lv: 4, cost: { wood: 80, fiber: 60, hide: 15 }, min: 60, d: 'מתכון: קשת — ציד ושמירה חזקים' },
    { id: 'pottery', n: 'כלי חרס', lv: 4, cost: { clay: 40, wood: 60 }, min: 60, d: 'שימור מזון: הכפר אוכל 10% פחות', eff: { food: 0.9 } },
    { id: 'herding', n: 'רעייה', lv: 5, cost: { food: 150, wood: 120 }, min: 90, d: 'בנייה: מכלאה' },
    { id: 'horses', n: 'ביות סוסים', lv: 5, cost: { food: 200, hide: 30 }, min: 120, d: 'אורווה וסוסים: מובילים הרבה ציוד עם פחות אנשים' },
    { id: 'longhouse', n: 'בית ארוך', lv: 5, cost: { wood: 250, stone: 120, clay: 50 }, min: 120, d: 'בנייה: בית ארוך (+6 מגורים)' },
    { id: 'charcoal', n: 'פחם עץ', lv: 5, cost: { wood: 300, clay: 80 }, min: 180, d: 'כבשן פחם. פחם = 4 יחידות אש' },
    { id: 'palisade', n: 'גדר עץ', lv: 6, cost: { wood: 350, stone: 100 }, min: 180, d: 'בנייה: גדר (+15 הגנה)' },
    { id: 'tower', n: 'מגדל שמירה', lv: 7, cost: { wood: 300, stone: 300 }, min: 240, d: 'בנייה: מגדל שמירה (+אור, +הגנה)' },
    { id: 'farming', n: 'חקלאות', lv: 7, cost: { food: 300, wood: 200, clay: 80 }, min: 240, d: 'בנייה: שדה (+6 מזון לשעה)' },
    { id: 'copper', n: 'עיבוד נחושת', lv: 8, cost: { charcoal: 80, stone: 300 }, min: 360, d: 'כריית נחושת ומתכונים לכלי נחושת' },
    { id: 'wheel', n: 'הגלגל', lv: 9, cost: { wood: 500, copper: 40 }, min: 480, d: 'מתכון: עגלה (צריך 3×3) — +40 משא' },
    { id: 'writing', n: 'כתב', lv: 10, cost: { clay: 300, copper: 80 }, min: 600, d: 'מחקרים מהירים ב-30%', eff: { research: 0.7 } },
  ];
  const RESEARCH_BY = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

  // שדרוג המדורה = שדרוג הכפר (מעבר מרמה L לרמה L+1)
  const LEVELS = [
    null,
    { n: 'מדורה', up: { wood: 40, stone: 20 }, pop: 3 },
    { n: 'מחנה', up: { wood: 120, stone: 60, hide: 6 }, pop: 4 },
    { n: 'שבט', up: { wood: 250, stone: 150, hide: 20 }, pop: 5 },
    { n: 'כפר קטן', up: { wood: 500, stone: 300, clay: 80 }, pop: 6 },
    { n: 'כפר', up: { wood: 800, stone: 450, clay: 120, hide: 50 }, pop: 8 },
    { n: 'כפר מבוצר', up: { wood: 1100, stone: 700, charcoal: 100 }, pop: 10 },
    { n: 'יישוב', up: { wood: 1600, stone: 1000, charcoal: 180, clay: 200 }, pop: 12 },
    { n: 'עיירה קטנה', up: { wood: 2200, stone: 1400, copper: 80 }, pop: 14 },
    { n: 'עיירה', up: { wood: 3000, stone: 2000, copper: 180, charcoal: 300 }, pop: 16 },
    { n: 'עיר קטנה', up: null, pop: 18 },
  ];
  // הדרך ל-50 (מוצג כיעד; רמות מעל 10 יגיעו בגרסאות הבאות)
  const ROADMAP = [[15, 'עיר'], [20, 'עיר מבוצרת'], [25, 'ממלכה'], [30, 'עידן התעשייה'], [35, 'עידן החשמל'], [40, 'מעצמה'], [45, 'עידן המחשב'], [50, 'טירת ה-AI']];

  const NAMES = ['אוּג', 'נָה', 'קָרוּ', 'תָּמָה', 'בּוֹר', 'לִילָה', 'גוּר', 'אָרָה', 'דָּן', 'שׁוּלָה', 'רוּם', 'עָדָה', 'טוֹב', 'מִירָה', 'זֵב', 'נוֹעָה', 'חוּר', 'יָעֵל', 'בָּרָק', 'צִלָּה', 'עוֹז', 'דִּינָה', 'אֵיתָן', 'תִּרְצָה'];

  /* ---------- כלים ---------- */
  function rnd(s) { // mulberry32 על מצב שנשמר
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const dist = (x, y) => Math.hypot(x, y);
  const has = (s, id) => !!s.research.done[id];
  const log = (s, msg, k) => { s.log.unshift({ t: s.t, msg, k: k || '' }); if (s.log.length > 120) s.log.length = 120; if (s.events) s.events.push({ msg, k: k || '' }); };
  const fmtCost = c => Object.entries(c).map(([k, v]) => RES[k].i + Math.ceil(v)).join(' ');

  /* ---------- מצב חדש ---------- */
  function newGame(now, seed) {
    seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    const s = {
      v: 1, seed, rng: seed, t: now, created: now, nextId: 1,
      level: 1, fuel: CFG.startFuel, auto: true,
      res: Object.fromEntries(RES_KEYS.map(k => [k, 0])),
      tools: [], people: [], sites: [], torches: [], buildings: [], exps: [],
      dogs: 0, horses: 0, carts: 0,
      research: { done: {}, cur: null },
      log: [], over: false, won: false,
      clock: { grow: 0, starve: 0, heal: 0 }, starving: false,
      stats: { born: 0, died: 0, raids: 0, exps: 0 },
    };
    Object.assign(s.res, { wood: 15, stone: 6, fiber: 6, food: 30 });
    for (let i = 0; i < 3; i++) addPerson(s);
    genMap(s);
    reveal(s);
    log(s, 'שלושה אנשים ומדורה אחת בחושך. שלחו אותם להביא עץ — האש לא תחזיק לנצח.', 'info');
    return s;
  }
  function addPerson(s) {
    const used = new Set(s.people.map(p => p.name));
    const free = NAMES.filter(n => !used.has(n));
    const name = free.length ? free[Math.floor(rnd(s) * free.length)] : NAMES[Math.floor(rnd(s) * NAMES.length)] + ' ' + (s.nextId);
    const p = { id: s.nextId++, name, hp: CFG.hp, tool: null, exp: null };
    s.people.push(p);
    return p;
  }
  function genMap(s) {
    const fixed = [['forest', 1.1], ['bushes', 1.25], ['rocks', 1.4], ['forest', 2.1], ['game', 2.4], ['bushes', 2.7], ['rocks', 3.0], ['clay', 3.3],
      ['game', 3.7], ['forest', 4.1], ['clay', 4.6], ['rocks', 5.0], ['copper', 5.4], ['game', 5.8], ['copper', 7.2]];
    const place = (type, d) => {
      for (let tries = 0; tries < 60; tries++) {
        const a = rnd(s) * Math.PI * 2, x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (s.sites.every(o => Math.hypot(o.x - x, o.y - y) > 0.75)) {
          const st = SITES[type].stock, stock = Math.round(st[0] + rnd(s) * (st[1] - st[0]));
          s.sites.push({ id: s.nextId++, type, x, y, d, stock, max: stock, seen: false });
          return;
        }
      }
    };
    fixed.forEach(([t, d]) => place(t, d));
    const pool = d => d < 3 ? ['forest', 'forest', 'bushes', 'rocks', 'rocks', 'game'] : d < 5 ? ['forest', 'forest', 'bushes', 'rocks', 'rocks', 'game', 'clay'] : ['forest', 'forest', 'rocks', 'rocks', 'game', 'clay', 'copper', 'bushes'];
    for (let i = 0; i < 70; i++) {
      const d = 1.6 + Math.pow(rnd(s), 0.75) * 10.4, p = pool(d);
      place(p[Math.floor(rnd(s) * p.length)], d);
    }
  }

  /* ---------- נתונים נגזרים ---------- */
  const effMul = (s, key) => RESEARCH.reduce((m, r) => (r.eff && r.eff[key] && s.research.done[r.id]) ? m * r.eff[key] : m, 1);
  const count = (s, type) => s.buildings.filter(b => b.type === type).length;
  const sumB = (s, key) => s.buildings.reduce((a, b) => a + (BUILD[b.type][key] || 0), 0);
  const fuelMax = s => CFG.fuelMax(s.level);
  const burnRate = s => CFG.burn(s.level) * effMul(s, 'burn');
  const busyAnimals = (s, k) => s.exps.reduce((a, e) => a + (e[k] || 0), 0);
  const homeDogs = s => s.dogs - busyAnimals(s, 'dogs');
  function lightR(s) {
    const base = CFG.baseR(s.level);
    const r = s.fuel > 0 ? base * (0.5 + 0.5 * Math.min(1, s.fuel / fuelMax(s))) : 0.7;
    return r + Math.min(0.9, homeDogs(s) * 0.15) + Math.min(1.5, sumB(s, 'radius'));
  }
  function isLit(s, x, y, R) {
    R = R == null ? lightR(s) : R;
    if (dist(x, y) <= R) return true;
    return s.torches.some(t => Math.hypot(t.x - x, t.y - y) <= CFG.torchR);
  }
  const foodRate = s => (s.people.length * CFG.eat(s.level) + s.dogs * CFG.dogEat + s.horses * CFG.horseEat) * effMul(s, 'food');
  const foodProd = s => sumB(s, 'food');
  const housing = s => CFG.house0 + sumB(s, 'house');
  const toolOf = (s, p) => p.tool ? s.tools.find(t => t.id === p.tool) : null;
  const toolDef = (s, p) => { const t = toolOf(s, p); return t ? TOOLS[t.type] : null; };
  const profession = (s, p) => { const d = toolDef(s, p); return d ? d.prof : 'שבטי'; };
  const idle = s => s.people.filter(p => !p.exp);
  const hasBuilder = s => s.people.some(p => { const d = toolDef(s, p); return d && d.build; });
  function buildCost(s, type) {
    const b = BUILD[type], n = count(s, type), m = (1 + 0.3 * n) * (hasBuilder(s) ? 0.8 : 1);
    return Object.fromEntries(Object.entries(b.cost).map(([k, v]) => [k, Math.ceil(v * m)]));
  }
  const canPay = (s, c) => Object.entries(c).every(([k, v]) => s.res[k] >= v - 1e-9);
  const pay = (s, c) => Object.entries(c).forEach(([k, v]) => { s.res[k] -= v; });
  const craftSlots = s => has(s, 'workshop') ? 9 : 4;

  /* ---------- משלחת: תכנון ---------- */
  function planGather(s, siteId, ids, opt) {
    opt = opt || {};
    const site = s.sites.find(x => x.id === siteId);
    if (!site || !site.seen) return { err: 'המקום לא ידוע' };
    const def = SITES[site.type];
    if (def.req && !has(s, def.req)) return { err: 'צריך לחקור קודם: ' + RESEARCH_BY[def.req].n };
    const people = ids.map(id => s.people.find(p => p.id === id)).filter(p => p && !p.exp);
    if (!people.length) return { err: 'בחרו לפחות אדם אחד פנוי' };
    const weak = people.find(p => p.hp < CFG.restHp); if (weak) return { err: `${weak.name} פצוע/ה מדי — צריך לנוח ליד המדורה` };
    const horses = Math.min(opt.horses || 0, s.horses - busyAnimals(s, 'horses'));
    const carts = Math.min(opt.carts || 0, s.carts - busyAnimals(s, 'carts'));
    const dogs = Math.min(opt.dogs || 0, homeDogs(s));
    let cap = horses * CFG.horseCarry + carts * CFG.cartCarry, rate = {};
    people.forEach(p => {
      const td = toolDef(s, p);
      cap += CFG.carry + (td && td.carry || 0);
      def.y.forEach(([r, base, key]) => { rate[r] = (rate[r] || 0) + CFG.rate * base * (td && td.bonus && td.bonus[key] || 1); });
    });
    const tot = Object.values(rate).reduce((a, b) => a + b, 0);
    const work = Math.max(CFG.minWork, Math.min(CFG.maxWork, cap / tot));
    let y = Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, v * work]));
    let sum = Object.values(y).reduce((a, b) => a + b, 0);
    const lim = Math.min(cap, site.stock);
    if (sum > lim) { const f = lim / sum; for (const k in y) y[k] *= f; sum = lim; }
    const travel = site.d * CFG.travel;
    return { site, people, dogs, horses, carts, cap, work, travel, total: travel * 2 + work, yields: y, risk: risk(s, site.x, site.y, people, dogs) };
  }
  function planExplore(s, x, y, ids, opt) {
    opt = opt || {};
    const people = ids.map(id => s.people.find(p => p.id === id)).filter(p => p && !p.exp);
    if (!people.length) return { err: 'בחרו לפחות אדם אחד פנוי' };
    const weak = people.find(p => p.hp < CFG.restHp); if (weak) return { err: `${weak.name} פצוע/ה מדי — צריך לנוח ליד המדורה` };
    const d = dist(x, y), dogs = Math.min(opt.dogs || 0, homeDogs(s));
    const scout = Math.max(1.6, ...people.map(p => (toolDef(s, p) || {}).scout || 0));
    const torch = !!opt.torch && has(s, 'torches') && s.res.torch >= 1;
    const travel = d * CFG.travel;
    return { x, y, d, people, dogs, torch, scout, work: 10, travel, total: travel * 2 + 10, risk: risk(s, x, y, people, dogs) };
  }
  function defense(s, people, dogs) {
    return people.reduce((a, p) => a + 1 + ((toolDef(s, p) || {}).def || 0), 0) + dogs * 3;
  }
  function risk(s, x, y, people, dogs) {
    const d = dist(x, y), lit = isLit(s, x, y);
    const safe = people.reduce((m, p) => Math.min(m, 1 - ((toolDef(s, p) || {}).safe || 0)), 1);
    const p = (lit ? 0.02 : Math.min(0.4, 0.08 + 0.03 * d)) * safe;
    const pow = 3 + 1.5 * d + 0.5 * s.level;
    return { lit, p, pow, def: defense(s, people, dogs) };
  }

  function start(s, plan, loop) {
    if (plan.err) return plan.err;
    const e = {
      id: s.nextId++, kind: plan.site ? 'gather' : 'explore', site: plan.site ? plan.site.id : null,
      x: plan.site ? plan.site.x : plan.x, y: plan.site ? plan.site.y : plan.y,
      people: plan.people.map(p => p.id), dogs: plan.dogs, horses: plan.horses || 0, carts: plan.carts || 0,
      torch: !!plan.torch, start: s.t, travel: plan.travel * MIN, work: plan.work * MIN, end: s.t + plan.total * MIN, loop: !!loop,
    };
    if (e.torch) s.res.torch -= 1;
    plan.people.forEach(p => { p.exp = e.id; });
    s.exps.push(e);
    s.stats.exps++;
    return null;
  }
  function recall(s, id) { // ביטול: חוזרים בלי שלל
    const e = s.exps.find(x => x.id === id); if (!e) return;
    if (e.torch) s.res.torch += 1;
    finishExp(s, e, true);
  }
  function finishExp(s, e, cancelled) {
    s.exps = s.exps.filter(x => x !== e);
    const people = e.people.map(id => s.people.find(p => p.id === id)).filter(Boolean);
    people.forEach(p => { p.exp = null; });
    if (cancelled) { e.loop = false; return; }
    const r = risk(s, e.x, e.y, people, e.dogs);
    let lootMul = 1, fight = '';
    if (rnd(s) < r.p) {
      s.stats.raids++;
      const pow = r.pow * (0.7 + 0.6 * rnd(s));
      if (r.def >= pow) { fight = 'win'; }
      else {
        fight = 'lose'; lootMul = 0.4;
        const dmg = (pow - r.def) / people.length;
        people.forEach(p => { p.hp -= Math.ceil(dmg * 0.5 + rnd(s) * 2); });
        for (let i = 0; i < e.dogs; i++) if (rnd(s) < 0.3) { s.dogs--; log(s, '🐕 כלב שמירה נטרף בחושך', 'bad'); }
      }
    }
    // שחיקת כלים
    people.forEach(p => {
      const t = toolOf(s, p); if (!t || t.uses == null) return;
      if (--t.uses <= 0) { s.tools = s.tools.filter(x => x !== t); p.tool = null; log(s, `🔧 ה${TOOLS[t.type].n} של ${p.name} נשבר`, 'warn'); }
    });
    const dead = people.filter(p => p.hp <= 0);
    dead.forEach(p => kill(s, p, 'נהרג בחושך'));
    const alive = people.filter(p => p.hp > 0);
    if (fight === 'win') log(s, `⚔️ ${alive.map(p => p.name).join(', ')} הדפו יצורים מהאפלה`, 'good');
    if (fight === 'lose') log(s, `🩸 המשלחת הותקפה בחושך${dead.length ? '' : ' — יש פצועים'}`, 'bad');
    if (!alive.length) { e.loop = false; return; }

    if (e.kind === 'gather') {
      const site = s.sites.find(x => x.id === e.site);
      const opts = { dogs: e.dogs, horses: e.horses, carts: e.carts };
      const pl = planGather(s, e.site, alive.map(p => p.id), opts);
      const got = {};
      if (!pl.err) for (const k in pl.yields) { const v = pl.yields[k] * lootMul; s.res[k] += v; got[k] = v; site.stock -= v; }
      if (site) site.stock = Math.max(0, site.stock);
      const txt = Object.entries(got).filter(([, v]) => v >= 0.5).map(([k, v]) => RES[k].i + Math.round(v)).join(' ');
      if (!e.loop) log(s, `🎒 ${alive.map(p => p.name).join(', ')} חזרו מ${SITES[site.type].n}: ${txt || 'כלום'}`, 'good');
      else e.lastTxt = txt;
      const hurt = alive.some(p => p.hp <= CFG.hp / 2);
      if (e.loop && alive.length === e.people.length && site.stock > 5 && !hurt) {
        const again = planGather(s, e.site, alive.map(p => p.id), opts);
        if (!again.err) { start(s, again, true); return; }
      }
      if (e.loop) log(s, `🔁 ${alive.map(p => p.name).join(', ')} חזרו הביתה ועצרו את הסבב${site.stock <= 5 ? ' — המקום התרוקן' : hurt ? ' — יש פצועים' : ''}`, 'info');
    } else {
      const R = Math.max(1.6, ...alive.map(p => (toolDef(s, p) || {}).scout || 0));
      let n = 0;
      s.sites.forEach(o => { if (!o.seen && Math.hypot(o.x - e.x, o.y - e.y) <= R) { o.seen = true; n++; } });
      if (e.torch) s.torches.push({ x: e.x, y: e.y, until: s.t + CFG.torchLife * MIN });
      log(s, `🔦 ${alive.map(p => p.name).join(', ')} חזרו מהחקר: ${n ? 'נמצאו ' + n + ' מקומות חדשים' : 'לא נמצא כלום'}${e.torch ? ', הוצב לפיד' : ''}`, n ? 'good' : 'info');
    }
  }
  function kill(s, p, why) {
    s.people = s.people.filter(x => x !== p);
    if (p.tool) s.tools = s.tools.filter(t => t.id !== p.tool);
    s.stats.died++;
    log(s, `💀 ${p.name} ${why}`, 'bad');
  }

  /* ---------- יצירה ---------- */
  function matchRecipe(s, slots) { // slots: מערך מפתחות משאבים (או null)
    const bag = {}; slots.forEach(k => { if (k) bag[k] = (bag[k] || 0) + 1; });
    const keys = Object.keys(bag); if (!keys.length) return null;
    return RECIPES.find(r => { const rk = Object.keys(r.in); return rk.length === keys.length && rk.every(k => bag[k] === r.in[k]); }) || null;
  }
  function craft(s, slots) {
    const r = matchRecipe(s, slots);
    if (!r) return { err: 'השילוב הזה לא יוצר כלום' };
    if (!has(s, r.req)) return { err: 'נראה שזה יכול לעבוד… אבל צריך לחקור קודם: ' + RESEARCH_BY[r.req].n, hint: true };
    if (!canPay(s, r.in)) return { err: 'אין מספיק משאבים בתיבה' };
    pay(s, r.in);
    if (r.out === 'torch') { s.res.torch += r.n; return { ok: `נוצרו ${r.n} לפידים` }; }
    if (r.out === 'cart') { s.carts++; return { ok: 'נבנתה עגלה 🛒' }; }
    const t = { id: s.nextId++, type: r.out, uses: TOOLS[r.out].uses == null ? null : TOOLS[r.out].uses };
    s.tools.push(t);
    return { ok: `נוצר ${TOOLS[r.out].n} ${TOOLS[r.out].i}`, tool: t };
  }
  function equip(s, personId, toolId) {
    const p = s.people.find(x => x.id === personId); if (!p) return;
    if (p.exp) return 'אי אפשר להחליף כלי באמצע משלחת';
    p.tool = toolId || null;
    s.people.forEach(o => { if (o !== p && o.tool && o.tool === toolId) o.tool = null; });
    return null;
  }

  /* ---------- מחקר, בנייה, חיות, אש ---------- */
  function researchState(s, r) {
    if (s.research.done[r.id]) return 'done';
    if (s.research.cur && s.research.cur.id === r.id) return 'cur';
    if (r.lv > s.level) return 'locked';
    return 'open';
  }
  function startResearch(s, id) {
    const r = RESEARCH_BY[id];
    if (!r || researchState(s, r) !== 'open') return 'לא זמין';
    if (s.research.cur) return 'כבר חוקרים משהו';
    if (!canPay(s, r.cost)) return 'אין מספיק משאבים';
    pay(s, r.cost);
    s.research.cur = { id, end: s.t + r.min * effMul(s, 'research') * MIN, start: s.t };
    return null;
  }
  function build(s, type, x, y) {
    const b = BUILD[type]; if (!b || !has(s, b.req)) return 'לא זמין';
    const c = buildCost(s, type); if (!canPay(s, c)) return 'אין מספיק משאבים';
    const d = dist(x, y);
    if (d < 0.45) return 'קרוב מדי למדורה';
    if (d > lightR(s)) return 'אפשר לבנות רק בתוך האור';
    if (s.buildings.some(o => Math.hypot(o.x - x, o.y - y) < 0.4)) return 'צמוד מדי למבנה אחר';
    pay(s, c);
    s.buildings.push({ id: s.nextId++, type, x, y });
    log(s, `${b.i} נבנה: ${b.n}`, 'good');
    return null;
  }
  const ANIMALS = {
    dogs: { n: 'כלב שמירה', i: '🐕', cost: { food: 30, hide: 3 }, cap: s => sumB(s, 'dogs') },
    horses: { n: 'סוס', i: '🐎', cost: { food: 80, hide: 10 }, cap: s => sumB(s, 'horses') },
  };
  function buyAnimal(s, k) {
    const a = ANIMALS[k];
    if (s[k] >= a.cap(s)) return 'אין מקום — צריך עוד ' + (k === 'dogs' ? 'מלונה' : 'אורווה');
    if (!canPay(s, a.cost)) return 'אין מספיק משאבים';
    pay(s, a.cost); s[k]++;
    log(s, `${a.i} ${a.n} חדש הצטרף לכפר`, 'good');
    return null;
  }
  function feed(s, k, n) { // הזנה ידנית
    const per = k === 'charcoal' ? 4 : 1, room = fuelMax(s) - s.fuel;
    const take = Math.min(n, Math.floor(s.res[k]), Math.floor(room / per));
    if (take <= 0) return 0;
    s.res[k] -= take; s.fuel += take * per; return take;
  }
  function upgradeCheck(s) {
    const L = LEVELS[s.level];
    if (!L.up || s.level >= CFG.maxLevel) return { err: 'זו הרמה הגבוהה בגרסה הזו' };
    const miss = [];
    if (s.people.length < L.pop) miss.push(`אוכלוסייה ${s.people.length}/${L.pop}`);
    Object.entries(L.up).forEach(([k, v]) => { if (s.res[k] < v) miss.push(`${RES[k].i} ${Math.floor(s.res[k])}/${v}`); });
    return { miss, ok: !miss.length };
  }
  function upgrade(s) {
    const c = upgradeCheck(s); if (!c.ok) return c.err || 'חסר: ' + c.miss.join(', ');
    pay(s, LEVELS[s.level].up);
    s.level++;
    s.fuel = Math.min(fuelMax(s), s.fuel + 10);
    reveal(s);
    log(s, `🔥 המדורה גדלה! רמה ${s.level}: ${LEVELS[s.level].n}`, 'level');
    if (s.level >= CFG.maxLevel) log(s, '🏙️ הגעתם לעיר קטנה — סוף הגרסה הנוכחית. רמות 11–50 בדרך.', 'level');
    return null;
  }
  function reveal(s) {
    const R = lightR(s) + 0.3;
    s.sites.forEach(o => { if (!o.seen && (dist(o.x, o.y) <= R || isLit(s, o.x, o.y, R))) o.seen = true; });
  }

  /* ---------- צעד של דקה ---------- */
  function step(s) {
    s.t += MIN;
    const L = s.level;
    // אש
    s.fuel = Math.max(0, s.fuel - burnRate(s) / 60);
    if (s.auto) {
      const room = fuelMax(s) - s.fuel;
      if (room >= 4 && s.res.charcoal >= 1) feed(s, 'charcoal', 99);
      if (fuelMax(s) - s.fuel >= 5 && s.res.wood >= 1) feed(s, 'wood', 99);
    }
    if (s.fuel <= 0 && !s.dark) { s.dark = true; log(s, '🌑 האש כבתה! הכפר חשוף בחושך', 'bad'); }
    if (s.fuel > 0 && s.dark) { s.dark = false; log(s, '🔥 האש בוערת שוב', 'good'); }
    // כבשן
    const kilns = count(s, 'kiln');
    if (kilns && s.kilnOn !== false && s.res.wood > 60) { const use = Math.min(s.res.wood - 60, kilns * 0.1); s.res.wood -= use; s.res.charcoal += use / 3; }
    // מזון
    s.res.food += foodProd(s) / 60 - foodRate(s) / 60;
    if (s.res.food < 0) {
      s.res.food = 0;
      if (!s.starving) { s.starving = true; log(s, '🍂 אין מזון — האנשים רעבים', 'bad'); }
    } else if (s.starving && s.res.food > 1) { s.starving = false; log(s, '🍖 יש שוב מזון', 'good'); }
    if (s.starving) {
      if (++s.clock.starve >= CFG.starveEvery) {
        s.clock.starve = 0;
        s.people.slice().forEach(p => { if (--p.hp <= 0) kill(s, p, 'מת מרעב'); });
      }
    } else {
      s.clock.starve = 0;
      if (++s.clock.heal >= CFG.healEvery) { s.clock.heal = 0; s.people.forEach(p => { if (p.hp < CFG.hp) p.hp++; }); }
    }
    // גידול אוכלוסייה
    if (++s.clock.grow >= CFG.growEvery) {
      s.clock.grow = 0;
      if (!s.starving && s.people.length < housing(s) && s.res.food >= 10 * s.people.length && s.fuel > 0) {
        const p = addPerson(s); s.stats.born++;
        log(s, `👶 ${p.name} הצטרף/ה לשבט`, 'good');
      }
    }
    // מחקר
    if (s.research.cur && s.t >= s.research.cur.end) {
      const r = RESEARCH_BY[s.research.cur.id];
      s.research.done[r.id] = s.t; s.research.cur = null;
      log(s, `💡 מחקר הושלם: ${r.n}`, 'good');
    }
    // לפידים ומקומות
    const before = s.torches.length;
    s.torches = s.torches.filter(t => t.until > s.t);
    if (s.torches.length < before) log(s, '🕯️ לפיד כבה בחושך', 'info');
    s.sites.forEach(o => { const r = SITES[o.type].regen; if (r && o.stock < o.max) o.stock = Math.min(o.max, o.stock + r / 60); });
    if (s.t % (10 * MIN) < MIN) reveal(s);
    // משלחות
    s.exps.filter(e => s.t >= e.end).forEach(e => finishExp(s, e));
    // פשיטות מהאפלה
    if (rnd(s) < (CFG.raid(L) + (s.fuel <= 0 ? 0.3 : 0)) / 60) raid(s);
    if (!s.people.length && !s.over) { s.over = true; log(s, '☠️ השבט נכחד. המשחק נגמר.', 'bad'); }
  }
  function raid(s) {
    const R = lightR(s);
    const exposedB = s.buildings.filter(b => !isLit(s, b.x, b.y, R));
    const home = s.people.filter(p => !p.exp);
    const peopleExposed = s.fuel <= 0;
    if (!exposedB.length && !peopleExposed) { if (rnd(s) < 0.25) log(s, '👀 עיניים זוהרות הסתובבו בשולי האור ונסוגו', 'info'); return; }
    s.stats.raids++;
    const pow = CFG.raidPow(s.level) * (0.7 + 0.6 * rnd(s));
    const def = defense(s, home, homeDogs(s)) + sumB(s, 'def');
    if (def >= pow) { log(s, '🛡️ יצורים מהאפלה תקפו — והשומרים הדפו אותם', 'good'); return; }
    if (exposedB.length) {
      const b = exposedB[Math.floor(rnd(s) * exposedB.length)];
      s.buildings = s.buildings.filter(x => x !== b);
      log(s, `🔥 יצורים מהאפלה הרסו את ה${BUILD[b.type].n} שמחוץ לאור`, 'bad');
    }
    if (peopleExposed && home.length) {
      const p = home[Math.floor(rnd(s) * home.length)];
      p.hp -= Math.ceil((pow - def) / 2);
      if (p.hp <= 0) kill(s, p, 'נטרף ליד המדורה הכבויה'); else log(s, `🩸 ${p.name} נפצע/ה בהתקפה`, 'bad');
    }
  }

  // השלמת הזמן שעבר (גם כשהמשחק היה סגור). מחזיר סיכום.
  function advance(s, now, maxDays) {
    const cap = (maxDays || 60) * 24 * HOUR;
    if (now - s.t > cap) s.t = now - cap;
    const before = { res: { ...s.res }, pop: s.people.length, t: s.t };
    s.events = [];
    let n = 0;
    while (s.t + MIN <= now && !s.over) { step(s); n++; }
    const ev = s.events; s.events = null;
    return { minutes: n, before, events: ev };
  }

  const api = {
    MIN, HOUR, CFG, RES, RES_KEYS, TOOLS, RECIPES, ITEMS, SITES, BUILD, RESEARCH, RESEARCH_BY, LEVELS, ROADMAP, ANIMALS,
    newGame, advance, step, planGather, planExplore, start, recall, craft, matchRecipe, equip, startResearch, researchState,
    build, buildCost, buyAnimal, feed, upgrade, upgradeCheck, lightR, isLit, fuelMax, burnRate, foodRate, foodProd, housing,
    profession, toolOf, toolDef, idle, has, canPay, craftSlots, homeDogs, count, fmtCost, effMul, rnd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FireEngine = api;
})(this);
