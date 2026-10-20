# Person F — Universal Accessibility (NYC Map Agent)

Standalone package: React 18 + TypeScript strict. `npm install && npm run typecheck && npm test`.

## Controls
| Key | Action | Callback |
|---|---|---|
| Arrow Up | Next block | `onWalk('next_block')` |
| Arrow Down | Previous block | `onWalk('prev_block')` |
| Arrow Left / Right | Turn left / right | `onWalk('turn_left' / 'turn_right')` |
| Space (hold) | Push-to-talk: start on keydown, stop on keyup (page scroll prevented) | `onPushToTalkStart` / `onPushToTalkEnd` |
| R | Export council report | `onExportReport` |
| G | Toggle / focus Glass Box | `onToggleGlassBox` |
| Escape | Cancel / close (also ends PTT, closes help) | `onEscape` |
| H or ? | Toggle shortcut help (`<ShortcutHelp>`) | `onHelp?` |

Keys are ignored inside inputs, textareas, selects, `role="textbox"` and contenteditable; key auto-repeat is ignored.
`useAccessibleControls` returns `{ reducedMotion, helpOpen, closeHelp, talking, shortcuts }`; `useReducedMotion()` is exported too.

## Captions (`CaptionHUD`)
Always-on, `aria-hidden="true"` (screen readers get the announcer instead — no double reading), `lang` = `en|es`, 1.75–2.75rem bold.
Colors: **#FFFFFF on #000000 = 21:1**; current-word highlight **#000000 on #FFD700 ≈ 14.97:1** (both ≥ 7:1 WCAG AAA; verified in tests via `contrastRatio`).
Highlights the word whose `[startMs,endMs)` contains `currentTimeMs`.

## Announcer
Wrap the app in `<AnnouncerProvider onTtsPolicyChange={v => tts.setVolume(v)}>`. `useAnnouncer()` → `{ announce(msg, 'polite'|'assertive'), srMode, setSrMode, ttsVolume, ttsMuted }`.
When SR mode is on, `ttsVolume` = `duckVolume` (default 0 = muted). `<ScreenReaderModeToggle/>` is a ready checkbox. `formatBlockTransition(street, from, to, lang)` → "Now on Knickerbocker Avenue between Stockholm and Myrtle".

## Integration (contracts in `types/contracts.ts`)
- **Person A (walker):** pass A's move function as `onWalk` (`WalkDirection`). After moving, A emits `BlockTransitionEvent`; call `announce(formatBlockTransition(...))`. A should read `reducedMotion` to skip camera tweens/fly-throughs.
- **Person D (voice):** wire `onPushToTalkStart/End` to STT start/stop (`PushToTalkEvent`). Feed `TranscriptChunk` (text, lang, words) into `CaptionHUD` with the audio clock as `currentTimeMs`; announce final agent chunks politely. D's TTS must obey `ttsVolume` (`TtsPolicyEvent`).
- **Person E (Glass Box):** `onToggleGlassBox` → `GlassBoxToggleEvent`; E's panel should have `tabIndex={-1}` and an id so F can move focus into it; Escape should return focus.

## Dependencies (exact pins)
| Package | Version | License | Why |
|---|---|---|---|
| react-hotkeys-hook | 4.6.2 | MIT | Mature key-binding hook; supports keydown+keyup (needed for hold-to-talk), form-tag filtering, preventDefault. Chosen over tinykeys because tinykeys has no keyup support. |
| @react-aria/live-announcer | 3.5.1 | Apache-2.0 | Adobe's battle-tested polite/assertive live regions. |
| react / react-dom | 18.3.1 | MIT | dev/peer |
| typescript | 5.6.3 | Apache-2.0 | dev |
| vitest | 2.1.9 | MIT | dev test runner |
| jsdom | 25.0.1 | MIT | dev DOM |
| @testing-library/react / dom / user-event | 16.0.1 / 10.4.0 / 14.5.2 | MIT | dev |
| axe-core | 4.10.2 | MPL-2.0 | dev-only a11y audit (used directly; jest-axe/vitest-axe are thin wrappers over it). MPL is weak copyleft, file-level, dev-only — not shipped. |
| @types/react / @types/react-dom | 18.3.12 / 18.3.1 | MIT | dev |

focus-trap-react was not needed: help is a non-modal dialog closed with Escape.
Note: axe `color-contrast` is disabled in jsdom (no canvas/layout); contrast is asserted numerically instead.

## Layout in this repo
`hooks/useAccessibleControls.ts`, `hooks/useReducedMotion.ts`, `components/{CaptionHUD,ScreenReaderAnnouncer,ShortcutHelp}.tsx`, `components/contrast.ts`, `lib/a11yContracts.ts`, `examples/PersonFDemo.tsx`, `tests/person-f/a11y.test.tsx`.
The repo has no root package.json yet, so Person F's exact-pinned deps are recorded in `person-f.package.json`; merge them into the app's package.json when it lands. The standalone package with vitest/tsconfig also ships as `person-f.zip`.
