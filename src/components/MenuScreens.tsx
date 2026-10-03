import type { MiniGame } from '../types';

export type MenuScreen = 'menu' | 'games' | 'howto' | 'select' | 'solo-test';

const illustrations: Record<string, string> = {
  'Buz Kırma':
    '<path d="m32 20 28-10 28 18-28 12Z M32 20v42l28 22 28-16V28 M60 40v44 M48 28l8 16-10 12 12 12"/>',
  'Meyve Kesme':
    '<path d="M61 28q-8-18 13-20 M62 28q-27-13-35 17t26 37q7-5 14 0 31-9 25-37T62 28Z M16 78l82-60"/>',
  'Çömelme Yarışı':
    '<circle cx="58" cy="22" r="10"/><path d="m55 36-18 18 24 8-15 22 M55 36l16 22 18-5 M61 62l18 20 M18 88h78"/>',
  'Zıplama Yarışı':
    '<circle cx="60" cy="20" r="10"/><path d="M60 34v24 M60 39 34 24 M60 39l25-17 M60 58 39 75 M60 58l24 14 M25 93l5-9 M60 96v-12 M94 93l-5-9"/>',
  'Dans Taklidi':
    '<circle cx="60" cy="20" r="10"/><path d="m60 34-7 26 24 23 M56 46 30 36 20 17 M56 46l26-12 15 9 M53 60 35 83 M93 15v13 M93 15l10-3"/>',
  'Ağız Açma Yarışı':
    '<rect x="28" y="12" width="64" height="80" rx="28"/><path d="M43 36h3 M74 36h3"/><ellipse cx="60" cy="65" rx="13" ry="18"/>',
  'Surat Taklidi':
    '<rect x="23" y="15" width="74" height="76" rx="30"/><path d="m37 38 12-5 M72 33l12 5 M38 49h9 M73 49h9 M42 64q18 24 36 0"/>',
  'Ağızla Yakala':
    '<path d="M25 61q35-30 70 0-35 49-70 0Z M39 62h42 M60 40V23 M50 32l10 10 10-10"/><circle cx="60" cy="12" r="7"/>',
};

export function MainMenu({
  gameCount,
  status,
  busy,
  onNavigate,
  onStartParty,
}: {
  gameCount: number;
  status: string;
  busy: boolean;
  onNavigate: (screen: MenuScreen) => void;
  onStartParty: () => void;
}) {
  return (
    <div className="menu-card">
      <header className="menu-top">
        <span className="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</span>
        <span className="game-count">{gameCount} mini oyun</span>
      </header>
      <div className="menu-home">
        <div className="hero-copy">
          <h1>
            Zey<span>Game</span>
            <i aria-hidden="true">✦</i>
          </h1>
          <h2>
            Kamera açık, <br />
            rekabet başlasın!
          </h2>
          <p>Yan yana gelin, hareketlerinizle yarışın.</p>
          <div className="menu-actions">
            <button className="primary" data-action="start" disabled={busy} onClick={onStartParty}>
              Partiyi Başlat ↗
            </button>
            <button data-action="select" onClick={() => onNavigate('select')}>
              Oyun Seç
            </button>
            <button data-action="solo-test" onClick={() => onNavigate('solo-test')}>
              Tek Kişilik Test
            </button>
            <button data-action="games" onClick={() => onNavigate('games')}>
              Oyunları Keşfet
            </button>
            <button data-action="howto" onClick={() => onNavigate('howto')}>
              Nasıl Oynanır?
            </button>
          </div>
          <p className="status" role="alert" aria-live="polite">
            {status}
          </p>
        </div>
        <div className="party-art">
          <div className="art-caption">AYNI KAMERA. İKİ RAKİP.</div>
          <div className="players">
            <div className="player blue">
              <div className="avatar" aria-hidden="true">
                <span />
              </div>
              <strong>Oyuncu 1</strong>
              <small>Sol tarafta</small>
            </div>
            <span className="versus" aria-hidden="true">
              VS
            </span>
            <div className="player pink">
              <div className="avatar" aria-hidden="true">
                <span />
              </div>
              <strong>Oyuncu 2</strong>
              <small>Sağ tarafta</small>
            </div>
          </div>
          <div className="art-footer">✦ Hareket sende, parti burada!</div>
        </div>
      </div>
      <footer className="menu-footer">
        2 oyuncu <span>•</span> 1 kamera <span>•</span> Bol rekabet
      </footer>
    </div>
  );
}

