import { useState } from 'react';
import type { MiniGame } from '../types';
import { ZeyHeader } from './ZeyHeader';
import { GameIllustration, Mascot } from './ZeyVisuals';
import { OnlineScreen } from './OnlineScreen';

export type MenuScreen = 'menu' | 'games' | 'howto' | 'select' | 'solo-test' | 'online';

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
    <main className="zg-page zg-home">
      <ZeyHeader gameCount={gameCount} />
      <section className="zg-hero">
        <div className="zg-hero-copy">
          <div className="zg-kicker">
            <span className="zg-sticker coral">YENİ!</span> KUMANDASIZ PARTİ OYUNU
          </div>
          <h1>
            Hareket et,
            <br />
            <em>kahkahayı kap!</em>
          </h1>
          <p>Kontrolcü yok. Sadece sen, arkadaşların ve birbirinden komik hareketler var.</p>
        </div>
        <div className="zg-hero-mascot">
          <Mascot mood="hello" />
          <span className="speech">
            Selam!
            <br />
            Hazır mısın?
          </span>
        </div>
      </section>
      <section className="mode-grid" aria-label="Oyun modları">
        <ModeCard
          number="01"
          tone="purple"
          label="YEREL MOD"
          title="AYNI EKRANDA OYNA"
          description="Tek kamera, iki oyuncu, bol rekabet."
          action="Hadi gidelim!"
          disabled={busy}
          onClick={onStartParty}
        >
          <GameIllustration name="Dans Taklidi" />
        </ModeCard>
        <ModeCard
          number="02"
          tone="blue"
          label="UZAKTAN MULTİPLAYER"
          title="ONLINE OYNA"
          description="Oda kur, kodu paylaş, arkadaşınla kapış."
          action="Hadi gidelim!"
          badge="EN HEYECANLI"
          onClick={() => onNavigate('online')}
        >
          <Mascot />
        </ModeCard>
        <ModeCard
          number="03"
          tone="pink"
          label="ANTRENMAN"
          title="TEK KİŞİLİK TEST"
          description="Kameranı dene ve hareketlerini ısıt."
          action="Hadi gidelim!"
          onClick={() => onNavigate('solo-test')}
        >
          <GameIllustration name="Surat Taklidi" />
        </ModeCard>
      </section>
      <div className="home-shortcuts">
        <button onClick={() => onNavigate('select')}>Bir oyun seç</button>
        <button onClick={() => onNavigate('games')}>Oyunları keşfet</button>
        <button onClick={() => onNavigate('howto')}>Nasıl oynanır?</button>
      </div>
      <p className="status" role="alert" aria-live="polite">
        {status}
      </p>
      <section className="feature-strip">
        <div>
          <i className="dot" />
          <strong>Kamera seni görüyor!</strong>
          <span>Takla ve oyna</span>
        </div>
        <div>
          <strong>Kurulum yok</strong>
          <span>Tıkla ve oyna</span>
        </div>
        <div>
          <strong>{gameCount} çılgın oyun</strong>
          <span>Her hareket bir puan</span>
        </div>
      </section>
      <ZeyFooter />
    </main>
  );
}

function ModeCard({
  number,
  tone,
  label,
  title,
  description,
  action,
  badge,
  onClick,
  disabled,
  children,
}: {
  number: string;
  tone: string;
  label: string;
  title: string;
  description: string;
  action: string;
  badge?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`mode-card ${tone}`}
      onClick={onClick}
      disabled={disabled}
      data-action={number === '01' ? 'start' : undefined}
    >
      {badge && <span className="zg-sticker yellow card-badge">{badge}</span>}
      <span className="mode-art">{children}</span>
      <span className="zg-pill">{label}</span>
      <strong>{title}</strong>
      <small>{description}</small>
      <span className="mode-action">{action} →</span>
      <b aria-hidden="true">{number}</b>
    </button>
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
  if (kind === 'online') return <OnlineScreen onBack={onBack} />;
  if (kind === 'howto') return <HowTo gameCount={games.length} onBack={onBack} />;
  return (
    <GameLibrary
      kind={kind}
      games={games}
      status={status}
      busy={busy}
      onBack={onBack}
      onPlay={onPlay}
    />
  );
}

