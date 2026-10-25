/* Music theory helpers: spelled notes, chord spelling and voicing. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

  // ivs: semitones above the root; steps: letter-name steps above the root.
  const QUALITIES = {
    maj: { ivs: [0, 4, 7], steps: [0, 2, 4], suffix: '', label: 'major' },
    min: { ivs: [0, 3, 7], steps: [0, 2, 4], suffix: 'm', label: 'minor' },
    dim: { ivs: [0, 3, 6], steps: [0, 2, 4], suffix: '°', label: 'diminished' },
    aug: { ivs: [0, 4, 8], steps: [0, 2, 4], suffix: '+', label: 'augmented' },
    maj7: { ivs: [0, 4, 7, 11], steps: [0, 2, 4, 6], suffix: 'maj7', label: 'major 7th' },
    m7: { ivs: [0, 3, 7, 10], steps: [0, 2, 4, 6], suffix: 'm7', label: 'minor 7th' },
    dom7: { ivs: [0, 4, 7, 10], steps: [0, 2, 4, 6], suffix: '7', label: 'dominant 7th' }
  };

  const INVERSION_LABEL = ['', '1st inversion', '2nd inversion', '3rd inversion'];
  const INVERSION_SPOKEN = ['', 'first inversion', 'second inversion', 'third inversion'];
  const QUALITY_SPOKEN = {
    maj: 'major', min: 'minor', dim: 'diminished', aug: 'augmented',
    maj7: 'major seventh', m7: 'minor seventh', dom7: 'seven'
  };

  // "Bb" -> "B flat", for text-to-speech.
  function spokenRoot(s) {
    return s[0] + (s[1] === 'b' ? ' flat' : (s[1] === '#' ? ' sharp' : ''));
  }

  function mod12(n) { return ((n % 12) + 12) % 12; }

  // "Bb" -> { letter: 6, acc: -1 }
  function parseRoot(s) {
    const letter = LETTERS.indexOf(s[0]);
    const acc = s[1] === '#' ? 1 : (s[1] === 'b' ? -1 : 0);
    return { letter, acc };
  }

  function rootPc(s) {
    const r = parseRoot(s);
    return mod12(LETTER_PC[r.letter] + r.acc);
  }

  function displayRoot(s) {
    return s[0] + (s[1] === 'b' ? '♭' : (s[1] === '#' ? '♯' : ''));
  }

  function noteName(n) { return LETTERS[n.letter] + ACC[n.acc]; }
  function noteMidi(n) { return 12 * (n.octave + 1) + LETTER_PC[n.letter] + n.acc; }
  function noteStep(n) { return n.octave * 7 + n.letter; }
  function accGlyph(acc) { return ACC[acc]; }

  // Correctly spelled chord tones (no octave), root first.
  function spell(root, quality) {
    const q = QUALITIES[quality];
    const r = parseRoot(root);
    const rPc = mod12(LETTER_PC[r.letter] + r.acc);
    return q.ivs.map((iv, i) => {
      const letter = (r.letter + q.steps[i]) % 7;
      let acc = mod12(rPc + iv) - LETTER_PC[letter];
      if (acc > 6) acc -= 12;
      if (acc < -6) acc += 12;
      return { letter, acc };
    });
  }

  // id format: "Bb:min:1" -> root, quality, inversion.
  function makeChord(id) {
    const [root, quality, invStr] = id.split(':');
    const inversion = Number(invStr || 0);
    const q = QUALITIES[quality];
    const tones = spell(root, quality);
    const ordered = tones.slice(inversion).concat(tones.slice(0, inversion));

    // Close voicing, bass note in octave 4, each tone stacked above the last.
    let notes = [];
    let prevStep = -Infinity;
    ordered.forEach((t) => {
      let octave = 4;
      while (octave * 7 + t.letter <= prevStep) octave++;
      const n = { letter: t.letter, acc: t.acc, octave };
      prevStep = noteStep(n);
      notes.push(n);
    });
    // Tall chords sit too high above the staff: drop them an octave.
    if (noteStep(notes[notes.length - 1]) > 41) {
      notes = notes.map((n) => ({ ...n, octave: n.octave - 1 }));
    }

    const base = displayRoot(root) + q.suffix;
    const symbol = inversion ? base + '/' + noteName(ordered[0]) : base;
    const label = displayRoot(root) + ' ' + q.label + (inversion ? ', ' + INVERSION_LABEL[inversion] : '');
    return {
      id,
      root,
      quality,
      inversion,
      notes,
      midis: notes.map(noteMidi),
      pcs: tones.map((t) => mod12(LETTER_PC[t.letter] + t.acc)),
      bassPc: mod12(LETTER_PC[ordered[0].letter] + ordered[0].acc),
      symbol,
      label,
      spoken: spokenRoot(root) + ' ' + QUALITY_SPOKEN[quality] + (inversion ? ', ' + INVERSION_SPOKEN[inversion] : '')
    };
  }

  CL.music = { mod12, rootPc, displayRoot, noteName, noteMidi, noteStep, accGlyph, makeChord, QUALITIES };
})(window.CL);
