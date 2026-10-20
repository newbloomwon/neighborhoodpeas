import type { VoiceLocale } from "./commands";

export const NARRATION_START_TARGET_MS = 2_000;

export interface NarrationRenderer<PreparedNarration> {
  prepare(text: string, locale: VoiceLocale): Promise<PreparedNarration>;
  play(prepared: PreparedNarration, onStart: () => void): Promise<void>;
  stop(): void;
}

export class NarrationPrefetchCache<PreparedNarration> {
  private readonly entries = new Map<string, Promise<PreparedNarration>>();

  constructor(private readonly capacity = 40) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Narration cache capacity must be a positive integer.");
    }
  }

  getOrPrepare(
    text: string,
    locale: VoiceLocale,
    prepare: () => Promise<PreparedNarration>,
  ): Promise<PreparedNarration> {
    const key = JSON.stringify([locale, text]);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    const pending = prepare();
    this.entries.set(key, pending);
    void pending.catch(() => {
      if (this.entries.get(key) === pending) {
        this.entries.delete(key);
      }
    });
    while (this.entries.size > this.capacity) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface NarrationStartResult {
  startLatencyMs: number;
  metStartTarget: boolean;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class Narrator<PreparedNarration> {
  private readonly cache: NarrationPrefetchCache<PreparedNarration>;

  constructor(
    private readonly renderer: NarrationRenderer<PreparedNarration>,
    cacheCapacity = 40,
  ) {
    this.cache = new NarrationPrefetchCache(cacheCapacity);
  }

  async prefetch(text: string, locale: VoiceLocale): Promise<void> {
    await this.getPrepared(text, locale);
  }

  async speak(text: string, locale: VoiceLocale): Promise<NarrationStartResult> {
    const requestedAt = monotonicNow();
    const prepared = await this.getPrepared(text, locale);
    let startLatencyMs: number | undefined;

    await this.renderer.play(prepared, () => {
      if (startLatencyMs === undefined) {
        startLatencyMs = monotonicNow() - requestedAt;
      }
    });

    if (startLatencyMs === undefined) {
      throw new Error("Narration renderer finished without reporting playback start.");
    }
    return {
      startLatencyMs,
      metStartTarget: startLatencyMs < NARRATION_START_TARGET_MS,
    };
  }

  stop(): void {
    this.renderer.stop();
  }

  clearPrefetchCache(): void {
    this.cache.clear();
  }

  private getPrepared(text: string, locale: VoiceLocale): Promise<PreparedNarration> {
    return this.cache.getOrPrepare(text, locale, () => this.renderer.prepare(text, locale));
  }
}

export interface PreparedBrowserNarration {
  text: string;
  locale: VoiceLocale;
  voice?: SpeechSynthesisVoice;
}

export class BrowserSpeechSynthesisRenderer
  implements NarrationRenderer<PreparedBrowserNarration>
{
  constructor(
    private readonly synthesis: SpeechSynthesis = getSpeechSynthesis(),
    private readonly createUtterance: (text: string) => SpeechSynthesisUtterance =
      (text) => new SpeechSynthesisUtterance(text),
  ) {}

  async prepare(text: string, locale: VoiceLocale): Promise<PreparedBrowserNarration> {
    const language = locale.split("-")[0];
    const voices = this.synthesis.getVoices();
    const voice =
      voices.find((candidate) => candidate.lang.toLowerCase() === locale.toLowerCase())
      ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith(`${language}-`));
    return { text, locale, voice };
  }

  play(prepared: PreparedBrowserNarration, onStart: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = this.createUtterance(prepared.text);
      utterance.lang = prepared.locale;
      if (prepared.voice) utterance.voice = prepared.voice;
      utterance.onstart = onStart;
      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis failed: ${event.error}.`));
      };
      this.synthesis.speak(utterance);
    });
  }

  stop(): void {
    this.synthesis.cancel();
  }
}

function getSpeechSynthesis(): SpeechSynthesis {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error("This browser does not support speech synthesis.");
  }
  return window.speechSynthesis;
}
