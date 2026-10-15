// Motor de audio sintetizado con Web Audio API (100% autónomo y sin dependencias externas)
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.2, gainValue = 0.2, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const startTime = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(gainValue, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Sonido de click en botón
  click() {
    this.playTone(800, 'triangle', 0.05, 0.15);
  }

  // Tic tac del temporizador
  tick() {
    this.playTone(600, 'sine', 0.04, 0.08);
  }

  // Tic tac urgente (< 5 segundos)
  urgentTick() {
    this.playTone(900, 'square', 0.06, 0.12);
  }

  // Respuesta correcta
  correct() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      this.playTone(freq, 'triangle', 0.35, 0.18, i * 0.08);
    });
  }

  // Respuesta incorrecta
  wrong() {
    this.playTone(320, 'sawtooth', 0.25, 0.2, 0);
    this.playTone(220, 'sawtooth', 0.35, 0.2, 0.12);
  }

  // Cuenta regresiva 3, 2, 1
  countdownBeep(isFinal = false) {
    if (isFinal) {
      this.playTone(880, 'triangle', 0.4, 0.25);
    } else {
      this.playTone(440, 'triangle', 0.2, 0.2);
    }
  }

  // Fanfarria de victoria / Podio
  fanfare() {
    const melody = [
      { f: 523.25, d: 0.15, t: 0 },
      { f: 523.25, d: 0.15, t: 0.15 },
      { f: 523.25, d: 0.15, t: 0.30 },
      { f: 659.25, d: 0.4, t: 0.45 },
      { f: 587.33, d: 0.2, t: 0.90 },
      { f: 659.25, d: 0.2, t: 1.10 },
      { f: 783.99, d: 0.6, t: 1.30 }
    ];

    melody.forEach(m => {
      this.playTone(m.f, 'triangle', m.d, 0.22, m.t);
    });
  }

  // Pop de confeti
  pop() {
    this.playTone(400, 'square', 0.08, 0.15);
    this.playTone(800, 'sine', 0.12, 0.2, 0.04);
  }
}

window.soundEngine = new SoundEngine();
