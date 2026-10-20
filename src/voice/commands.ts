export type VoiceLocale = "en-US" | "es-US";

export type VoiceCommand =
  | { type: "next-block" }
  | { type: "previous-block" }
  | { type: "turn-left"; streetName?: string }
  | { type: "turn-right"; streetName?: string }
  | { type: "repeat-narration" }
  | { type: "pause-narration" }
  | { type: "resume-narration" }
  | { type: "start-walk" }
  | { type: "stop-walk" }
  | { type: "unknown"; transcript: string };

function normalizeTranscript(transcript: string): string {
  return transcript
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetNameFrom(transcript: string, locale: VoiceLocale): string | undefined {
  const match =
    locale === "es-US"
      ? transcript.match(/(?:\ben\b|\bpor\b)\s+(.+?)\s*$/i)
      : transcript.match(/(?:\bon\b|\bonto\b)\s+(.+?)\s*$/i);
  const streetName = match?.[1]?.trim().replace(/[.,!?]+$/g, "");
  return streetName || undefined;
}

export function parseVoiceCommand(
  transcript: string,
  locale: VoiceLocale = "en-US",
): VoiceCommand {
  const text = normalizeTranscript(transcript);

  if (/\b(next block|next street|go forward|move forward|advance)\b/.test(text)
    || /\b(siguiente cuadra|proxima cuadra|siguiente calle|avanza|avanzar)\b/.test(text)) {
    return { type: "next-block" };
  }
  if (/\b(previous block|previous street|go back|move back|back up)\b/.test(text)
    || /\b(cuadra anterior|calle anterior|bloque anterior|vuelve|retrocede)\b/.test(text)) {
    return { type: "previous-block" };
  }
  if (/\b(turn left|left turn|go left)\b/.test(text)
    || /\b(gira a la izquierda|dobla a la izquierda|izquierda)\b/.test(text)) {
    return { type: "turn-left", streetName: streetNameFrom(transcript, locale) };
  }
  if (/\b(turn right|right turn|go right)\b/.test(text)
    || /\b(gira a la derecha|dobla a la derecha|derecha)\b/.test(text)) {
    return { type: "turn-right", streetName: streetNameFrom(transcript, locale) };
  }
  if (/\b(repeat|say that again|repeat narration)\b/.test(text)
    || /\b(repite|repitelo|dilo otra vez|repetir)\b/.test(text)) {
    return { type: "repeat-narration" };
  }
  if (/\b(pause|be quiet|silence)\b/.test(text)
    || /\b(pausa|callate|silencio)\b/.test(text)) {
    return { type: "pause-narration" };
  }
  if (/\b(resume|continue narration|keep going)\b/.test(text)
    || /\b(continua|reanuda|sigue)\b/.test(text)) {
    return { type: "resume-narration" };
  }
  if (/\b(start walking|start the walk|begin walking|start walk)\b/.test(text)
    || /\b(empezar a caminar|comienza a caminar|iniciar recorrido|inicia el recorrido)\b/.test(text)) {
    return { type: "start-walk" };
  }
  if (/\b(stop walking|end the walk|stop walk|end walk)\b/.test(text)
    || /\b(deja de caminar|termina el recorrido|deten el recorrido|para el recorrido)\b/.test(text)) {
    return { type: "stop-walk" };
  }

  return { type: "unknown", transcript };
}