export function InfoScreen({
  kind,
  games,
  status,
  busy,
  onBack,
  onPlay,
}: {
  kind: Exclude<MenuScreen, 'menu'>;
  games: readonly MiniGame[];
  status: string;
  busy: boolean;
  onBack: () => void;
  onPlay: (index: number, solo: boolean) => void;
}) {
  if (kind === 'howto') return <HowTo gameCount={games.length} onBack={onBack} />;
  const selectable = kind === 'select' || kind === 'solo-test';
  const solo = kind === 'solo-test';
  const heading = solo
    ? [
        'GELİŞTİRİCİ MODU',
        'Tek Kişilik Test',
        'Bir mini oyun seç; kamera yalnızca seni Player 1 olarak izlesin.',
      ]
    : kind === 'select'
      ? ['İKİ KİŞİ, TEK MEYDAN OKUMA', 'Oyun Seç', 'Bir oyun seçin, yan yana yarışın.']
      : [
          'PARTİDE NELER VAR?',
          'Oyunları Keşfet',
          'Her tur yeni bir meydan okuma. Hepsi aynı partide!',
        ];
  const labels = selectable
    ? { hands: 'El', pose: 'Vücut', face: 'Yüz' }
    : { hands: 'El hareketleri', pose: 'Vücut hareketleri', face: 'Yüz ifadeleri' };
  return (
    <div className="menu-card">
      <MenuHeader gameCount={games.length} />
      <section className="info-panel" aria-labelledby="info-title">
        <button data-action="back" onClick={onBack}>
          ← Ana Menü
        </button>
        <div className="info-content">
          <div className="section-heading">
            <div className="eyebrow">{heading[0]}</div>
            <h2 id="info-title" tabIndex={-1}>
              {heading[1]}
            </h2>
            <p>{heading[2]}</p>
          </div>
          {selectable && (
            <p className="selection-status" role="alert" aria-live="polite">
              {status}
            </p>
          )}
          <div className="game-grid">
            {games.map((miniGame, index) => (
              <article className={`game-card ${miniGame.tracking}`} key={miniGame.name}>
                <Illustration name={miniGame.name} />
                <span className="tracking-label">
                  {labels[miniGame.needs ?? miniGame.tracking]}
                </span>
                <h3>{miniGame.name}</h3>
                <p>{miniGame.description.split(/(?<=\.)\s/)[0]}</p>
                {selectable && (
                  <button
                    data-action="play-selected"
                    data-game-index={index}
                    data-solo={solo}
                    disabled={busy}
                    aria-label={`${miniGame.name} — ${solo ? 'Solo Testi Başlat' : 'Bu Oyunu Oyna'}`}
                    onClick={() => onPlay(index, solo)}
                  >
                    {solo ? 'Solo Testi Başlat' : 'Bu Oyunu Oyna'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      <MenuFooter />
    </div>
  );
}

function HowTo({ gameCount, onBack }: { gameCount: number; onBack: () => void }) {
  return (
    <div className="menu-card">
      <MenuHeader gameCount={gameCount} />
      <section className="info-panel" aria-labelledby="info-title">
        <button data-action="back" onClick={onBack}>
          ← Ana Menü
        </button>
        <div className="info-content">
          <div className="section-heading">
            <div className="eyebrow">HAZIR, YERLEŞ, OYNA!</div>
            <h2 id="info-title" tabIndex={-1}>
              Nasıl Oynanır?
            </h2>
            <p>Üç küçük adım, kocaman bir parti.</p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <svg viewBox="0 0 120 104" aria-hidden="true">
                <rect x="32" y="10" width="56" height="68" rx="8" />
                <path d="M60 78v16 M36 94h48 M48 20h24" />
              </svg>
              <h3>Cihazı sabitle.</h3>
            </article>
            <article>
              <span className="step-number">02</span>
              <Illustration name="Surat Taklidi" />
              <h3>İki kişi kameraya yerleş.</h3>
              <p>
                <span className="blue-text">Oyuncu 1 solda</span>
                <br />
                <span className="pink-text">Oyuncu 2 sağda</span>
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <Illustration name="Dans Taklidi" />
              <h3>Hareket et, puanları topla.</h3>
            </article>
          </div>
          <div className="tips">
            <p>☀ İyi aydınlatılmış bir ortam kullan.</p>
            <p>↔ Vücut oyunları için çevrende yeterli hareket alanı bırak.</p>
          </div>
        </div>
      </section>
      <MenuFooter />
    </div>
  );
}

function MenuHeader({ gameCount }: { gameCount: number }) {
  return (
    <header className="menu-top">
      <span className="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</span>
      <span className="game-count">{gameCount} mini oyun</span>
    </header>
  );
}

function MenuFooter() {
  return (
    <footer className="menu-footer">
      2 oyuncu <span>•</span> 1 kamera <span>•</span> Bol rekabet
    </footer>
  );
}

function Illustration({ name }: { name: string }) {
  return (
    <div className="game-illustration">
      <svg
        viewBox="0 0 120 104"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: illustrations[name] ?? '' }}
      />
    </div>
  );
}
