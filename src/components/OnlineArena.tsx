import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ONLINE_REACTIONS, type OnlineReaction } from '../online/online-events';

export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait)');
    const update = () => setPortrait(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return portrait;
}

export async function requestOnlineFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return;
  try {
    if (!document.fullscreenElement) await element.requestFullscreen?.();
    if (document.fullscreenElement === element) {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: string) => Promise<void>;
      };
      await orientation?.lock?.('landscape');
    }
  } catch {
    /* iOS and unsupported browsers use the full-viewport landscape layout. */
  }
}

export function OnlineOrientationGate({ onBack }: { onBack: () => void }) {
  return (
    <section
      className="online-orientation-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-title"
    >
      <span className="rotate-phone" aria-hidden="true">
        ↻
      </span>
      <h1 id="rotate-title">Telefonunu yan çevir</h1>
      <p>Sen solda, arkadaşın sağda. Online oyun yatay ekranda oynanır.</p>
      <small>Başlamış bir turun süresi ekranı çevirirken devam eder.</small>
      <button className="zg-button" onClick={onBack}>
        Ana Menüye Dön
      </button>
    </section>
  );
}

export function OnlineArena({
  active,
  children,
  remote,
  localName,
  remoteName,
  localScore,
  remoteScore,
  gameName,
  remaining,
  pending,
  onBack,
  onFullscreen,
  reaction,
  onReaction,
}: {
  active: boolean;
  children: ReactNode;
  remote: ReactNode;
  localName: string;
  remoteName: string;
  localScore: number;
  remoteScore: number;
  gameName: string;
  remaining: number;
  pending: boolean;
  onBack: () => void;
  onFullscreen: () => void;
  reaction: { value: OnlineReaction; id: number } | null;
  onReaction: (reaction: OnlineReaction) => void;
}) {
  return (
    <section className="online-arena" hidden={!active} aria-label="İki kişilik online oyun alanı">
      <div className="online-local-pane" aria-label="Senin oyun alanın">
        {children}
      </div>
      <div className="online-remote-pane" aria-label="Rakibin kamera görüntüsü">
        {remote}
        {reaction && (
          <span className="remote-reaction" key={reaction.id} role="status" aria-live="polite">
            {reaction.value}
          </span>
        )}
      </div>
      <header className="online-arena-hud">
        <div className="arena-score local">
          <span>SEN · {localName}</span>
          <strong>{localScore}</strong>
        </div>
        <div className="arena-clock">
          <span>{gameName}</span>
          <strong>{remaining} sn</strong>
        </div>
        <div className="arena-score remote">
          <span>RAKİP · {remoteName}</span>
          <strong>{remoteScore}</strong>
        </div>
      </header>
      <nav className="online-arena-actions" aria-label="Oyun kontrolleri">
        <button onClick={onBack}>Odadan ayrıl</button>
        <div className="arena-reactions" aria-label="Rakibe tepki gönder">
          {ONLINE_REACTIONS.map((item) => (
            <button
              key={item}
              onClick={() => onReaction(item)}
              aria-label={`${item} tepkisi gönder`}
            >
              {item}
            </button>
          ))}
        </div>
        <span role="status">{pending ? 'Skor gönderiliyor…' : 'CANLI'}</span>
        <button onClick={onFullscreen}>Tam ekran</button>
      </nav>
    </section>
  );
}

export function RemotePeerVideo({ stream, state }: { stream: MediaStream | null; state: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    setPlayBlocked(false);
    if (stream) void video.play().catch(() => setPlayBlocked(true));
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <aside className={`remote-peer-video ${stream ? 'has-stream' : ''}`}>
      <video ref={videoRef} autoPlay playsInline />
      {(!stream || state !== 'connected') && (
        <small>
          {state === 'failed' || state === 'disconnected'
            ? 'Görüntü bağlantısı kesildi. Oyun ve skorlar devam ediyor.'
            : 'Arkadaşının görüntüsü bekleniyor…'}
        </small>
      )}
      {playBlocked && (
        <button
          onClick={() => {
            void videoRef.current
              ?.play()
              .then(() => setPlayBlocked(false))
              .catch(() => setPlayBlocked(true));
          }}
        >
          Görüntüyü ve sesi aç
        </button>
      )}
    </aside>
  );
}
