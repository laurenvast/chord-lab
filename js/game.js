/* The game: clock, scrolling lane, judging, tempo, check-ins and saving progress. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const STORE_KEY = 'chordlab.v1';
  const BEATS_PER_CHORD = 4;     // one chord per bar
  const COUNT_IN = 8;            // beats before the first chord reaches the band
  const EARLY_WINDOW = 1;        // a chord can be played up to 1 beat early
  const MISS_AFTER = 1.5;        // with "Wait for me" off, this many beats late is a miss
  const PERFECT_MS = 130;
  const GOOD_MS = 320;
  const HINT_AFTER_MS = 5000;    // when waiting this long, show the chord on the keyboard
  const CHECKIN_MS = 5 * 60 * 1000;
  const MIN_BPM = 48;
  const MAX_BPM = 132;
  const START_BPM = 66;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }

  const saved = load();
  const settings = Object.assign({ wait: true, sound: true, speak: true, names: 'auto' }, saved.settings || {});
  let coach = new CL.Coach(saved.coach);
  let bpm = saved.bpm || START_BPM;
  let bestComboEver = saved.bestCombo || 0;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ coach: coach.serialize(), bpm, bestCombo: bestComboEver, settings }));
    } catch (e) { /* private mode or storage blocked: progress just isn't kept */ }
  }

  const input = new CL.Input();
  const audio = new CL.AudioEngine();
  const speaker = new CL.Speaker();
  const staff = new CL.Staff($('staff'));
  const keyboard = new CL.Keyboard($('keyboard'), input, 36, 96);

  let mode = 'start';            // start | playing | checkin
  let beat = 0;                  // game clock, in beats
  let lastBeatInt = -1;
  let lastFrame = null;
  let lane = [];                 // chords on screen, oldest first
  let nextArrival = COUNT_IN;
  let combo = 0;
  let waiting = false;
  let hint = false;
  let evalTimer = null;
  let lastNoteOnAt = 0;
  let carried = new Set();       // notes still held from the chord just played
  let sinceCheckin = 0;
  let session = newSession();

  function newSession() {
    return { resolved: 0, firstTry: 0, onBeat: 0, bestCombo: 0, startBpm: bpm, ms: 0 };
  }

  // ---------- Lane ----------

  function pxPerBeat() {
    return Math.max(38, Math.min(72, (staff.width - staff.playheadX) / 17));
  }

  function spawn() {
    const { id, reason } = coach.next();
    const chord = CL.music.makeChord(id);
    const showName = settings.names === 'always' || coach.showName(id);
    const handle = staff.addChord(chord, { reason, showName, barOffset: pxPerBeat() * BEATS_PER_CHORD / 2 });
    lane.push({ chord, reason, arrival: nextArrival, handle, state: 'pending', mistake: false, arrivedAt: null, windowOpen: false });
    nextArrival += BEATS_PER_CHORD;
  }

  function fillLane() {
    const ppb = pxPerBeat();
    while (!lane.length || staff.playheadX + (lane[lane.length - 1].arrival - beat) * ppb < staff.width + 120) spawn();
  }

  function clearLane() {
    lane.forEach((c) => c.handle.remove());
    lane = [];
    nextArrival = COUNT_IN;
    beat = 0;
    lastBeatInt = -1;
    waiting = false;
    hint = false;
  }

  function activeChord() {
    return lane.find((c) => c.state === 'pending') || null;
  }

  // ---------- Clock ----------

  function frame(t) {
    requestAnimationFrame(frame);
    const dt = lastFrame === null ? 0 : Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    if (mode === 'playing') step(dt, t);
    draw(t);
  }

  function step(dt, t) {
    session.ms += dt * 1000;
    sinceCheckin += dt * 1000;
    const active = activeChord();
    let next = beat + dt * bpm / 60;
    waiting = false;
    if (active) {
      if (!active.windowOpen && active.arrival - next <= EARLY_WINDOW) {
        active.windowOpen = true;
        scheduleEval();          // catches a chord already being held
      }
      if (next >= active.arrival && active.arrivedAt === null) {
        active.arrivedAt = t - (next - active.arrival) * 60000 / bpm;
      }
      if (settings.wait && next >= active.arrival) {
        next = active.arrival;
        waiting = true;
      } else if (!settings.wait && next > active.arrival + MISS_AFTER) {
        resolveMiss(active);
      }
    }
    beat = next;
    const bi = Math.floor(beat + 1e-6);
    if (bi > lastBeatInt) {
      lastBeatInt = bi;
      onBeat(bi);
    }
    fillLane();
    if (sinceCheckin > CHECKIN_MS && !waiting) openCheckin();
  }

  function onBeat(bi) {
    if (settings.sound) audio.click(bi % BEATS_PER_CHORD === 0);
    const dots = $('beats').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === bi % BEATS_PER_CHORD);
    if (bi >= COUNT_IN - 4 && bi < COUNT_IN) showJudge(String(COUNT_IN - bi), 'count');
  }

  function draw(t) {
    const ppb = pxPerBeat();
    lane = lane.filter((c) => {
      const x = staff.playheadX + (c.arrival - beat) * ppb;
      if (x < -80 && c.state !== 'pending') {
        c.handle.remove();
        return false;
      }
      c.handle.setX(x);
      return true;
    });
    $('lane').classList.toggle('waiting', waiting);
    $('waitingNote').hidden = !waiting;

    const active = activeChord();
    const h = !!(mode === 'playing' && active && waiting && active.arrivedAt !== null && t - active.arrivedAt > HINT_AFTER_MS);
    if (h !== hint) {
      hint = h;
      $('waitingNote').textContent = h ? 'Here it is on the keyboard — play it to continue' : 'Waiting for you…';
      renderKeys();
    }
    // Browsers only allow sound and speech after the first click or key press on the page.
    const activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    $('soundBtn').hidden = !((settings.sound && !audio.running) || (settings.speak && speaker.available && !activated));
  }

  // ---------- Judging ----------

  function scheduleEval() {
    clearTimeout(evalTimer);
    evalTimer = setTimeout(evaluate, 70);   // chord notes rarely land at the exact same moment
  }

  function evaluate() {
    if (mode !== 'playing') return;
    const active = activeChord();
    if (!active || active.arrival - beat > EARLY_WINDOW) return;
    const target = new Set(active.chord.pcs);
    const notes = [...input.held.keys()].filter((m) => !(carried.has(m) && !target.has(m % 12)));
    if (!notes.length) return;
    const pcs = new Set(notes.map((m) => m % 12));
    const bassOk = active.chord.inversion === 0 || Math.min(...notes) % 12 === active.chord.bassPc;
    const match = pcs.size === target.size && [...target].every((p) => pcs.has(p)) && bassOk;
    if (match) resolveHit(active);
    else if (pcs.size >= target.size) markMistake(active);
  }

  function resolveHit(c) {
    const at = lastNoteOnAt || performance.now();
    const ms = c.arrivedAt !== null ? at - c.arrivedAt : -(c.arrival - beat) * 60000 / bpm;
    let judge;
    let kind;
    if (c.mistake) { judge = 'Fixed'; kind = 'fixed'; }
    else if (Math.abs(ms) <= PERFECT_MS) { judge = 'Perfect'; kind = 'perfect'; }
    else if (Math.abs(ms) <= GOOD_MS) { judge = 'Good'; kind = 'good'; }
    else { judge = ms < 0 ? 'Early' : 'Late'; kind = 'late'; }

    c.state = 'hit';
    c.handle.resolve(c.mistake ? 'fixed' : 'hit', judge);
    if (settings.speak) speaker.say(c.chord.spoken);
    carried = new Set(input.held.keys());
    session.resolved++;
    if (!c.mistake) {
      coach.record(c.chord.id, true, Math.max(0, ms));
      session.firstTry++;
      combo++;
      if (kind === 'perfect' || kind === 'good') session.onBeat++;
      if (combo % 6 === 0 && kind !== 'late') bpm = Math.min(MAX_BPM, bpm + 4);
    }
    session.bestCombo = Math.max(session.bestCombo, combo);
    bestComboEver = Math.max(bestComboEver, combo);
    showJudge(judge, kind);
    save();
    updateHud();
    renderKeys();
  }

  function markMistake(c) {
    if (c.mistake) return;
    c.mistake = true;
    c.handle.setClass('mistake', true);
    coach.record(c.chord.id, false, 0);
    combo = 0;
    bpm = Math.max(MIN_BPM, bpm - 4);
    showJudge('Not quite', 'miss');
    save();
    updateHud();
  }

  function resolveMiss(c) {
    c.state = 'miss';
    c.handle.resolve('miss', 'Miss');
    if (!c.mistake) {
      coach.record(c.chord.id, false, 0);
      bpm = Math.max(MIN_BPM, bpm - 4);
    }
    session.resolved++;
    combo = 0;
    showJudge('Miss', 'miss');
    save();
    updateHud();
    renderKeys();
  }

  function showJudge(text, kind) {
    const el = $('judge');
    el.textContent = text;
    el.className = 'judge ' + kind;
    void el.offsetWidth;           // restart the pop animation
    el.classList.add('pop');
  }

  // ---------- Screen updates ----------

  function updateHud() {
    $('combo').textContent = '×' + combo;
    $('tempoPill').textContent = '♩ = ' + Math.round(bpm);
    const lv = coach.levelInfo();
    $('levelPill').textContent = 'Level ' + lv.number + ' · ' + lv.name;
  }

  function renderKeys() {
    keyboard.render(input.held, mode === 'playing' ? activeChord() : null, hint, carried);
  }

  function updateDevices() {
    const st = input.midiState;
    $('startSearching').hidden = !(st === 'searching' || st === 'pending');
    $('startReady').hidden = st !== 'ready';
    $('startUnsupported').hidden = st !== 'unsupported';
    $('startDenied').hidden = st !== 'denied';
    if (st === 'ready') $('foundName').textContent = input.devices[0] + ' connected';
    $('deviceName').textContent = st === 'ready' ? input.devices[0] : 'Computer keys';
    $('deviceLabel').classList.toggle('on', st === 'ready');
  }

  function chipList(id, ids, kind) {
    const box = $(id);
    box.textContent = '';
    if (!ids.length) {
      const none = document.createElement('span');
      none.className = 'muted';
      none.textContent = '—';
      box.appendChild(none);
      return;
    }
    ids.slice(0, 8).forEach((cid) => {
      const chip = document.createElement('span');
      chip.className = 'chip ' + kind;
      chip.textContent = CL.music.makeChord(cid).symbol;
      box.appendChild(chip);
    });
  }

  // ---------- Flow ----------

  function startGame() {
    $('startOverlay').hidden = true;
    mode = 'playing';
    coach.resetSession();
    session = newSession();
    combo = 0;
    sinceCheckin = 0;
    carried = new Set(input.held.keys());
    clearLane();
    fillLane();
    lastFrame = null;
    updateHud();
    renderKeys();
  }

  function openCheckin() {
    mode = 'checkin';
    const s = session;
    const mins = Math.max(1, Math.round(s.ms / 60000));
    $('ciTitle').textContent = s.resolved ? `Nice — ${mins} min, ${s.resolved} chords` : 'Taking a break?';
    const firstPct = s.resolved ? Math.round(100 * s.firstTry / s.resolved) : 0;
    const beatPct = s.resolved ? Math.round(100 * s.onBeat / s.resolved) : 0;
    $('ciSub').textContent = s.resolved
      ? `Best combo ×${s.bestCombo} · ${firstPct}% right first try · ${beatPct}% on the beat · tempo ${s.startBpm} → ${Math.round(bpm)}`
      : 'Play a few chords and your progress shows up here.';
    const played = coach.session.played;
    const missed = coach.session.missed;
    chipList('ciNew', coach.session.introduced, 'new');
    chipList('ciSolid', Object.keys(played).filter((id) => !missed[id] && coach.stat(id).streak >= 2), 'solid');
    chipList('ciTricky', Object.keys(missed).sort((a, b) => missed[b] - missed[a]), 'tricky');
    $('checkinOverlay').hidden = false;
    $('ciKeep').focus();
  }

  function keepGoing() {
    $('checkinOverlay').hidden = true;
    const active = activeChord();
    if (active && active.arrivedAt !== null) active.arrivedAt = performance.now();
    mode = 'playing';
    sinceCheckin = 0;
    lastFrame = null;
  }

  function showStart() {
    $('returningNote').hidden = !coach.hasTricky();
    $('startOverlay').hidden = false;
    mode = 'start';
    renderKeys();
  }

  function finish() {
    $('checkinOverlay').hidden = true;
    clearLane();
    showStart();
  }

  // ---------- Wiring ----------

  input.on((e) => {
    if (e.type === 'devices') { updateDevices(); return; }
    if (e.source !== 'midi') {
      if (e.type === 'on') audio.noteOn(e.midi);
      else audio.noteOff(e.midi);
    }
    if (e.type === 'off') carried.delete(e.midi);
    if (e.type === 'on') {
      lastNoteOnAt = performance.now();
      if (mode === 'start') startGame();
      else if (mode === 'playing') scheduleEval();
    }
    renderKeys();
  });

  // Audio may only start after a click or key press.
  document.addEventListener('pointerdown', () => audio.ensure(), true);
  document.addEventListener('keydown', () => audio.ensure(), true);

  $('soundBtn').addEventListener('click', () => audio.ensure());
  $('stopBtn').addEventListener('click', () => { if (mode === 'playing') openCheckin(); });
  $('ciKeep').addEventListener('click', keepGoing);
  $('ciDone').addEventListener('click', finish);

  const waitToggle = $('waitToggle');
  waitToggle.checked = settings.wait;
  waitToggle.addEventListener('change', () => { settings.wait = waitToggle.checked; save(); });

  const pop = $('settingsPop');
  $('settingsBtn').addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
  const setSound = $('setSound');
  const setNames = $('setNames');
  const setSpeak = $('setSpeak');
  setSpeak.checked = settings.speak;
  setSpeak.disabled = !speaker.available;
  setSpeak.addEventListener('change', () => { settings.speak = setSpeak.checked; save(); });
  setSound.checked = settings.sound;
  setNames.checked = settings.names === 'always';
  setSound.addEventListener('change', () => { settings.sound = setSound.checked; save(); });
  setNames.addEventListener('change', () => { settings.names = setNames.checked ? 'always' : 'auto'; save(); });
  $('resetBtn').addEventListener('click', () => {
    if (!window.confirm('Reset all your progress? This starts you over from the first chords.')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    coach = new CL.Coach();
    bpm = START_BPM;
    bestComboEver = 0;
    combo = 0;
    pop.hidden = true;
    clearLane();
    $('checkinOverlay').hidden = true;
    showStart();
    updateHud();
  });

  window.addEventListener('resize', () => staff.resize());

  input.attachComputerKeyboard();
  input.initMidi();
  updateDevices();
  updateHud();
  showStart();
  requestAnimationFrame(frame);
})(window.CL);
