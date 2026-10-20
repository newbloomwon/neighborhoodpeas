import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserSpeechSynthesisRenderer,
  BrowserVoiceController,
  Narrator,
  type PreparedBrowserNarration,
  type VoiceCommand,
  type VoiceLocale,
} from "@/src/voice";

export interface BilingualVoiceOptions {
  locale: VoiceLocale;
  /** True when the app voice must stay silent (screen-reader mode), so two voices never talk at once. */
  muted: boolean;
  onCommand: (command: VoiceCommand, locale: VoiceLocale) => void;
  onTranscript?: (transcript: string, locale: VoiceLocale) => void;
  onError: (message: string) => void;
}

// Expected browser noise: our own stop()/cancel() and a silent push-to-talk press.
const BENIGN = /aborted|no-speech|interrupted|canceled/i;

/** React glue for Person D's bilingual voice module (src/voice): push-to-talk in, narration out. */
export function useBilingualVoice(opts: BilingualVoiceOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const narrator = useRef<Narrator<PreparedBrowserNarration> | null>(null);
  const controller = useRef<BrowserVoiceController | null>(null);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);

  useEffect(() => {
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setCanListen(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    if (window.speechSynthesis) narrator.current = new Narrator(new BrowserSpeechSynthesisRenderer());
    return () => {
      narrator.current?.stop();
      controller.current?.stopListening();
    };
  }, []);

  const stopSpeaking = useCallback(() => narrator.current?.stop(), []);

  const speak = useCallback((text: string, locale: VoiceLocale) => {
    if (optsRef.current.muted || !narrator.current || !text.trim()) return;
    narrator.current.stop();
    narrator.current.speak(text, locale).catch((err: Error) => {
      if (!BENIGN.test(err.message)) optsRef.current.onError(err.message);
    });
  }, []);

  useEffect(() => {
    if (opts.muted) stopSpeaking();
  }, [opts.muted, stopSpeaking]);

  const startListening = useCallback(() => {
    // Silence narration first so the mic doesn't hear the app talking.
    stopSpeaking();
    controller.current ??= new BrowserVoiceController({
      onTranscript: (t, l) => optsRef.current.onTranscript?.(t, l),
      onCommand: (c, l) => optsRef.current.onCommand(c, l),
      onError: (err) => {
        if (BENIGN.test(err.message)) return;
        if (!controller.current?.isListening) setListening(false);
        optsRef.current.onError(err.message);
      },
    });
    try {
      controller.current.startListening(optsRef.current.locale);
      setListening(true);
    } catch (err) {
      setListening(false);
      optsRef.current.onError(err instanceof Error ? err.message : String(err));
    }
  }, [stopSpeaking]);

  // Recognition delivers the final transcript after stop(), so releasing push-to-talk still sends the command.
  const stopListening = useCallback(() => {
    controller.current?.stopListening();
    setListening(false);
  }, []);

  return { listening, canListen, startListening, stopListening, speak, stopSpeaking };
}
