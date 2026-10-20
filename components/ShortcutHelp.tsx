import type { Shortcut } from '../hooks/useAccessibleControls';
export function ShortcutHelp({ open, shortcuts }: { open: boolean; shortcuts: readonly Shortcut[] }) {
  if (!open) return null;
  return (
    <section role="dialog" aria-modal="false" aria-labelledby="kbd-help-title"
      style={{ background: '#000', color: '#fff', padding: 16, border: '2px solid #fff' }}>
      <h2 id="kbd-help-title">Keyboard shortcuts</h2>
      <table>
        <thead><tr><th scope="col">Key</th><th scope="col">Action</th></tr></thead>
        <tbody>{shortcuts.map((s) => <tr key={s.keys}><td><kbd>{s.keys}</kbd></td><td>{s.label}</td></tr>)}</tbody>
      </table>
      <p>Press Escape to close.</p>
    </section>
  );
}
