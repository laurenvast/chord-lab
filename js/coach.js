/* The coach: decides which chord comes next and tracks how well each one is known. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  const { mod12, rootPc } = CL.music;

  // Chords unlock one at a time in this order.
  const LEVELS = [
    { name: 'Major triads', items: ['C:maj:0', 'G:maj:0', 'F:maj:0'] },
    { name: 'Minor triads', items: ['A:min:0', 'D:min:0', 'E:min:0'] },
    { name: 'More keys', items: ['D:maj:0', 'A:maj:0', 'G:min:0', 'Bb:maj:0', 'C:min:0', 'E:maj:0', 'B:min:0'] },
    { name: 'Flat keys', items: ['Eb:maj:0', 'F:min:0', 'Ab:maj:0', 'F#:min:0', 'Db:maj:0', 'Bb:min:0', 'C#:min:0'] },
    { name: 'All 12 keys', items: ['B:maj:0', 'Eb:min:0', 'F#:maj:0', 'G#:min:0'] },
    { name: 'Inversions', items: ['C:maj:1', 'C:maj:2', 'G:maj:1', 'A:min:1', 'F:maj:2', 'D:min:1', 'G:maj:2', 'E:min:2', 'D:maj:1', 'C:min:1', 'F:maj:1', 'A:min:2'] },
    { name: 'Diminished & augmented', items: ['B:dim:0', 'C:aug:0', 'F#:dim:0', 'G:aug:0', 'C#:dim:0', 'F:aug:0'] },
    { name: '7th chords', items: ['G:dom7:0', 'C:maj7:0', 'D:m7:0', 'A:m7:0', 'F:maj7:0', 'C:dom7:0', 'E:m7:0', 'D:dom7:0'] }
  ];

  const ORDER = [];
  LEVELS.forEach((lv, li) => lv.items.forEach((id) => ORDER.push({ id, level: li })));

  const SLOW_MS = 2500;      // a correct answer slower than this still gets reviewed
  const FAST_MS = 1500;      // fast enough to hide the chord name

  // How alike two chords are: same root, same quality, circle-of-fifths neighbours, relatives.
  function similarity(a, b) {
    const [ra, qa, ia] = a.split(':');
    const [rb, qb, ib] = b.split(':');
    const pa = rootPc(ra);
    const pb = rootPc(rb);
    let s = 0;
    if (pa === pb && qa === qb && ia !== ib) s += 3;
    else if (pa === pb) s += 2;
    if (qa === qb) s += 1;
    const d = mod12(pa - pb);
    if (d === 5 || d === 7) s += 1;
    if (qa === 'maj' && qb === 'min' && mod12(pa - pb) === 3) s += 2;
    if (qa === 'min' && qb === 'maj' && mod12(pb - pa) === 3) s += 2;
    return s;
  }

  class Coach {
    constructor(saved) {
      saved = saved || {};
      this.stats = saved.stats || {};
      this.unlocked = (saved.unlocked && saved.unlocked.length) ? saved.unlocked : ORDER.slice(0, 3).map((o) => o.id);
      this.counter = saved.counter || 0;   // number of chords handed out, ever
      this.recent = [];                     // recent results this session (true/false)
      this.reasons = [];                    // reasons for recent picks
      this.sinceIntro = 0;
      this.lastId = null;
      this.session = { introduced: [], missed: {}, played: {} };
    }

    stat(id) {
      if (!this.stats[id]) {
        this.stats[id] = { seen: 0, correct: 0, streak: 0, interval: 2, dueAt: 0, avgMs: null, review: false, misses: 0 };
      }
      return this.stats[id];
    }

    // Recent accuracy, 0..1. Assume "okay" until there's enough data.
    skill() {
      const r = this.recent.slice(-8);
      if (r.length < 4) return 0.75;
      return r.filter(Boolean).length / r.length;
    }

    mastery(id) {
      const s = this.stat(id);
      if (!s.seen) return 0;
      const streakPart = Math.min(s.streak, 5) / 5 * 0.6;
      const speedPart = s.avgMs === null ? 0 : (s.avgMs < 1200 ? 0.4 : (s.avgMs < SLOW_MS ? 0.2 : 0));
      return streakPart + speedPart;
    }

    // Hide the name once a chord is read quickly and reliably.
    showName(id) {
      const s = this.stat(id);
      return !(s.streak >= 4 && s.avgMs !== null && s.avgMs < FAST_MS);
    }

    levelInfo() {
      let max = 0;
      this.unlocked.forEach((id) => {
        const o = ORDER.find((x) => x.id === id);
        if (o && o.level > max) max = o.level;
      });
      return { number: max + 1, name: LEVELS[max].name };
    }

    pick(id, reason) {
      this.lastId = id;
      const s = this.stat(id);
      if (reason === 'new' || (!reason && !s.announced)) reason = s.announced ? '' : 'new';
      s.announced = true;
      this.reasons.push(reason || '');
      if (this.reasons.length > 10) this.reasons.shift();
      return { id, reason: reason || '' };
    }

    next() {
      this.counter++;
      const last = this.lastId;
      let pool = this.unlocked.filter((id) => id !== last);
      if (!pool.length) pool = this.unlocked.slice();

      // 1. Missed or slow chords come back when due (but not back to back).
      const recentReviews = this.reasons.slice(-3).filter((r) => r === 'review').length;
      const due = pool
        .filter((id) => { const s = this.stat(id); return s.review && s.dueAt <= this.counter; })
        .sort((a, b) => this.stat(a).dueAt - this.stat(b).dueAt);
      if (due.length && recentReviews < 2) return this.pick(due[0], 'review');

      // 2. Doing well and everything has been seen: introduce one new chord.
      const nextLocked = ORDER.find((o) => !this.unlocked.includes(o.id));
      const allSeen = this.unlocked.every((id) => this.stat(id).seen >= 2);
      if (nextLocked && allSeen && !due.length && this.sinceIntro >= 5 && this.skill() >= 0.8) {
        this.unlocked.push(nextLocked.id);
        this.sinceIntro = 0;
        this.session.introduced.push(nextLocked.id);
        const s = this.stat(nextLocked.id);
        s.review = true;                       // bring it back soon after its debut
        s.dueAt = this.counter + 3;
        return this.pick(nextLocked.id, 'new');
      }

      // 3. Struggling: stay close to the last chord, favouring weaker ones.
      if (last && this.skill() < 0.7) {
        const similar = pool
          .filter((id) => similarity(last, id) >= 2)
          .sort((a, b) => this.mastery(a) - this.mastery(b));
        if (similar.length) return this.pick(similar[0], 'similar');
      }

      // 4. Otherwise mix it up, weighted toward chords that aren't solid yet.
      const weights = pool.map((id) => {
        const s = this.stat(id);
        return 0.25 + (1 - this.mastery(id)) + (s.dueAt <= this.counter ? 0.3 : 0);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return this.pick(pool[i], '');
      }
      return this.pick(pool[pool.length - 1], '');
    }

    // ok: right first try. ms: how long after the beat it was played.
    record(id, ok, ms) {
      const s = this.stat(id);
      s.seen++;
      this.sinceIntro++;
      this.recent.push(ok);
      if (this.recent.length > 12) this.recent.shift();
      this.session.played[id] = (this.session.played[id] || 0) + 1;

      if (ok) {
        s.correct++;
        s.streak++;
        s.avgMs = s.avgMs === null ? ms : s.avgMs * 0.6 + ms * 0.4;
        if (ms > SLOW_MS) {
          s.review = true;
          s.interval = 3;
          s.dueAt = this.counter + 3;
        } else {
          s.review = false;
          s.interval = Math.min(32, Math.round(s.interval * 2));
          s.dueAt = this.counter + s.interval;
        }
      } else {
        s.streak = 0;
        s.misses++;
        s.review = true;
        s.interval = 2;
        s.dueAt = this.counter + 3;
        this.session.missed[id] = (this.session.missed[id] || 0) + 1;
      }
    }

    resetSession() {
      this.session = { introduced: [], missed: {}, played: {} };
      this.recent = [];
      this.reasons = [];
      this.lastId = null;
    }

    serialize() {
      return { stats: this.stats, unlocked: this.unlocked, counter: this.counter };
    }

    hasTricky() {
      return Object.values(this.stats).some((s) => s.review);
    }
  }

  CL.Coach = Coach;
  CL.LEVELS = LEVELS;
})(window.CL);
