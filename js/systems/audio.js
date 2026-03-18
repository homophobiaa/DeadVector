export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicInterval = null;
    this.musicStep = 0;
    this.muted = false;
  }

  async unlock() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtor) {
      return;
    }

    if (!this.context) {
      this.context = new AudioCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.12;
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;

    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.12;
    }

    return this.muted;
  }

  startMusic() {
    if (!this.context || this.musicInterval) {
      return;
    }

    const bassLine = [55, 55, 65.4, 49, 55, 73.4, 65.4, 49];

    this.musicInterval = window.setInterval(() => {
      const note = bassLine[this.musicStep % bassLine.length];
      this.playTone({ frequency: note, duration: 0.28, gain: 0.055, type: "triangle" });
      this.playTone({ frequency: note * 2, duration: 0.12, gain: 0.018, type: "square" });
      this.musicStep += 1;
    }, 380);
  }

  playTone({ frequency, duration, gain, type }) {
    if (!this.context || this.muted) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    const startTime = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    volume.gain.setValueAtTime(0.0001, startTime);
    volume.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(volume);
    volume.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  }

  playShoot(weaponName) {
    if (weaponName === "Scatter Cannon") {
      this.playTone({ frequency: 120, duration: 0.12, gain: 0.09, type: "sawtooth" });
      return;
    }

    if (weaponName === "Vector SMG") {
      this.playTone({ frequency: 240, duration: 0.06, gain: 0.035, type: "square" });
      return;
    }

    this.playTone({ frequency: 200, duration: 0.08, gain: 0.045, type: "triangle" });
  }

  playEnemyHit() {
    this.playTone({ frequency: 150, duration: 0.07, gain: 0.03, type: "square" });
  }

  playPlayerHit() {
    this.playTone({ frequency: 92, duration: 0.12, gain: 0.08, type: "sawtooth" });
  }

  playDash() {
    this.playTone({ frequency: 380, duration: 0.1, gain: 0.05, type: "triangle" });
  }

  playWaveStart() {
    this.playTone({ frequency: 392, duration: 0.14, gain: 0.05, type: "triangle" });
    window.setTimeout(() => {
      this.playTone({ frequency: 523.2, duration: 0.16, gain: 0.06, type: "triangle" });
    }, 100);
  }

  playGameOver() {
    this.playTone({ frequency: 110, duration: 0.28, gain: 0.08, type: "sawtooth" });
  }
}
