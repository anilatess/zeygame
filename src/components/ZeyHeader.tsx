import { ZeyLogo } from './ZeyVisuals';

export function ZeyHeader({ onHome, gameCount }: { onHome?: () => void; gameCount?: number }) {
  return (
    <header className="zg-header">
      <ZeyLogo />
      {onHome ? (
        <button className="zg-button small" data-action="back" onClick={onHome}>
          Ana Menü
        </button>
      ) : (
        <span className="zg-header-note">{gameCount} çılgın oyun</span>
      )}
    </header>
  );
}
