import { useCallback, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { WalkDirection } from '../lib/a11yContracts';
import { useReducedMotion } from './useReducedMotion';

export interface AccessibleControlsCallbacks {
  onWalk: (direction: WalkDirection) => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onExportReport: () => void;
  onToggleGlassBox: () => void;
  onEscape: () => void;
  /** Optional: called when help is toggled (H or ?). */
  onHelp?: (open: boolean) => void;
  enabled?: boolean;
}

export interface Shortcut { keys: string; label: string }
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Arrow Up', label: 'Walk to next block' },
  { keys: 'Arrow Down', label: 'Walk to previous block' },
  { keys: 'Arrow Left', label: 'Turn left' },
  { keys: 'Arrow Right', label: 'Turn right' },
  { keys: 'Space (hold)', label: 'Push to talk' },
  { keys: 'R', label: 'Export council report' },
  { keys: 'G', label: 'Toggle / focus Glass Box panel' },
  { keys: 'Escape', label: 'Cancel / close' },
  { keys: 'H or ?', label: 'Show keyboard shortcuts' },
];

/** True when the event target is a text-entry context we must not hijack. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // jsdom doesn't implement isContentEditable; check the attribute chain too.
  const ce = target.closest('[contenteditable]');
  if (ce && ce.getAttribute('contenteditable') !== 'false') return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(type);
  }
  return target.getAttribute('role') === 'textbox';
}

/** True when Space should activate the focused control (button, link, checkbox, tab…) rather than push-to-talk. */
export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('button, a[href], summary, input, select, textarea, label')) return true;
  return !!target.closest('[role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="link"], [role="menuitem"], [role="radio"]');
}

export function useAccessibleControls(cb: AccessibleControlsCallbacks) {
  const enabled = cb.enabled ?? true;
  const reducedMotion = useReducedMotion();
  const [helpOpen, setHelpOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const talkingRef = useRef(false);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const opts = { enabled, preventDefault: true, enableOnFormTags: false, enableOnContentEditable: false } as const;
  const guard = (fn: () => void) => (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.repeat) return;
    fn();
  };

  useHotkeys('up', guard(() => cbRef.current.onWalk('next_block')), opts);
  useHotkeys('down', guard(() => cbRef.current.onWalk('prev_block')), opts);
  useHotkeys('left', guard(() => cbRef.current.onWalk('turn_left')), opts);
  useHotkeys('right', guard(() => cbRef.current.onWalk('turn_right')), opts);
  useHotkeys('r', guard(() => cbRef.current.onExportReport()), opts);
  useHotkeys('g', guard(() => cbRef.current.onToggleGlassBox()), opts);
  useHotkeys('h, shift+slash, shift+/', guard(() => setHelpOpen((o) => { cbRef.current.onHelp?.(!o); return !o; })), opts);
  useHotkeys('esc', guard(() => {
    if (talkingRef.current) { talkingRef.current = false; setTalking(false); cbRef.current.onPushToTalkEnd(); }
    setHelpOpen((o) => { if (o) cbRef.current.onHelp?.(false); return false; });
    cbRef.current.onEscape();
  }), opts);

  // Push-to-talk: start on keydown, end on keyup. preventDefault stops page scroll.
  // Space on a focused button/checkbox/tab keeps its native meaning (activate), so it is not hijacked.
  useHotkeys('space', (e) => {
    if (e.type === 'keydown' && (isTypingTarget(e.target) || isActivatableTarget(e.target))) return;
    if (e.type === 'keydown' && !talkingRef.current) {
      talkingRef.current = true; setTalking(true); cbRef.current.onPushToTalkStart();
    } else if (e.type === 'keyup' && talkingRef.current) {
      talkingRef.current = false; setTalking(false); cbRef.current.onPushToTalkEnd();
    }
  }, { ...opts, keydown: true, keyup: true,
    preventDefault: (e) => talkingRef.current || !(isTypingTarget(e.target) || isActivatableTarget(e.target)) });

  const closeHelp = useCallback(() => setHelpOpen(false), []);
  return { reducedMotion, helpOpen, closeHelp, talking, shortcuts: SHORTCUTS };
}
