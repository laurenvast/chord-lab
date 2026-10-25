/* On-screen piano: shows held notes (blue = in the chord, orange = not) and hints. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

  class Keyboard {
    constructor(root, input, low, high) {
      this.root = root;
      this.keys = new Map();
      root.classList.add('kb');
      const isWhite = (m) => WHITE_PCS.includes(m % 12);
      let whites = 0;
      for (let m = low; m <= high; m++) if (isWhite(m)) whites++;
      const w = 100 / whites;

      let wi = 0;
      for (let m = low; m <= high; m++) {
        const key = document.createElement('div');
        key.dataset.midi = m;
        if (isWhite(m)) {
          key.className = 'key white';
          if (m % 12 === 0) {
            const lbl = document.createElement('span');
            lbl.className = 'lbl';
            lbl.textContent = 'C' + (Math.floor(m / 12) - 1);
            key.appendChild(lbl);
          }
          wi++;
        } else {
          key.className = 'key black';
          key.style.left = (wi * w - w * 0.3) + '%';
          key.style.width = (w * 0.6) + '%';
        }
        key.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          key.setPointerCapture(e.pointerId);
          input.press(m, 'mouse');
        });
        const up = () => { if (input.held.get(m) === 'mouse') input.release(m); };
        key.addEventListener('pointerup', up);
        key.addEventListener('pointercancel', up);
        root.appendChild(key);
        this.keys.set(m, key);
      }
    }

    // held: Map of midi notes; target: chord object or null; hint: show where the chord is;
    // carried: notes still held from the previous chord, shown neutral rather than wrong.
    render(held, target, hint, carried) {
      const pcs = target ? new Set(target.pcs) : null;
      const hintSet = hint && target ? new Set(target.midis) : null;
      this.keys.forEach((key, m) => {
        const isHeld = held.has(m);
        const inChord = !!pcs && pcs.has(m % 12);
        const neutral = !pcs || (carried && carried.has(m) && !inChord);
        key.classList.toggle('held', isHeld && neutral);
        key.classList.toggle('good', isHeld && inChord);
        key.classList.toggle('bad', isHeld && !neutral && !inChord);
        key.classList.toggle('hint', !isHeld && !!hintSet && hintSet.has(m));
      });
    }
  }

  CL.Keyboard = Keyboard;
})(window.CL);
