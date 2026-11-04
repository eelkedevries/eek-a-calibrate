// Haptics, sound and speech (design §3.10, spec §17.5.5): optional extras, never the only cue.
// - Haptics: navigator.vibrate where supported (Android): 20 ms when Ready latches, [30, 60, 30]
//   on an auto-pause, 15 ms per bubble pop.
// - Sound: tones generated in the page with Web Audio (no audio files), at a low volume; the
//   audio context starts on the Play tap. Get ready itself is silent.
// - Speech ("Read instructions aloud"): speechSynthesis in en-GB with local voices only, so that
//   no text goes to a speech service; at most one utterance per 2.5 s; unavailable without such
//   a voice.

export const HAPTICS = { ready: 20, pause: [30, 60, 30], pop: 15 } as const;

/** Vibrates where the browser can; returns whether it tried. */
export function vibrate(pattern: number | readonly number[]): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
  if (!nav?.vibrate) return false;
  try {
    return nav.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    return false;
  }
}

// ----- Sound -----------------------------------------------------------------------------------

export type SoundName = 'pop' | 'pause' | 'chime';

/** One tone: a sine or triangle with a short attack and an exponential release. */
export interface Tone {
  type: 'sine' | 'triangle';
  /** Start and end frequency (Hz); a glide when they differ. */
  fromHz: number;
  toHz: number;
  /** Offset from the sound's start and length, seconds. */
  atS: number;
  durS: number;
  /** Peak gain relative to the master volume, 0–1. */
  gain: number;
}

/** The game's sounds as data: a soft pop, a falling two-tone for a pause, a rising chime. */
export const SOUNDS: Readonly<Record<SoundName, readonly Tone[]>> = {
  pop: [{ type: 'sine', fromHz: 880, toHz: 440, atS: 0, durS: 0.09, gain: 0.9 }],
  pause: [
    { type: 'triangle', fromHz: 660, toHz: 660, atS: 0, durS: 0.14, gain: 0.7 },
    { type: 'triangle', fromHz: 495, toHz: 495, atS: 0.16, durS: 0.18, gain: 0.7 },
  ],
  chime: [
    { type: 'sine', fromHz: 784, toHz: 784, atS: 0, durS: 0.22, gain: 0.6 },
    { type: 'sine', fromHz: 1046.5, toHz: 1046.5, atS: 0.12, durS: 0.3, gain: 0.6 },
  ],
};

/** The master volume: low by default (design §3.10). */
export const SOUND_VOLUME = 0.08;

/** The length of a sound in seconds. */
export function soundLength(name: SoundName): number {
  return Math.max(...SOUNDS[name].map((t) => t.atS + t.durS));
}

let audio: AudioContext | null = null;

/** Creates or resumes the audio context; call from the Play tap (browsers need a gesture). */
export function unlockAudio(): void {
  try {
    const Ctx = (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  } catch {
    audio = null;
  }
}

/** Plays a sound now, if the audio context has been unlocked; quietly does nothing otherwise. */
export function playSound(name: SoundName, volume = SOUND_VOLUME): boolean {
  const ctx = audio;
  if (!ctx || ctx.state !== 'running') return false;
  const t0 = ctx.currentTime + 0.01;
  for (const tone of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.fromHz, t0 + tone.atS);
    if (tone.toHz !== tone.fromHz) osc.frequency.exponentialRampToValueAtTime(tone.toHz, t0 + tone.atS + tone.durS);
    gain.gain.setValueAtTime(0.0001, t0 + tone.atS);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain * volume), t0 + tone.atS + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.atS + tone.durS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + tone.atS);
    osc.stop(t0 + tone.atS + tone.durS + 0.02);
  }
  return true;
}

// ----- Speech ----------------------------------------------------------------------------------

export interface VoiceLike {
  lang: string;
  localService: boolean;
  name: string;
  default?: boolean;
}

/** The voice to speak with: British English and on the device, the browser's default first; else null. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const usable = voices.filter((v) => v.localService && /^en[-_]GB$/i.test(v.lang));
  return usable.find((v) => v.default) ?? usable[0] ?? null;
}

/** At most one utterance per `gapMs` (design §3.10: 2.5 s). */
export class SpeechThrottle {
  private last = Number.NEGATIVE_INFINITY;
  private readonly gapMs: number;

  constructor(gapMs = 2500) {
    this.gapMs = gapMs;
  }

  allow(nowMs: number): boolean {
    if (nowMs - this.last < this.gapMs) return false;
    this.last = nowMs;
    return true;
  }
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Whether "Read instructions aloud" can work here: a local en-GB voice exists. */
export function speechAvailable(): boolean {
  const s = synth();
  return s !== null && pickVoice(s.getVoices()) !== null;
}

const throttle = new SpeechThrottle();

/** Speaks a line with a local en-GB voice, at most once per 2.5 s; returns whether it spoke. */
export function speak(text: string, nowMs = performance.now()): boolean {
  const s = synth();
  const voice = s ? pickVoice(s.getVoices()) : null;
  if (!s || !voice || !throttle.allow(nowMs)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = 'en-GB';
  s.cancel();
  s.speak(u);
  return true;
}