type Category = 'Tümü' | 'Refleks' | 'Fitness' | 'Yüz' | 'Ritim';
const categories: Record<string, Category> = {
  'Buz Kırma': 'Refleks',
  'Meyve Kesme': 'Refleks',
  'Ağızla Yakala': 'Refleks',
  'Çömelme Yarışı': 'Fitness',
  'Zıplama Yarışı': 'Fitness',
  'Ağız Açma Yarışı': 'Yüz',
  'Surat Taklidi': 'Yüz',
  'Dans Taklidi': 'Ritim',
};
const tones: Record<string, string> = {
  'Buz Kırma': 'cyan',
  'Çömelme Yarışı': 'purple',
  'Ağız Açma Yarışı': 'pink',
  'Meyve Kesme': 'orange',
  'Zıplama Yarışı': 'blue',
  'Dans Taklidi': 'green',
  'Surat Taklidi': 'yellow',
  'Ağızla Yakala': 'coral',
};

function GameLibrary({
  kind,
  games,
  status,
  busy,
  onBack,
  onPlay,
}: {
  kind: 'games' | 'select' | 'solo-test';
  games: readonly MiniGame[];
  status: string;
  busy: boolean;
  onBack: () => void;
  onPlay: (index: number, solo: boolean) => void;
}) {
  const [filter, setFilter] = useState<Category>('Tümü');
  const solo = kind === 'solo-test';
  const selectable = kind !== 'games';
  return (
    <main className="zg-page library-page">
      <ZeyHeader onHome={onBack} />
      <section className="library-heading">
        <div>
          <span className="zg-sticker yellow">01 / OYUN KÜTÜPHANESİ</span>
          <h1>
            {solo ? 'Tek Kişilik Test' : kind === 'games' ? 'Oyunları Keşfet' : 'Bir Oyun Seç'}
          </h1>
        </div>
        <p>
          {solo
            ? 'Kameranı hazırla ve bir oyunda tek başına ustalaş.'
            : 'Hazır mısın? Hareket alanını aç ve meydan okumayı seç.'}
        </p>
      </section>
      <div className="filter-pills" aria-label="Oyun kategorileri">
        {(['Tümü', 'Refleks', 'Fitness', 'Yüz', 'Ritim'] as Category[]).map((category) => (
          <button
            key={category}
            className={filter === category ? 'active' : ''}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category}
            {category === 'Tümü' ? ` ${games.length}` : ''}
          </button>
        ))}
      </div>
      <p className="selection-status" role="alert" aria-live="polite">
        {status}
      </p>
      <section className="game-grid">
        {games.map((miniGame, index) => {
          const category = categories[miniGame.name] ?? 'Refleks';
          if (filter !== 'Tümü' && filter !== category) return null;
          return (
            <button
              className={`game-card ${tones[miniGame.name] ?? 'cyan'}`}
              key={miniGame.name}
              data-action={selectable ? 'play-selected' : undefined}
              data-game-index={index}
              data-solo={solo}
              disabled={!selectable || busy}
              aria-label={
                selectable
                  ? `${miniGame.name} — ${solo ? 'Solo Testi Başlat' : 'Bu Oyunu Oyna'}`
                  : undefined
              }
              onClick={() => selectable && onPlay(index, solo)}
            >
              <span className="zg-sticker coral pow">POW!</span>
              <GameIllustration name={miniGame.name} />
              <span className="game-meta">
                <span className="zg-pill">{category}</span>
                <small>{solo ? '1 OYUNCU' : '1–2 OYUNCU'}</small>
              </span>
              <strong>{miniGame.name}</strong>
              <span className="game-description">{miniGame.description.split(/(?<=\.)\s/)[0]}</span>
              <span className="game-action">{selectable ? 'BUNU SEÇ →' : 'DETAYLARI GÖR →'}</span>
            </button>
          );
        })}
      </section>
      <ZeyFooter />
    </main>
  );
}

function HowTo({ gameCount, onBack }: { gameCount: number; onBack: () => void }) {
  return (
    <main className="zg-page howto-page">
      <ZeyHeader onHome={onBack} />
      <section className="simple-heading">
        <span className="zg-sticker yellow">HAZIR, YERLEŞ, OYNA!</span>
        <h1>Nasıl Oynanır?</h1>
        <p>Üç küçük adım, kocaman bir parti.</p>
      </section>
      <div className="steps">
        <article>
          <b>01</b>
          <h2>Cihazı sabitle.</h2>
          <p>Kameranın iki oyuncuyu da gördüğünden emin ol.</p>
        </article>
        <article>
          <b>02</b>
          <h2>Yan yana yerleş.</h2>
          <p>Oyuncu 1 solda, Oyuncu 2 sağda dursun.</p>
        </article>
        <article>
          <b>03</b>
          <h2>Hareket et!</h2>
          <p>{gameCount} oyunda puanları topla ve partiyi kazan.</p>
        </article>
      </div>
      <ZeyFooter />
    </main>
  );
}

function ZeyFooter() {
  return (
    <footer className="zg-footer">
      <strong>ZeyGame</strong>
      <span>Hareketle başlar.</span>
    </footer>
  );
}
