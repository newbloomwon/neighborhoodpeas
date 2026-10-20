'use client';
import { useState } from 'react';
import { useAccessibleControls } from '../hooks/useAccessibleControls';
import { CaptionHUD } from '../components/CaptionHUD';
import { AnnouncerProvider, ScreenReaderModeToggle, formatBlockTransition, useAnnouncer } from '../components/ScreenReaderAnnouncer';
import { ShortcutHelp } from '../components/ShortcutHelp';
import type { Lang, WalkDirection } from '../lib/a11yContracts';

const BLOCKS = [['Knickerbocker Avenue', 'Stockholm Street', 'Myrtle Avenue'], ['Knickerbocker Avenue', 'Myrtle Avenue', 'Gates Avenue']] as const;

function Inner() {
  const { announce, ttsVolume } = useAnnouncer();
  const [i, setI] = useState(0);
  const [lang, setLang] = useState<Lang>('en');
  const [log, setLog] = useState<string[]>([]);
  const [glass, setGlass] = useState(false);
  const push = (s: string) => setLog((l) => [s, ...l].slice(0, 6));
  const onWalk = (d: WalkDirection) => {
    push(`walk:${d}`);
    if (d === 'next_block' || d === 'prev_block') {
      const n = Math.max(0, Math.min(BLOCKS.length - 1, i + (d === 'next_block' ? 1 : -1)));
      setI(n); const b = BLOCKS[n]!; announce(formatBlockTransition(b[0], b[1], b[2], lang));
    } else announce(d === 'turn_left' ? 'Turned left' : 'Turned right');
  };
  const { helpOpen, shortcuts, talking, reducedMotion } = useAccessibleControls({
    onWalk, onPushToTalkStart: () => push('ptt start'), onPushToTalkEnd: () => push('ptt end'),
    onExportReport: () => { push('export'); announce('Exporting council report', 'assertive'); },
    onToggleGlassBox: () => { setGlass((g) => !g); document.getElementById('glass-box')?.focus(); },
    onEscape: () => push('escape'),
  });
  const b = BLOCKS[i]!;
  return (
    <main>
      <h1>NYC Map Agent — accessibility demo</h1>
      <ScreenReaderModeToggle />
      <p>TTS volume: {ttsVolume} · {talking ? 'Listening…' : 'Hold Space to talk'} · reduced motion: {String(reducedMotion)}</p>
      <button type="button" onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>Caption language: {lang}</button>
      <label>Search <input type="text" /></label>
      <section id="glass-box" tabIndex={-1} aria-label="Glass Box" hidden={!glass}>Glass Box panel</section>
      <ShortcutHelp open={helpOpen} shortcuts={shortcuts} />
      <ul aria-label="Event log">{log.map((l, k) => <li key={k}>{l}</li>)}</ul>
      <CaptionHUD lang={lang} text={formatBlockTransition(b[0], b[1], b[2], lang)} reducedMotion={reducedMotion} />
    </main>
  );
}

export default function Demo() { return <AnnouncerProvider><Inner /></AnnouncerProvider>; }
