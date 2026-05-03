// AudioManager — Prompt 10.
//
// On synthétise les SFX en Web Audio API (oscillateurs + enveloppe ADSR)
// plutôt que de charger des fichiers .webm. Avantages :
//   · zéro dépendance, zéro asset à fournir
//   · sons toujours synchronisés avec les variations de pitch demandées
//     (±5% sur plant/harvest pour éviter la lassitude — GDD Prompt 10)
//   · dans un second temps on pourra remplacer chaque méthode play* par
//     un Howler.play(spriteName) sans changer les call sites
//
// Le contexte audio se crée au premier clic utilisateur (autoplay policy).

const SFX_DEFS = {
  plant: {
    notes: [{ freq: 660, attack: 0.005, decay: 0.18, type: 'triangle' }],
    pitchJitter: 0.05,
    gain: 0.35,
  },
  harvest: {
    notes: [
      { freq: 880, attack: 0.005, decay: 0.12, type: 'sine', delay: 0 },
      { freq: 660, attack: 0.005, decay: 0.18, type: 'sine', delay: 0.06 },
    ],
    pitchJitter: 0.05,
    gain: 0.45,
  },
  upgrade: {
    notes: [
      { freq: 523, attack: 0.01, decay: 0.18, type: 'triangle', delay: 0 },
      { freq: 659, attack: 0.01, decay: 0.18, type: 'triangle', delay: 0.10 },
      { freq: 784, attack: 0.01, decay: 0.30, type: 'triangle', delay: 0.22 },
    ],
    gain: 0.35,
  },
  gardener: {
    notes: [
      { freq: 392, attack: 0.02, decay: 0.40, type: 'sine', delay: 0 },
      { freq: 494, attack: 0.02, decay: 0.40, type: 'sine', delay: 0 },
      { freq: 587, attack: 0.02, decay: 0.40, type: 'sine', delay: 0 },
    ],
    gain: 0.30,
  },
  prestige: {
    notes: [
      { freq: 523, attack: 0.01, decay: 0.18, type: 'triangle', delay: 0 },
      { freq: 659, attack: 0.01, decay: 0.18, type: 'triangle', delay: 0.10 },
      { freq: 784, attack: 0.01, decay: 0.18, type: 'triangle', delay: 0.20 },
      { freq: 1046, attack: 0.02, decay: 0.50, type: 'triangle', delay: 0.32 },
    ],
    gain: 0.45,
  },
  quest: {
    notes: [
      { freq: 698, attack: 0.005, decay: 0.14, type: 'sine', delay: 0 },
      { freq: 1046, attack: 0.01, decay: 0.20, type: 'sine', delay: 0.08 },
    ],
    gain: 0.40,
  },
  expedition: {
    notes: [
      { freq: 220, attack: 0.02, decay: 0.40, type: 'sawtooth', delay: 0 },
      { freq: 330, attack: 0.02, decay: 0.20, type: 'sawtooth', delay: 0.18 },
    ],
    gain: 0.30,
  },
  // Son discret pour les clics génériques
  click: {
    notes: [{ freq: 1320, attack: 0.001, decay: 0.05, type: 'sine' }],
    gain: 0.18,
  },
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxVolume = 0.7;
    this.musicVolume = 0.4;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[audio] Web Audio non disponible :', e);
    }
  }

  setSettings({ sfxVolume, musicVolume, muted }) {
    if (sfxVolume != null) this.sfxVolume = sfxVolume;
    if (musicVolume != null) this.musicVolume = musicVolume;
    if (muted != null) this.muted = muted;
  }

  play(name) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.muted || this.sfxVolume <= 0) return;
    const def = SFX_DEFS[name];
    if (!def) return;

    const t0 = this.ctx.currentTime;
    const jitter = def.pitchJitter ?? 0;
    const pitchMul = 1 + (Math.random() - 0.5) * 2 * jitter;

    for (const note of def.notes) {
      this.scheduleNote(note, t0 + (note.delay ?? 0), pitchMul, def.gain ?? 0.3);
    }
  }

  scheduleNote(note, when, pitchMul, layerGain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = note.type ?? 'sine';
    osc.frequency.setValueAtTime(note.freq * pitchMul, when);

    const peak = layerGain * this.sfxVolume;
    const attack = note.attack ?? 0.01;
    const decay  = note.decay  ?? 0.20;

    // Enveloppe AD : attaque rapide → decay exponentiel
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

    osc.connect(gain).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + attack + decay + 0.05);
  }
}

export const audioManager = new AudioManager();

// Réveille le contexte audio au premier clic (politique autoplay des navigateurs)
let bootstrapped = false;
export function bootstrapAudioOnFirstInteraction() {
  if (bootstrapped) return;
  bootstrapped = true;
  const start = () => {
    audioManager.init();
    if (audioManager.ctx?.state === 'suspended') audioManager.ctx.resume();
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('pointerdown', start, { once: true });
  window.addEventListener('keydown', start, { once: true });
}
