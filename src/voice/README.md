# Bilingual voice module

This framework-independent module owns browser voice input/output, navigation
command parsing, and a bounded cache for narration prepared before playback.
It supports `en-US` and `es-US` and has no package dependencies.

## Basic integration

```ts
import {
  BrowserSpeechSynthesisRenderer,
  BrowserVoiceController,
  Narrator,
  type VoiceLocale,
} from "./voice";

const narrator = new Narrator(new BrowserSpeechSynthesisRenderer());
const voice = new BrowserVoiceController({
  onCommand: (command) => handleWalkCommand(command),
  onError: (error) => announceVoiceError(error),
});

function onBlockDataReady(text: string, locale: VoiceLocale): void {
  void narrator.prefetch(text, locale).catch(announceVoiceError);
}

async function narrateCurrentBlock(text: string, locale: VoiceLocale): Promise<void> {
  const result = await narrator.speak(text, locale);
  if (!result.metStartTarget) {
    reportNarrationLatency(result.startLatencyMs);
  }
}

// Call from a user gesture so the browser can request microphone permission.
voice.startListening("en-US");
```

Call `onBlockDataReady` as soon as the next block's trusted civic data and
narration text are ready. The cache deduplicates concurrent preparation,
separates English and Spanish entries, and evicts least-recently-used entries
when it reaches its default capacity of 40. Preparation and playback errors are
rejected to the caller; they are not silently converted into successful speech.

`BrowserSpeechSynthesisRenderer` uses the browser's installed voices and reports
the actual time until the browser fires its playback-start event. Browser speech
synthesis does not expose rendered audio for pre-generation, and microphone,
voice availability, network conditions, and browser policy vary. Therefore the
native renderer can measure the 2-second demo target but cannot guarantee it.
For a hard latency target, supply a `NarrationRenderer` that pre-renders audio
for each locale and caches the resulting audio asset; the same `Narrator`
measures its start latency.

## Voice input behavior

The browser speech recognizer listens continuously, emits only final transcripts,
parses English and Spanish navigation phrases, and restarts after the browser
ends an utterance. If Web Speech recognition is unavailable or microphone
permission is denied, the error is exposed through `onError`; the app should
offer its keyboard/touch navigation fallback.

Recognized intents include next/previous block, left/right turn (including a
street name when spoken as “turn left on Myrtle” / “gira a la izquierda en
Myrtle”), repeat, pause/resume narration, and start/stop walk. Unmatched speech
is delivered as an `unknown` command with the original transcript.

## Five-block demo check

1. Start listening in English, walk five blocks hands-free, and record each
   `Narrator.speak` result. Repeat in Spanish.
2. Prefetch each upcoming block as soon as its narration text is available.
3. Confirm all five playback-start measurements in each language are below
   `NARRATION_START_TARGET_MS` (2,000 ms); verify the selected browser voice
   speaks the requested locale.
4. Check next/previous, left/right with street names, repeat, pause/resume, and
   stop commands in both languages. Also verify unsupported recognition and
   denied microphone access reach `onError`.
