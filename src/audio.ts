type ToneOptions = {
  fadeOut?: boolean;
  type?: OscillatorType;
};

type ActiveTone = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

class AudioService {
  private context: AudioContext | null = null;
  private readonly activeTones = new Set<ActiveTone>();

  unlock(): void {
    try {
      if (typeof AudioContext === 'undefined') return;
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => {
          /* Ses açılamazsa oyun sessiz devam eder. */
        });
      }
    } catch {
      /* Ses desteklenmiyorsa veya açılamıyorsa oyun devam eder. */
    }
  }

  tone(frequency: number, duration: number, volume = 0.04, options: ToneOptions = {}): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startTime = context.currentTime;
      const endTime = startTime + duration;
      const tone = { oscillator, gain };

      oscillator.frequency.value = frequency;
      oscillator.type = options.type ?? 'sine';
      gain.gain.setValueAtTime(volume, startTime);
      if (options.fadeOut !== false) {
        gain.gain.exponentialRampToValueAtTime(0.001, endTime);
      }
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.activeTones.delete(tone);
      };
      oscillator.start();
      oscillator.stop(endTime);
      this.activeTones.add(tone);
    } catch {
      /* Ses üretimi başarısız olursa oyun sessiz devam eder. */
    }
  }

  say(message: string): void {
    try {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined')
        return;
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'tr-TR';
      utterance.rate = 1.08;
      utterance.pitch = 1.12;
      utterance.volume = 0.75;
      speechSynthesis.speak(utterance);
    } catch {
      /* Konuşma sentezi desteklenmiyorsa oyun sessiz devam eder. */
    }
  }

  stopAll(): void {
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* Tarayıcı konuşma motorunu kapatamasa da oyun durdurulur. */
    }
    for (const { oscillator } of this.activeTones) {
      try {
        oscillator.stop();
      } catch {
        /* Tamamlanmış sesler zaten onended içinde temizlenir. */
      }
    }
  }
}

export const audio = new AudioService();
