/// <reference types="vitest/globals" />
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useAccessibleControls, type AccessibleControlsCallbacks } from '../../hooks/useAccessibleControls';
import { CaptionHUD, CAPTION_COLORS } from '../../components/CaptionHUD';
import { contrastRatio } from '../../components/contrast';
import { AnnouncerProvider, useAnnouncer, formatBlockTransition } from '../../components/ScreenReaderAnnouncer';
import Demo from '../../examples/PersonFDemo';

afterEach(cleanup);

function mocks(): AccessibleControlsCallbacks {
  return { onWalk: vi.fn(), onPushToTalkStart: vi.fn(), onPushToTalkEnd: vi.fn(), onExportReport: vi.fn(),
    onToggleGlassBox: vi.fn(), onEscape: vi.fn() };
}
function Harness(p: AccessibleControlsCallbacks) {
  const { helpOpen } = useAccessibleControls(p);
  return <div><input aria-label="field" /><textarea aria-label="area" />
    <div contentEditable suppressContentEditableWarning aria-label="ce" role="textbox">x</div>
    {helpOpen && <p>help open</p>}</div>;
}

describe('useAccessibleControls', () => {
  it('fires the right callbacks', async () => {
    const m = mocks(); const u = userEvent.setup(); render(<Harness {...m} />);
    await u.keyboard('{ArrowUp}{ArrowDown}{ArrowLeft}{ArrowRight}');
    expect((m.onWalk as any).mock.calls.map((c: any[]) => c[0])).toEqual(['next_block', 'prev_block', 'turn_left', 'turn_right']);
    await u.keyboard('r'); expect(m.onExportReport).toHaveBeenCalledTimes(1);
    await u.keyboard('g'); expect(m.onToggleGlassBox).toHaveBeenCalledTimes(1);
    await u.keyboard('h'); expect(screen.getByText('help open')).toBeTruthy();
    await u.keyboard('{Escape}'); expect(m.onEscape).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('help open')).toBeNull();
  });
  it('push-to-talk: start on keydown, end on keyup, prevents scroll', async () => {
    const m = mocks(); const u = userEvent.setup(); render(<Harness {...m} />);
    let prevented = false;
    document.addEventListener('keydown', (e) => { if (e.code === 'Space') queueMicrotask(() => { prevented = e.defaultPrevented; }); });
    await u.keyboard('[Space>]');
    expect(m.onPushToTalkStart).toHaveBeenCalledTimes(1); expect(m.onPushToTalkEnd).not.toHaveBeenCalled();
    await u.keyboard('[/Space]');
    expect(m.onPushToTalkEnd).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });
  it('ignores keys while typing in input/textarea/contenteditable', async () => {
    const m = mocks(); const u = userEvent.setup(); render(<Harness {...m} />);
    for (const name of ['field', 'area', 'ce']) {
      await u.click(screen.getByLabelText(name));
      await u.keyboard('{ArrowUp}rg [Space>][/Space]');
    }
    expect(m.onWalk).not.toHaveBeenCalled(); expect(m.onExportReport).not.toHaveBeenCalled();
    expect(m.onToggleGlassBox).not.toHaveBeenCalled(); expect(m.onPushToTalkStart).not.toHaveBeenCalled();
  });
});

describe('CaptionHUD', () => {
  it('meets AAA contrast, sets lang, aria-hidden, highlights current word', () => {
    expect(contrastRatio(CAPTION_COLORS.fg, CAPTION_COLORS.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(CAPTION_COLORS.hlFg, CAPTION_COLORS.hlBg)).toBeGreaterThanOrEqual(7);
    render(<CaptionHUD lang="es" text="Hola mundo" currentTimeMs={600}
      words={[{ word: 'Hola', startMs: 0, endMs: 500 }, { word: 'mundo', startMs: 500, endMs: 900 }]} />);
    const hud = screen.getByTestId('caption-hud');
    expect(hud.getAttribute('lang')).toBe('es'); expect(hud.getAttribute('aria-hidden')).toBe('true');
    expect(hud.querySelector('[data-active]')?.textContent).toBe('mundo');
  });
});

describe('Announcer', () => {
  it('writes polite and assertive messages to live regions', async () => {
    let api: ReturnType<typeof useAnnouncer> | undefined;
    const Grab = () => { api = useAnnouncer(); return null; };
    render(<AnnouncerProvider><Grab /></AnnouncerProvider>);
    const msg = formatBlockTransition('Knickerbocker Avenue', 'Stockholm', 'Myrtle');
    expect(msg).toBe('Now on Knickerbocker Avenue between Stockholm and Myrtle');
    api!.announce(msg); api!.announce('Report exported', 'assertive');
    await waitFor(() => {
      const polite = Array.from(document.querySelectorAll('[aria-live="polite"]')).map((n) => n.textContent).join();
      const assertive = Array.from(document.querySelectorAll('[aria-live="assertive"]')).map((n) => n.textContent).join();
      expect(polite).toContain(msg); expect(assertive).toContain('Report exported');
    });
  });
  it('SR mode mutes app TTS', async () => {
    const u = userEvent.setup(); render(<Demo />);
    expect(screen.getByText(/TTS volume: 1/)).toBeTruthy();
    await u.click(screen.getByLabelText(/Screen reader mode/));
    expect(screen.getByText(/TTS volume: 0/)).toBeTruthy();
  });
});

describe('axe', () => {
  it('demo has zero violations', async () => {
    const { container } = render(<Demo />);
    await userEvent.setup().keyboard('h');
    const res = await axe.run(container, { rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});
