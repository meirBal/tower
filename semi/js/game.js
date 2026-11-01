// מסע האלקטרון — מנוע המשחק
// מסכים: בית → מפה → פרק (סיפור → שיעורים → מעבדה → אתגרים → בוס → תוצאה)
// ההתקדמות נשמרת במכשיר בלבד (localStorage). אין שום תקשורת לשרת.
(function () {
  'use strict';
  const CH = SEMI.chapters;
  const app = document.getElementById('app');
  const KEY = 'semi.progress.v1';

  // ---------- שמירה ----------
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
    save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* מצב פרטי — ממשיכים בלי שמירה */ } }
  };
  const S = Object.assign({ done: {}, xp: 0, sound: true, free: false, examBest: 0 }, store.load() || {});
  const save = () => store.save(S);

  // ---------- עזרים ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const starsHTML = n => '<span class="stars">' + [0, 1, 2].map(i => i < n ? '★' : '<span class="off">★</span>').join('') + '</span>';
  const unlocked = i => S.free || i === 0 || !!S.done[CH[i - 1].id];
  const totalStars = () => CH.reduce((s, c) => s + (S.done[c.id] ? S.done[c.id].stars : 0), 0);
  const eli = (cls = 'eli') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="eg" cx="35%" cy="30%"><stop offset="0" stop-color="#bcd0ff"/><stop offset=".55" stop-color="#5d7dff"/><stop offset="1" stop-color="#2a3fb8"/></radialGradient></defs><ellipse cx="50" cy="50" rx="46" ry="16" fill="none" stroke="#6ff0d0" stroke-width="2" opacity=".55" transform="rotate(-25 50 50)"/><circle cx="50" cy="50" r="30" fill="url(#eg)"/><circle cx="40" cy="45" r="7" fill="#fff"/><circle cx="60" cy="45" r="7" fill="#fff"/><circle cx="41.5" cy="46" r="3.6" fill="#141a3d"/><circle cx="61.5" cy="46" r="3.6" fill="#141a3d"/><path d="M40 60 Q50 68 60 60" stroke="#141a3d" stroke-width="3.2" fill="none" stroke-linecap="round"/><rect x="44" y="24" width="12" height="4" rx="2" fill="#fff" opacity=".9"/><circle cx="85" cy="33" r="4" fill="#6ff0d0"/></svg>`;

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // ---------- צלילים ----------
  let ac = null;
  function beep(kind) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { good: [[660, .08], [990, .12]], bad: [[220, .18]], win: [[523, .1], [659, .1], [784, .1], [1046, .25]], hit: [[180, .06], [120, .1]], tap: [[880, .03]] }[kind] || [];
      let t = ac.currentTime;
      seq.forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = kind === 'bad' || kind === 'hit' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + .02); t += d * .9;
      });
    } catch (e) { /* אין שמע — לא נורא */ }
  }

  // ---------- קונפטי ----------
  const fx = document.getElementById('fx'), fctx = fx.getContext('2d');
  let parts = [], fxOn = false;
  function confetti(n = 120) {
    fx.width = innerWidth; fx.height = innerHeight;
    const cols = ['#6c8cff', '#3fd68f', '#ffd257', '#ff6b9a', '#6ff0d0'];
    for (let i = 0; i < n; i++) parts.push({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 3, r: Math.random() * 6 + 3, c: cols[i % cols.length], a: Math.random() * 6, life: 90 + Math.random() * 40 });
    if (!fxOn) { fxOn = true; requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter(p => --p.life > 0);
    parts.forEach(p => { p.vy += .3; p.x += p.vx; p.y += p.vy; p.a += .2; fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.a); fctx.fillStyle = p.c; fctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); fctx.restore(); });
    if (parts.length) requestAnimationFrame(fxLoop); else { fxOn = false; fctx.clearRect(0, 0, fx.width, fx.height); }
  }

  // ---------- ניתוב מסכים ----------
  let cleanup = null;
  const actions = {};
  function render(html, acts) {
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    app.innerHTML = '<div class="fade-in">' + html + '</div>';
    Object.keys(actions).forEach(k => delete actions[k]);
    Object.assign(actions, acts || {});
    window.scrollTo(0, 0);
  }
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { fn(el.dataset.arg, el); }
  });

  // ================= בית =================
  function home() {
    const doneN = CH.filter(c => S.done[c.id]).length;
    const next = CH.findIndex(c => !S.done[c.id]);
    render(`
      <div class="hero">
        ${eli()}
        <h1>מסע האלקטרון</h1>
        <p>הרפתקה בעולם התקני המוליכים למחצה</p>
      </div>
      <div class="stats">
        <div class="stat"><b>${doneN}/${CH.length}</b><span>שלבים</span></div>
        <div class="stat"><b>${totalStars()}★</b><span>כוכבים</span></div>
        <div class="stat"><b>${S.xp}</b><span>XP</span></div>
      </div>
      <button class="btn" data-act="map">${doneN === 0 ? '🚀 התחל את המסע' : next === -1 ? '🗺️ למפה' : '▶ המשך: ' + esc(CH[next].title)}</button>
      <button class="btn gold" data-act="exam">🏆 מבחן אלוף ${S.examBest ? '(שיא: ' + S.examBest + '%)' : ''}</button>
      <div class="row mt">
        <button class="btn sec" data-act="book">📖 ספר הידע</button>
        <button class="btn sec" data-act="settings">⚙️ הגדרות</button>
      </div>
      <button id="installBtn" class="btn sec mt hidden" data-act="install">📲 הורד לטלפון</button>
      <p class="center muted mt" style="font-size:13px">התקדמות נשמרת על המכשיר הזה</p>
    `, { map, exam, book, settings, install: doInstall });
    refreshInstall();
  }

  // ================= מפה =================
  function map() {
    const cur = CH.findIndex(c => !S.done[c.id]);
    const nodes = CH.map((c, i) => {
      const lk = !unlocked(i), d = S.done[c.id];
      return `<button class="node ${i % 2 ? 'alt' : ''} ${lk ? 'locked' : ''} ${i === cur ? 'current' : ''}" style="--c:${c.color}" data-act="open" data-arg="${i}">
        <div class="orb">${lk ? '🔒' : c.icon}${i === cur && !lk ? eli('eli-here') : ''}</div>
        <div class="info"><b>${i + 1}. ${esc(c.title)}</b><small>${esc(c.place)}</small><div>${d ? starsHTML(d.stars) : lk ? '<small>נעול</small>' : '<small>חדש!</small>'}</div></div>
      </button>`;
    }).join('');
    render(`
      <div class="bar"><button class="icon-btn" data-act="home" aria-label="בית">🏠</button><div class="ttl">מפת המסע</div><span class="pill">${totalStars()}★ · ${S.xp} XP</span></div>
      <div class="map">${nodes}</div>
    `, {
      home, open: i => {
        i = +i;
        if (!unlocked(i)) { beep('bad'); toast('קודם צריך לנצח את ' + CH[i - 1].title); return; }
        beep('tap'); chapter(i);
      }
    });
    // גלילה לשלב הנוכחי
    const el = app.querySelector('.node.current');
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }

  // ================= פרק =================
  function chapter(idx) {
    const c = CH[idx];
    const st = { i: idx, c, lesson: 0, hearts: 3, mistakes: 0, correct: 0 };
    const head = (extra = '') => `<div class="bar"><button class="icon-btn" data-act="map" aria-label="חזרה למפה">→</button><div class="ttl">${c.icon} ${esc(c.title)}</div>${extra}</div>`;

    function story() {
      render(`${head()}
        <div class="card"><div class="place">📍 ${esc(c.place)} · שלב ${idx + 1}</div>
          <div class="story mt">${eli('eli sm')}<div class="bubble">${esc(c.story)}</div></div></div>
        <button class="btn" data-act="go">יאללה, ללמוד! 📚</button>
        ${S.done[c.id] ? '<button class="btn sec" data-act="skip">דלג ישר לאתגרים ⚡</button>' : ''}
      `, { map, go: () => lesson(0), skip: () => quiz() });
    }

    function lesson(n) {
      st.lesson = n;
      const L = c.lessons[n], last = n === c.lessons.length - 1;
      render(`${head(`<span class="pill">${n + 1}/${c.lessons.length}</span>`)}
        <div class="dots">${c.lessons.map((_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>
        <div class="card"><h2>${esc(L.title)}</h2><div class="body">${L.html}</div></div>
        <div class="row">
          ${n > 0 ? '<button class="btn sec" data-act="prev">הקודם</button>' : ''}
          <button class="btn" data-act="next">${last ? 'למעבדה 🔬' : 'הבא'}</button>
        </div>
      `, { map, prev: () => lesson(n - 1), next: () => last ? sim() : lesson(n + 1) });
    }

    function sim() {
      render(`${head()}
        <div class="card sim"><h2>🔬 ${esc(c.simTitle)}</h2><p class="simhint">${esc(c.simHint)}</p><div id="simbox"></div></div>
        <div class="row"><button class="btn sec" data-act="back">לשיעורים</button><button class="btn good" data-act="go">לאתגרים ⚔️</button></div>
      `, { map, back: () => lesson(c.lessons.length - 1), go: () => quiz() });
      const fn = SEMI.sims && SEMI.sims[c.sim];
      if (fn) cleanup = fn(document.getElementById('simbox'));
    }

    // ---- אתגרים ----
    function quiz() {
      st.hearts = 3; st.mistakes = 0; st.correct = 0;
      const queue = shuffle(c.quiz);
      const total = queue.length;
      runQuestions({
        queue, total, head: head, st,
        onDone: () => boss(),
        onFail: () => fail('האנרגיה נגמרה באמצע האתגרים')
      });
    }

    function boss() {
      const B = c.boss;
      const queue = shuffle(B.questions);
      let hp = queue.length;
      render(`${head()}
        <div class="card center"><div class="boss"><div class="face">${B.emoji}</div><h2>${esc(B.name)}</h2><div class="bosshp"><i style="width:100%"></i></div><p class="taunt">"${esc(B.taunt)}"</p></div></div>
        <button class="btn" data-act="fight">⚔️ להילחם!</button>
      `, {
        map, fight: () => runQuestions({
          queue, total: queue.length, head, st, boss: { B, get hp() { return hp; }, hit() { hp--; }, max: queue.length },
          onDone: () => win(), onFail: () => fail(B.name + ' ניצח הפעם')
        })
      });
      beep('hit');
    }

    function win() {
      const stars = st.mistakes === 0 ? 3 : st.mistakes <= 2 ? 2 : 1;
      const prev = S.done[c.id];
      const gained = st.correct * 10 + 50 + stars * 20;
      S.xp += gained;
      S.done[c.id] = { stars: Math.max(stars, prev ? prev.stars : 0) };
      save(); beep('win'); confetti();
      const last = idx === CH.length - 1;
      render(`
        <div class="result">
          <div class="big">${c.boss.emoji}💥</div>
          <h2>ניצחת את ${esc(c.boss.name)}!</h2>
          <div>${starsHTML(stars)}</div>
          <p class="xp">+${gained} XP</p>
          <p class="muted">${st.mistakes === 0 ? 'מושלם — בלי אף טעות!' : 'טעויות בדרך: ' + st.mistakes + (stars < 3 ? ' · נסה שוב לשלושה כוכבים' : '')}</p>
        </div>
        ${last ? '<button class="btn gold" data-act="exam">🏆 סיימת הכל! למבחן האלוף</button>' : `<button class="btn good" data-act="next">לשלב הבא: ${esc(CH[idx + 1].title)} ➜</button>`}
        <button class="btn sec" data-act="again">שחק שוב את השלב</button>
        <button class="btn sec" data-act="map">למפה</button>
      `, { map, exam, next: () => chapter(idx + 1), again: () => chapter(idx) });
    }

    function fail(msg) {
      beep('bad');
      render(`
        <div class="result"><div class="big">🔋</div><h2>${esc(msg)}</h2>
        <p class="muted">לא נורא — כל טעות היא עוד דבר שלמדת. אפשר לחזור לשיעורים או לנסות שוב מיד.</p></div>
        <button class="btn" data-act="retry">נסה שוב ⚡</button>
        <button class="btn sec" data-act="learn">חזרה לשיעורים 📚</button>
        <button class="btn sec" data-act="map">למפה</button>
      `, { map, retry: () => quiz(), learn: () => lesson(0) });
    }

    story();
  }

  // ================= מנוע שאלות (משותף לאתגרים, בוס ומבחן) =================
  function parseNum(s) {
    s = String(s).trim().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[×xX*]10\^?/g, 'e').replace(/\^/g, '');
    if (/^-?\d+,\d+(e-?\d+)?$/.test(s)) s = s.replace(',', '.');
    s = s.replace(/,/g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }
  function check(q, ans) {
    if (q.t === 'num') { const v = parseNum(ans); if (!isFinite(v)) return null; return Math.abs(v - q.a) <= (q.tol || 0.03) * Math.abs(q.a); }
    if (q.t === 'tf') return ans === String(q.a);
    return +ans === q.a;
  }
  const fmtAns = q => q.t === 'tf' ? (q.a ? 'נכון' : 'לא נכון') : q.t === 'num' ? (Math.abs(q.a) >= 1e4 || Math.abs(q.a) < 1e-2 ? q.a.toExponential(2) : +q.a.toPrecision(3)) + ' ' + (q.unit || '') : q.o[q.a];

  function runQuestions(o) {
    const { queue, total, st, boss } = o;
    let done = 0;
    function next() {
      if (!queue.length) return o.onDone();
      show(queue.shift());
    }
    function hud() {
      const hearts = '❤️'.repeat(st.hearts) + '🖤'.repeat(Math.max(0, (o.maxHearts || 3) - st.hearts));
      return `<div class="hud"><span class="hearts">${hearts}</span><div class="prog"><i style="width:${(done / total) * 100}%"></i></div><span class="pill">${done}/${total}</span></div>`;
    }
    function show(q) {
      let opts = '';
      let order = [];
      if (q.t === 'mc') { order = shuffle(q.o.map((_, i) => i)); opts = '<div class="opts">' + order.map(i => `<button class="opt" data-act="ans" data-arg="${i}">${esc(q.o[i])}</button>`).join('') + '</div>'; }
      else if (q.t === 'tf') opts = '<div class="opts"><button class="opt" data-act="ans" data-arg="true">✔️ נכון</button><button class="opt" data-act="ans" data-arg="false">❌ לא נכון</button></div>';
      else opts = `<div class="numin"><input id="numin" inputmode="text" autocomplete="off" placeholder="התשובה שלך"><span class="u">${esc(q.unit || '')}</span></div><div class="hint-num">מספרים גדולים/קטנים: אפשר לכתוב 2.25e4 או 3.45e-7</div><button class="btn mt" data-act="numok">בדוק</button>`;
      const bossBlock = boss ? `<div class="boss"><div class="face" id="bface">${boss.B.emoji}</div><div class="bosshp"><i style="width:${(boss.hp / boss.max) * 100}%"></i></div></div>` : '';
      const chip = o.chip ? `<div class="place">${o.chip(q)}</div>` : '';
      render(`${o.head()}${hud()}${bossBlock}
        <div class="card">${chip}<p class="q">${esc(q.q)}</p>${opts}<div id="fb"></div></div>
        <button id="cont" class="btn hidden" data-act="cont">המשך ➜</button>
      `, {
        map, home,
        ans: (a, el) => answer(q, a, el),
        numok: () => { const v = document.getElementById('numin').value; answer(q, v, null); },
        cont: next
      });
      const inp = document.getElementById('numin');
      if (inp) { inp.focus({ preventScroll: true }); inp.addEventListener('keydown', e => { if (e.key === 'Enter') actions.numok(); }); }
    }
    function answer(q, a, el) {
      const ok = check(q, a);
      if (ok === null) { toast('צריך לכתוב מספר 🙂'); return; }
      app.querySelectorAll('.opt, [data-act=numok]').forEach(b => b.disabled = true);
      const inp = document.getElementById('numin'); if (inp) inp.disabled = true;
      if (q.t !== 'num') {
        app.querySelectorAll('.opt').forEach(b => { if (check(q, b.dataset.arg)) b.classList.add('right'); });
        if (!ok && el) el.classList.add('wrong');
      }
      const fb = document.getElementById('fb');
      if (ok) {
        done++; st.correct++; beep(boss ? 'hit' : 'good');
        if (boss) { boss.hit(); const f = document.getElementById('bface'); if (f) { f.classList.add('hit'); } const bar = app.querySelector('.bosshp i'); if (bar) bar.style.width = (boss.hp / boss.max * 100) + '%'; }
        fb.innerHTML = `<div class="fb good"><b class="h">${boss ? '💥 פגיעה!' : ['מעולה! ✨', 'בדיוק! 🎯', 'נכון! ⚡', 'יפה מאוד! 🌟'][Math.floor(Math.random() * 4)]}</b>${esc(q.ex)}</div>`;
      } else {
        st.hearts--; st.mistakes++; beep('bad');
        if (o.onWrong) o.onWrong(q);
        queue.push(q); // השאלה חוזרת בסוף — צריך לענות עליה נכון
        fb.innerHTML = `<div class="fb bad"><b class="h">לא בדיוק — התשובה: ${esc(fmtAns(q))}</b>${esc(q.ex)}<br><small class="muted">השאלה תחזור בהמשך.</small></div>`;
        const h = app.querySelector('.hearts'); if (h) h.textContent = '❤️'.repeat(Math.max(0, st.hearts)) + '🖤'.repeat(Math.max(0, (o.maxHearts || 3) - st.hearts));
      }
      const pi = app.querySelector('.prog i'); if (pi) pi.style.width = (done / total * 100) + '%';
      const cont = document.getElementById('cont');
      if (st.hearts <= 0) { cont.textContent = 'המשך'; actions.cont = o.onFail; }
      cont.classList.remove('hidden');
      setTimeout(() => cont.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    next();
  }

  // ================= מבחן אלוף =================
  function exam() {
    const pool = [];
    CH.forEach(c => c.quiz.concat(c.boss.questions).forEach(q => pool.push(Object.assign({ _ch: c }, q))));
    const N = 15;
    const queue = shuffle(pool).slice(0, N);
    const st = { hearts: 5, mistakes: 0, correct: 0 };
    const wrong = new Set();
    const head = () => `<div class="bar"><button class="icon-btn" data-act="home" aria-label="בית">🏠</button><div class="ttl">🏆 מבחן אלוף</div></div>`;
    render(`${head()}
      <div class="card center"><div class="big" style="font-size:64px">🏆</div><h2>מבחן אלוף</h2>
      <p>${N} שאלות מכל הנושאים, 5 לבבות. הציון = אחוז השאלות שענית נכון בניסיון הראשון.</p></div>
      <button class="btn gold" data-act="go">התחל</button>
    `, {
      home, go: () => {
        runQuestions({
          queue, total: N, st, head, maxHearts: 5,
          chip: q => q._ch.icon + ' ' + esc(q._ch.title),
          onWrong: q => wrong.add(q),
          onDone: () => finish(), onFail: () => finish(true)
        });
        function finish(failed) {
          // ציון = שאלות שנענו נכון בניסיון הראשון (אם הלבבות נגמרו — רק מה שנענה נכון עד אז)
          const firstTry = failed ? Math.max(0, st.correct - wrong.size) : N - wrong.size;
          const score = Math.round((Math.max(0, firstTry) / N) * 100);
          const best = score > S.examBest; if (best) S.examBest = score;
          S.xp += st.correct * 5; save();
          if (score >= 80) { beep('win'); confetti(); } else beep('tap');
          render(`<div class="result"><div class="big">${score >= 80 ? '🏆' : score >= 60 ? '🥈' : '📚'}</div><h2>ציון: ${score}%</h2>
            <p class="muted">${failed ? 'הלבבות נגמרו. ' : ''}${best ? 'שיא חדש! ' : ''}${score >= 80 ? 'אתה מוכן למבחן!' : 'כדאי לחזור על הנושאים שהיו קשים בספר הידע.'}</p></div>
            <button class="btn gold" data-act="again">שוב 🔁</button><button class="btn sec" data-act="book">📖 ספר הידע</button><button class="btn sec" data-act="home">לבית</button>`, { again: exam, book, home });
        }
      }
    });
  }

  // ================= ספר הידע =================
  function book() {
    render(`<div class="bar"><button class="icon-btn" data-act="home" aria-label="בית">🏠</button><div class="ttl">📖 ספר הידע</div></div>
      <p class="muted">כל השיעורים והנוסחאות — לחזרה לפני מבחן.</p>
      ${CH.map((c, i) => `<details class="ch"><summary>${c.icon} ${i + 1}. ${esc(c.title)}</summary><div class="in">${c.lessons.map(l => `<h3>${esc(l.title)}</h3><div class="body">${l.html}</div>`).join('')}</div></details>`).join('')}
    `, { home });
  }

  // ================= הגדרות =================
  function settings() {
    render(`<div class="bar"><button class="icon-btn" data-act="home" aria-label="בית">🏠</button><div class="ttl">⚙️ הגדרות</div></div>
      <button class="btn sec" data-act="snd">${S.sound ? '🔊 צלילים: פועל' : '🔇 צלילים: כבוי'}</button>
      <button class="btn sec" data-act="free">${S.free ? '🔓 כל השלבים פתוחים' : '🔒 שלבים נפתחים לפי הסדר'}</button>
      <p class="muted" style="font-size:14px">מצב "כל השלבים פתוחים" שימושי כשרוצים לקפוץ ישר לנושא של ההרצאה.</p>
      <button class="btn sec mt" data-act="reset">🗑️ איפוס התקדמות</button>
    `, {
      home,
      snd: () => { S.sound = !S.sound; save(); settings(); },
      free: () => { S.free = !S.free; save(); settings(); },
      reset: (a, el) => {
        if (el.dataset.sure) { Object.assign(S, { done: {}, xp: 0, examBest: 0 }); save(); toast('ההתקדמות אופסה'); home(); }
        else { el.dataset.sure = '1'; el.textContent = '⚠️ ללחוץ שוב לאישור האיפוס'; }
      }
    });
  }

  // ================= התקנה לטלפון =================
  let installEvt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; refreshInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; refreshInstall(); toast('הותקן! 🎉'); });
  function refreshInstall() {
    const b = document.getElementById('installBtn');
    if (b) b.classList.toggle('hidden', standalone() || !(installEvt || isIOS));
  }
  async function doInstall() {
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { } installEvt = null; refreshInstall(); }
    else if (isIOS) toast('בספארי: שיתוף ← "הוסף למסך הבית"');
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { }));
  }

  // לשימוש בדיקות
  SEMI._test = { parseNum, check, S };
  home();
})();
