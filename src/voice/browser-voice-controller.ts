import { parseVoiceCommand, type VoiceCommand, type VoiceLocale } from "./commands";

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike extends ArrayLike<RecognitionAlternativeLike> {
  isFinal: boolean;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

export interface BrowserVoiceCallbacks {
  onTranscript?: (transcript: string, locale: VoiceLocale) => void;
  onCommand: (command: VoiceCommand, locale: VoiceLocale) => void;
  onError: (error: Error) => void;
}

export function createBrowserSpeechRecognition(): SpeechRecognitionLike {
  if (typeof window === "undefined") {
    throw new Error("Speech recognition is only available in a browser.");
  }
  const browserWindow = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition =
    browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  if (!Recognition) {
    throw new Error(
      "Speech recognition is not supported in this browser. Use a browser with Web Speech API support.",
    );
  }
  return new Recognition();
}

export class BrowserVoiceController {
  private recognition?: SpeechRecognitionLike;
  private recognitionActive = false;
  private locale: VoiceLocale = "en-US";
  private listening = false;
  private restartTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly callbacks: BrowserVoiceCallbacks,
    private readonly createRecognition: SpeechRecognitionFactory =
      createBrowserSpeechRecognition,
  ) {}

  startListening(locale: VoiceLocale): void {
    this.stopListening();
    this.locale = locale;
    const recognition = this.createRecognition();
    recognition.lang = locale;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.listening = false;
      }
      this.callbacks.onError(
        new Error(event.message || `Speech recognition failed: ${event.error}.`),
      );
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognitionActive = false;
      this.restartAfterEnd(recognition);
    };

    this.recognition = recognition;
    this.listening = true;
    try {
      recognition.start();
      this.recognitionActive = true;
    } catch (error) {
      this.listening = false;
      this.recognition = undefined;
      this.recognitionActive = false;
      throw error;
    }
  }

  stopListening(): void {
    this.listening = false;
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    const recognition = this.recognition;
    this.recognition = undefined;
    if (recognition && this.recognitionActive) {
      this.recognitionActive = false;
      recognition.stop();
    }
  }

  get isListening(): boolean {
    return this.listening;
  }

  private handleResult(event: RecognitionEventLike): void {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) continue;
      const transcript = result[0]?.transcript.trim();
      if (!transcript) continue;
      this.callbacks.onTranscript?.(transcript, this.locale);
      this.callbacks.onCommand(parseVoiceCommand(transcript, this.locale), this.locale);
    }
  }

  private restartAfterEnd(recognition: SpeechRecognitionLike): void {
    if (!this.listening || this.recognition !== recognition) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.listening || this.recognition !== recognition) return;
      try {
        recognition.start();
        this.recognitionActive = true;
      } catch (error) {
        this.listening = false;
        this.recognitionActive = false;
        this.callbacks.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }, 250);
  }
}
