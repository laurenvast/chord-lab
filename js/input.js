/* Note input from a MIDI piano (Web MIDI), the computer keyboard, or clicks on the on-screen keys. */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  // Computer keys -> semitones above the current octave's C (piano-style layout).
  const KEYMAP = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8,
    KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17
  };

  class Input {
    constructor() {
      this.held = new Map();         // midi -> source ('midi' | 'keys' | 'mouse')
      this.listeners = [];
      this.midiState = 'pending';    // pending | unsupported | denied | searching | ready
      this.devices = [];
      this.keyBase = 60;
      this.keyDown = {};
    }

    on(fn) { this.listeners.push(fn); }
    emit(e) { this.listeners.forEach((fn) => fn(e)); }

    press(midi, source) {
      if (this.held.has(midi)) return;
      this.held.set(midi, source);
      this.emit({ type: 'on', midi, source });
    }

    release(midi) {
      if (!this.held.has(midi)) return;
      const source = this.held.get(midi);
      this.held.delete(midi);
      this.emit({ type: 'off', midi, source });
    }

    releaseAll(source) {
      [...this.held.entries()].forEach(([m, s]) => { if (!source || s === source) this.release(m); });
    }

    async initMidi() {
      if (!navigator.requestMIDIAccess) {
        this.midiState = 'unsupported';
        this.emit({ type: 'devices' });
        return;
      }
      try {
        this.access = await navigator.requestMIDIAccess();
        this.access.onstatechange = () => this.scan();
        this.scan();
      } catch (err) {
        this.midiState = 'denied';
        this.emit({ type: 'devices' });
      }
    }

    scan() {
      this.devices = [];
      this.access.inputs.forEach((port) => {
        if (port.state !== 'connected') return;
        this.devices.push(port.name || 'Piano');
        port.onmidimessage = (msg) => this.onMidi(msg);
      });
      this.midiState = this.devices.length ? 'ready' : 'searching';
      if (!this.devices.length) this.releaseAll('midi');
      this.emit({ type: 'devices' });
    }

    onMidi(msg) {
      const [status, note, velocity] = msg.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && velocity > 0) this.press(note, 'midi');
      else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) this.release(note);
    }

    attachComputerKeyboard() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
        if (e.code === 'KeyZ') { this.keyBase = Math.max(36, this.keyBase - 12); return; }
        if (e.code === 'KeyX') { this.keyBase = Math.min(84, this.keyBase + 12); return; }
        if (!(e.code in KEYMAP)) return;
        e.preventDefault();
        const midi = this.keyBase + KEYMAP[e.code];
        this.keyDown[e.code] = midi;
        this.press(midi, 'keys');
      });
      window.addEventListener('keyup', (e) => {
        const midi = this.keyDown[e.code];
        if (midi === undefined) return;
        delete this.keyDown[e.code];
        this.release(midi);
      });
      window.addEventListener('blur', () => { this.keyDown = {}; this.releaseAll('keys'); this.releaseAll('mouse'); });
    }
  }

  CL.Input = Input;
})(window.CL);
