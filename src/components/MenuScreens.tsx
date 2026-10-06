import { useState } from 'react';
import type { MiniGame } from '../types';
import { ZeyHeader } from './ZeyHeader';
import { GameIllustration, Mascot } from './ZeyVisuals';
import { OnlineScreen } from './OnlineScreen';
import {
  AVATARS,
  dailyProgress,
  profileAchievements,
  unlockedAvatars,
  type OnlineMatchResult,
  type PlayerProfile,
} from '../profile-store';

export type MenuScreen = 'menu' | 'games' | 'howto' | 'select' | 'solo-test' | 'online' | 'profile';

export function MainMenu({
  gameCount,
  status,
  busy,
  onNavigate,
  onStartParty,
  profile,
}: {
  gameCount: number;
  status: string;
  busy: boolean;
  onNavigate: (screen: MenuScreen) => void;
  onStartParty: () => void;
  profile: PlayerProfile;
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
        <button className="profile-shortcut" onClick={() => onNavigate('profile')}>
          <span>{profile.avatar}</span>
          {profile.displayName || 'Profilim'} · {profile.stats.wins} galibiyet
        </button>
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
  profile,
  onProfileChange,
  onOnlineMatchComplete,
}: {
  kind: Exclude<MenuScreen, 'menu'>;
  games: readonly MiniGame[];
  status: string;
  busy: boolean;
  onBack: () => void;
  onPlay: (index: number, solo: boolean) => void;
  profile: PlayerProfile;
  onProfileChange: (profile: PlayerProfile) => void;
  onOnlineMatchComplete: (result: OnlineMatchResult) => void;
}) {
  if (kind === 'online')
    return (
      <OnlineScreen
        onBack={onBack}
        games={games}
        defaultName={profile.displayName}
        onMatchComplete={onOnlineMatchComplete}
      />
    );
  if (kind === 'profile')
    return (
      <ProfileScreen profile={profile} onChange={onProfileChange} onBack={onBack} games={games} />
    );
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

function ProfileScreen({
  profile,
  onChange,
  onBack,
  games,
}: {
  profile: PlayerProfile;
  onChange: (profile: PlayerProfile) => void;
  onBack: () => void;
  games: readonly MiniGame[];
}) {
  const [draftName, setDraftName] = useState(profile.displayName);
  const bestGame = games
    .map((game) => ({ game, score: profile.stats.bestScores[game.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)[0];
  const achievements = profileAchievements(profile);
  const availableAvatars = unlockedAvatars(profile);
  const daily = dailyProgress(profile);
  const save = () => onChange({ ...profile, displayName: draftName.trim().slice(0, 20) });
  return (
    <main className="zg-page profile-page">
      <ZeyHeader onHome={onBack} />
      <section className="profile-card">
        <span className="zg-sticker yellow">OYUNCU PROFİLİ</span>
        <div className="profile-avatar-large">{profile.avatar}</div>
        <h1>{profile.displayName || 'Yeni Oyuncu'}</h1>
        <label htmlFor="profile-name">OYUNCU ADI</label>
        <div className="profile-name-edit">
          <input
            id="profile-name"
            value={draftName}
            maxLength={20}
            placeholder="Adını yaz"
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button className="zg-button primary" onClick={save}>
            KAYDET
          </button>
        </div>
        <fieldset className="avatar-picker">
          <legend>AVATARINI SEÇ</legend>
          {AVATARS.map((avatar) => (
            <button
              key={avatar}
              className={profile.avatar === avatar ? 'selected' : ''}
              aria-pressed={profile.avatar === avatar}
              disabled={!availableAvatars.includes(avatar)}
              title={
                availableAvatars.includes(avatar)
                  ? `${avatar} avatarını seç`
                  : 'Başarımı tamamlayarak aç'
              }
              onClick={() => availableAvatars.includes(avatar) && onChange({ ...profile, avatar })}
            >
              {avatar}
              {!availableAvatars.includes(avatar) && <small>🔒</small>}
            </button>
          ))}
        </fieldset>
      </section>
      <section className="profile-stats" aria-label="Oyuncu istatistikleri">
        <article>
          <strong>{profile.stats.matchesPlayed}</strong>
          <span>Maç</span>
        </article>
        <article>
          <strong>{profile.stats.wins}</strong>
          <span>Galibiyet</span>
        </article>
        <article>
          <strong>{profile.stats.losses}</strong>
          <span>Mağlubiyet</span>
        </article>
        <article>
          <strong>{profile.stats.draws}</strong>
          <span>Beraberlik</span>
        </article>
        <article>
          <strong>{profile.stats.currentStreak}</strong>
          <span>Seri</span>
        </article>
        <article>
          <strong>{profile.stats.bestStreak}</strong>
          <span>En iyi seri</span>
        </article>
      </section>
      <section className="profile-best">
        <span>EN İYİ OYUN</span>
        <strong>{bestGame?.score ? bestGame.game.name : 'Henüz maç yok'}</strong>
        <b>{bestGame?.score ?? 0} puan</b>
      </section>
      <section className={`daily-challenge ${daily.complete ? 'complete' : ''}`}>
        <span className="zg-sticker coral">GÜNLÜK GÖREV</span>
        <div>
          <strong>{daily.complete ? 'Görev tamamlandı!' : 'Bugün 3 online maç oyna'}</strong>
          <small>
            {daily.current} / {daily.target}
          </small>
        </div>
        <progress value={daily.current} max={daily.target} aria-label="Günlük görev ilerlemesi" />
      </section>
      <section className="achievements-section">
        <h2>Başarımlar</h2>
        <div className="achievement-grid">
          {achievements.map((achievement) => (
            <article key={achievement.id} className={achievement.unlocked ? 'unlocked' : 'locked'}>
              <b>{achievement.unlocked ? achievement.icon : '🔒'}</b>
              <strong>{achievement.title}</strong>
              <span>{achievement.description}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

type Category = 'Tümü' | 'Refleks' | 'Fitness' | 'Yüz' | 'Ritim';
const categories: Record<string, Category> = {
  'Buz Kırma': 'Refleks',
  'Meyve Kesme': 'Refleks',
  'Ağızla Yakala': 'Refleks',
  'Balon Patlatma': 'Refleks',
  'Don–Hareket Et': 'Ritim',
  'Sanal Kaleci': 'Fitness',
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
  'Balon Patlatma': 'pink',
  'Don–Hareket Et': 'green',
  'Sanal Kaleci': 'blue',
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
