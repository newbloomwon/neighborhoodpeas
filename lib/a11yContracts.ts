/** Shared event contracts between Person F (accessibility) and other parts. */

/** F -> A (3D walker): movement intents. */
export type WalkDirection = 'next_block' | 'prev_block' | 'turn_left' | 'turn_right';
export interface WalkIntentEvent {
  type: 'walk_intent';
  direction: WalkDirection;
  source: 'keyboard' | 'voice';
  timestamp: number;
}

/** A -> F: emitted by the walker after a move so F can announce it. */
export interface BlockTransitionEvent {
  type: 'block_transition';
  street: string;
  crossFrom: string;
  crossTo: string;
  lang: Lang;
}

export type Lang = 'en' | 'es';

/** Word-level timing for captions. */
export interface CaptionWord { word: string; startMs: number; endMs: number }

/** D (voice/narration) -> F: transcript stream chunks. */
export interface TranscriptChunk {
  type: 'transcript';
  id: string;
  speaker: 'user' | 'agent';
  text: string;
  lang: Lang;
  words?: CaptionWord[];
  /** true when the utterance is complete (not an interim STT result). */
  final: boolean;
}

/** F -> D: push-to-talk lifecycle. */
export interface PushToTalkEvent { type: 'ptt_start' | 'ptt_end'; timestamp: number }

/** F -> D: TTS volume policy (0 = muted, 1 = full). Driven by screen-reader mode. */
export interface TtsPolicyEvent { type: 'tts_policy'; volume: number; reason: 'sr_mode' | 'default' }

/** F -> E (Glass Box panel). */
export interface GlassBoxToggleEvent { type: 'glass_box_toggle'; focus: boolean }

/** F -> report exporter. */
export interface ExportReportEvent { type: 'export_report' }

export type PersonFOutboundEvent =
  | WalkIntentEvent | PushToTalkEvent | TtsPolicyEvent | GlassBoxToggleEvent | ExportReportEvent;
