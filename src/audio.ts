class AudioService {
  private context: AudioContext | null = null;

  unlock(): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      /* Ses yoksa oyun devam eder. */
    }
  }

  tone(frequency: number, duration: number, volume = 0.04): void {
    try {
      this.unlock();
      if (!this.context) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    } catch {
      /* Ses yoksa oyun devam eder. */
    }
  }
}

export const audio = new AudioService();
