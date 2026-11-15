const VOICES = [
  { frequency: 690, duration: .030, level: .12, noiseMix: .58 },
  { frequency: 920, duration: .024, level: .115, noiseMix: .69 },
  { frequency: 550, duration: .033, level: .13, noiseMix: .44 },
] as const;

/** Open the audio device and prepare the three quiet tap sounds on first use. */
export class TapSound {
  private context: AudioContext | null = null;
  private clips: AudioBuffer[] | null = null;
  private win: Pick<Window & typeof window, 'AudioContext' | 'Math'>;

  constructor(win: Pick<Window & typeof window, 'AudioContext' | 'Math'>) { this.win = win; }

  play(): void {
    try {
      const audio = this.context ??= new this.win.AudioContext();
      const clips = this.clips ??= VOICES.map((voice, index) => this.synthesize(audio, voice, 712343 + index * 13273));
      const source = audio.createBufferSource();
      source.buffer = clips[Math.floor(this.win.Math.random() * clips.length)];
      source.connect(audio.destination);
      source.onended = () => source.disconnect();
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
      source.start();
    } catch {
      // Keep the pointer responsive when audio is unavailable.
      this.close();
    }
  }

  close(): void {
    const audio = this.context;
    this.context = null;
    this.clips = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  }

  private synthesize(audio: AudioContext, voice: typeof VOICES[number], initialSeed: number): AudioBuffer {
    const rate = audio.sampleRate;
    const length = Math.ceil(voice.duration * rate);
    const clip = audio.createBuffer(1, length, rate);
    const samples = clip.getChannelData(0);
    let seed = initialSeed;
    let knock = 0;
    for (let index = 0; index < length; index++) {
      const time = index / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      knock += .38 * (noise - knock);
      const tone = Math.sin(2 * Math.PI * voice.frequency * time);
      const envelope = Math.min(1, time * 2300) * Math.exp(-135 * time) * (1 - index / length);
      samples[index] = voice.level * envelope * (voice.noiseMix * knock + (1 - voice.noiseMix) * tone);
    }
    return clip;
  }
}
