import type { CSSProperties } from 'react';
import type { CaptionWord, Lang } from '../lib/a11yContracts';

/**
 * Color pairs (WCAG AAA requires >= 7:1 for normal text):
 *  - Caption text #FFFFFF on #000000 => 21:1
 *  - Current word  #000000 on #FFD700 => ~14.97:1
 */
export const CAPTION_COLORS = { fg: '#FFFFFF', bg: '#000000', hlFg: '#000000', hlBg: '#FFD700' } as const;

export interface CaptionHUDProps {
  text: string;
  words?: CaptionWord[];
  currentTimeMs?: number;
  lang: Lang;
  reducedMotion?: boolean;
}

const box: CSSProperties = {
  position: 'fixed', left: '50%', bottom: '4vh', transform: 'translateX(-50%)', maxWidth: '90vw',
  background: CAPTION_COLORS.bg, color: CAPTION_COLORS.fg, fontSize: 'clamp(1.75rem, 3.2vw, 2.75rem)',
  lineHeight: 1.4, fontWeight: 700, padding: '0.5em 0.9em', borderRadius: 8,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', zIndex: 1000, pointerEvents: 'none',
};

export function CaptionHUD({ text, words, currentTimeMs, lang, reducedMotion }: CaptionHUDProps) {
  const timed = words && words.length > 0 && typeof currentTimeMs === 'number';
  return (
    <div data-testid="caption-hud" aria-hidden="true" lang={lang} style={box}>
      {timed
        ? words!.map((w, i) => {
            const active = currentTimeMs! >= w.startMs && currentTimeMs! < w.endMs;
            return (
              <span key={i} data-active={active || undefined}
                style={active ? { background: CAPTION_COLORS.hlBg, color: CAPTION_COLORS.hlFg, borderRadius: 4,
                  transition: reducedMotion ? 'none' : 'background 80ms linear' } : undefined}>
                {w.word}{i < words!.length - 1 ? ' ' : ''}
              </span>
            );
          })
        : text}
    </div>
  );
}
