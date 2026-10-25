/* Beat click and a simple synth for computer-keyboard / mouse notes (a real piano makes its own sound). */
window.CL = window.CL || {};
(function (CL) {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.voices = new Map();
    }

    // Browsers only allow audio after a click or key press, so call this from those events.
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    get running() { return !!this.ctx && this.ctx.state === 'running'; }

    click(accent) {
      if (!this.running) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = accent ? 1568 : 1046;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.08);
    }

    noteOn(midi) {
      if (!this.running || this.voices.has(midi)) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      this.voices.set(midi, { osc, gain });
    }

    noteOff(midi) {
      const v = this.voices.get(midi);
      if (!v) return;
      const t = this.ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      v.osc.stop(t + 0.3);
      this.voices.delete(midi);
    }
  }

  // Speaks chord names with the browser's built-in voice.
  class Speaker {
    constructor() {
      this.synth = window.speechSynthesis || null;
      this.voice = null;
      if (!this.synth) return;
      const pickVoice = () => {
        const voices = this.synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
        this.voice = voices.find((v) => v.localService && v.default)
          || voices.find((v) => v.localService)
          || voices[0]
          || null;
      };
      pickVoice();
      this.synth.addEventListener('voiceschanged', pickVoice);
    }

    get available() { return !!this.synth; }

    say(text) {
      if (!this.synth) return;
      this.synth.cancel();             // never queue up behind an older chord name
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.05;
      if (this.voice) u.voice = this.voice;
      this.synth.speak(u);
    }
  }

  CL.AudioEngine = AudioEngine;
  CL.Speaker = Speaker;
})(window.CL);
