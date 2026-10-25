/* Scrolling treble staff drawn in SVG. Each chord is a <g> moved along x every frame. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const GAP = 12;                  // distance between staff lines
  const TOP = 112;                 // y of the top line (F5)
  const BOTTOM = TOP + 4 * GAP;    // y of the bottom line (E4)
  const REF_STEP = 30;             // diatonic step of E4
  const HEIGHT = 280;

  function yOf(step) { return BOTTOM - (step - REF_STEP) * GAP / 2; }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }

  // Accidentals are drawn as paths centred on the note's line or space, so they never
  // depend on how a font positions its glyphs.
  const SHARP = 'M-2.6 -10V9 M2.6 -9V10';
  const SHARP_BARS = 'M-5.2 -2.2L5.2 -4.6 M-5.2 4.6L5.2 2.2';
  const FLAT = 'M-3 -13V5 C1 2.5 5 -0.5 3.4 -3.2 C2 -5.2 -1 -4 -3 -1.2';
  const DOUBLE_SHARP = 'M-3.5 -3.5L3.5 3.5 M3.5 -3.5L-3.5 3.5';

  function drawAccidental(parent, acc, x, y) {
    const g = el('g', { class: 'acc', transform: `translate(${x},${y})` }, parent);
    if (acc === 1) {
      el('path', { d: SHARP, 'stroke-width': 1.4 }, g);
      el('path', { d: SHARP_BARS, 'stroke-width': 2.8 }, g);
    } else if (acc === -1) {
      el('path', { d: FLAT, 'stroke-width': 1.6 }, g);
    } else if (acc === 2) {
      el('path', { d: DOUBLE_SHARP, 'stroke-width': 2.2 }, g);
    } else if (acc === -2) {
      el('path', { d: FLAT, transform: 'translate(-4,0)', 'stroke-width': 1.6 }, g);
      el('path', { d: FLAT, transform: 'translate(3,0)', 'stroke-width': 1.6 }, g);
    }
  }

  const REASON_TEXT ={ review: '↺ again', new: '★ new', similar: '≈ similar' };

  class Staff {
    constructor(svg) {
      this.svg = svg;
      svg.setAttribute('height', HEIGHT);

      const defs = el('defs', {}, svg);
      const grad = el('linearGradient', { id: 'staffFadeLeft', x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
      el('stop', { offset: '0', 'stop-color': '#FFFFFF', 'stop-opacity': '1' }, grad);
      el('stop', { offset: '0.7', 'stop-color': '#FFFFFF', 'stop-opacity': '0.9' }, grad);
      el('stop', { offset: '1', 'stop-color': '#FFFFFF', 'stop-opacity': '0' }, grad);

      this.band = el('rect', { class: 'band', y: 10, height: HEIGHT - 20, rx: 14 }, svg);
      this.linesG = el('g', { class: 'staff-lines' }, svg);
      this.layer = el('g', { class: 'chords' }, svg);
      el('rect', { x: 0, y: 0, width: 110, height: HEIGHT, fill: 'url(#staffFadeLeft)' }, svg);
      this.clef = el('text', { class: 'clef', x: 12, y: yOf(32) }, svg);
      this.clef.textContent = '𝄞';
      this.resize();
    }

    resize() {
      const width = this.svg.clientWidth || 900;
      this.width = width;
      this.playheadX = Math.max(170, Math.round(width * 0.24));
      this.band.setAttribute('x', this.playheadX - 48);
      this.band.setAttribute('width', 96);
      while (this.linesG.firstChild) this.linesG.removeChild(this.linesG.firstChild);
      for (let i = 0; i < 5; i++) {
        const y = TOP + i * GAP;
        el('line', { x1: 0, x2: width, y1: y, y2: y }, this.linesG);
      }
    }

    // Returns a handle used by the game to move and update this chord.
    addChord(chord, opts) {
      const g = el('g', { class: 'chord' }, this.layer);
      el('line', { class: 'bar', x1: -opts.barOffset, x2: -opts.barOffset, y1: TOP, y2: BOTTOM }, g);

      const notes = chord.notes
        .map((n) => ({ step: CL.music.noteStep(n), acc: n.acc }))
        .sort((a, b) => a.step - b.step);

      // Ledger lines below and above the staff.
      const lo = notes[0].step;
      const hi = notes[notes.length - 1].step;
      for (let s = REF_STEP - 2; s >= lo; s -= 2) el('line', { class: 'ledger', x1: -13, x2: 13, y1: yOf(s), y2: yOf(s) }, g);
      for (let s = REF_STEP + 10; s <= hi; s += 2) el('line', { class: 'ledger', x1: -13, x2: 13, y1: yOf(s), y2: yOf(s) }, g);

      // Noteheads; a note a step above its neighbour shifts right. Accidentals stagger left.
      let prev = null;
      let prevShift = false;
      let accCount = 0;
      notes.forEach((n) => {
        const shift = prev !== null && n.step - prev === 1 && !prevShift;
        prevShift = shift;
        prev = n.step;
        const x = shift ? 15 : 0;
        const y = yOf(n.step);
        el('ellipse', { class: 'head', cx: x, cy: y, rx: 7.8, ry: 5.4, transform: `rotate(-22 ${x} ${y})` }, g);
        if (n.acc) {
          drawAccidental(g, n.acc, -22 - (accCount % 2) * 13, y);
          accCount++;
        }
      });

      const reason = el('text', { class: 'reason ' + (opts.reason || ''), x: 0, y: 26 }, g);
      reason.textContent = REASON_TEXT[opts.reason] || '';
      const name = el('text', { class: 'name' + (opts.showName ? '' : ' unknown'), x: 0, y: 54 }, g);
      name.textContent = opts.showName ? chord.symbol : '?';
      const judge = el('text', { class: 'verdict', x: 0, y: 246 }, g);

      return {
        setX(x) { g.setAttribute('transform', `translate(${x.toFixed(1)},0)`); },
        setClass(cls, on) { g.classList.toggle(cls, on); },
        resolve(state, judgeText) {
          g.classList.add(state, 'done');
          name.textContent = chord.symbol;
          name.classList.remove('unknown');
          judge.textContent = judgeText;
        },
        remove() { g.remove(); }
      };
    }
  }

  CL.Staff = Staff;
})(window.CL);
