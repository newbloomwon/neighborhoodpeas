import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { announce as ariaAnnounce } from '@react-aria/live-announcer';
import type { Lang } from '../lib/a11yContracts';

export type Priority = 'polite' | 'assertive';
export interface AnnouncerValue {
  announce: (msg: string, priority?: Priority) => void;
  srMode: boolean;
  setSrMode: (on: boolean) => void;
  /** Volume the app's TTS should use: 0 when SR mode is on (avoids dual-voice collision). */
  ttsVolume: number;
  ttsMuted: boolean;
}

const Ctx = createContext<AnnouncerValue | null>(null);

export function AnnouncerProvider({ children, initialSrMode = false, duckVolume = 0,
  onTtsPolicyChange }: { children: ReactNode; initialSrMode?: boolean; duckVolume?: number;
  onTtsPolicyChange?: (volume: number) => void }) {
  const [srMode, setSrMode] = useState(initialSrMode);
  const announce = useCallback((msg: string, priority: Priority = 'polite') => ariaAnnounce(msg, priority), []);
  const ttsVolume = srMode ? duckVolume : 1;
  useEffect(() => { onTtsPolicyChange?.(ttsVolume); }, [ttsVolume, onTtsPolicyChange]);
  const value = useMemo(() => ({ announce, srMode, setSrMode, ttsVolume, ttsMuted: ttsVolume === 0 }),
    [announce, srMode, ttsVolume]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnnouncer(): AnnouncerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnnouncer must be used inside <AnnouncerProvider>');
  return v;
}

export function formatBlockTransition(street: string, from: string, to: string, lang: Lang = 'en'): string {
  return lang === 'es' ? `Ahora en ${street} entre ${from} y ${to}` : `Now on ${street} between ${from} and ${to}`;
}

export function ScreenReaderModeToggle() {
  const { srMode, setSrMode, announce } = useAnnouncer();
  return (
    <label>
      <input type="checkbox" checked={srMode} onChange={(e) => {
        setSrMode(e.target.checked);
        announce(e.target.checked ? 'Screen reader mode on. App voice muted.' : 'Screen reader mode off.', 'assertive');
      }} />
      {' '}Screen reader mode (mutes app voice)
    </label>
  );
}
