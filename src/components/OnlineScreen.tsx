import { useState } from 'react';
import { useOnlineRoom } from '../online/useOnlineRoom';
import type { RoomPlayer } from '../online/room-types';
import { ZeyHeader } from './ZeyHeader';
import { Mascot } from './ZeyVisuals';

export function OnlineScreen({ onBack }: { onBack: () => void }) {
  const online = useOnlineRoom();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');

  const leaveAndBack = async () => {
    if (online.snapshot) await online.leave();
    onBack();
  };

  if (online.snapshot) {
    return (
      <LobbyScreen
        online={online}
        notice={notice}
        setNotice={setNotice}
        onBack={() => void leaveAndBack()}
      />
    );
  }

  const pending = online.busy !== null;
  return (
    <main className="zg-page online-page">
      <ZeyHeader onHome={onBack} />
      <div className="online-layout">
        <section className="online-intro">
          <span className="zg-sticker yellow">CANLI BAĞLANTI</span>
          <h1>
            Uzaktan ol.
            <br />
            <em>Oyunda kal.</em>
          </h1>
          <p>Arkadaşın nerede olursa olsun, aynı arenada buluşun.</p>
          <div className="player-link" aria-hidden="true">
            <div className="player-chip purple">
              <Mascot />
              <strong>SEN</strong>
            </div>
            <span>
              <b>VİYUV!</b>
            </span>
            <div className="player-chip blue">
              <Mascot mood="winner" />
              <strong>ARKADAŞIN</strong>
            </div>
          </div>
        </section>
        <section className="online-panel" aria-labelledby="online-panel-title">
          <div className="online-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'create'}
              onClick={() => {
                setTab('create');
                online.clearError();
              }}
            >
              Oda Oluştur
            </button>
            <button
              role="tab"
              aria-selected={tab === 'join'}
              onClick={() => {
                setTab('join');
                online.clearError();
              }}
            >
              Odaya Katıl
            </button>
          </div>
          <div className="online-content">
            <div className="online-icon">
              <Mascot />
            </div>
            <h2 id="online-panel-title">
              {tab === 'create' ? 'Kendi odanı kur' : 'Arkadaşına katıl'}
            </h2>
            <p>
              {tab === 'create'
                ? 'Sana özel oda kodunu arkadaşınla paylaş. O katılınca oyun başlasın.'
                : '6 haneli oda kodunu gir ve arenadaki yerini al.'}
            </p>
            <label htmlFor="display-name">ADIN NE?</label>
            <input
              id="display-name"
              className="name-input"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 20))}
              autoComplete="nickname"
              maxLength={20}
              placeholder="Adını yaz"
              disabled={pending}
            />
            {tab === 'join' && (
              <>
                <label htmlFor="room-code">ODA KODU</label>
                <input
                  id="room-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="583921"
                  maxLength={6}
                  disabled={pending}
                />
              </>
            )}
            {tab === 'create' && (
              <div className="benefits">
                <span>✓ Özel, güvenli oda</span>
                <span>✓ Anında bağlantı</span>
              </div>
            )}
            <button
              className="zg-button primary"
              disabled={pending || !online.configured}
              onClick={() =>
                void (tab === 'create' ? online.create(name) : online.join(code, name))
              }
            >
              {online.busy === 'recovering'
                ? 'HAZIRLANIYOR...'
                : online.busy === 'creating'
                  ? 'ODA OLUŞTURULUYOR...'
                  : online.busy === 'joining'
                    ? 'KATILINIYOR...'
                    : tab === 'create'
                      ? 'ODA OLUŞTUR →'
                      : 'ODAYA KATIL →'}
            </button>
            <p className="online-message" role="alert" aria-live="polite">
              {online.error}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

type OnlineState = ReturnType<typeof useOnlineRoom>;
function LobbyScreen({
  online,
  notice,
  setNotice,
  onBack,
}: {
  online: OnlineState;
  notice: string;
  setNotice: (message: string) => void;
  onBack: () => void;
}) {
  const { snapshot } = online;
  if (!snapshot) return null;
  const self = snapshot.players.find((player) => player.userId === snapshot.currentUserId);
  const host = snapshot.room.hostUserId === snapshot.currentUserId;
  const playerOne = snapshot.players.find((player) => player.playerSlot === 1);
  const playerTwo = snapshot.players.find((player) => player.playerSlot === 2);
  const canStart =
    host &&
    snapshot.room.status === 'waiting' &&
    snapshot.players.length === 2 &&
    snapshot.players.every((player) => player.isReady);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setNotice('Kopyalandı!');
    } catch {
      setNotice('Kodu seçip elle kopyalayabilirsin.');
    }
  };

  return (
    <main className="zg-page lobby-page">
      <ZeyHeader onHome={onBack} />
      <section className="lobby-heading">
        <span className="zg-sticker yellow">CANLI LOBBY</span>
        <h1>ODA HAZIR!</h1>
        <p>Arkadaşına bu kodu gönder, sonra birlikte hazır olun.</p>
      </section>
      <section className="room-code-card">
        <span>ODA KODU</span>
        <strong>{snapshot.room.code}</strong>
        <button className="zg-button" onClick={() => void copyCode()}>
          KODU KOPYALA
        </button>
      </section>
      <p className="copy-notice" role="status" aria-live="polite">
        {notice}
      </p>
      <div className="lobby-connection">
        <i className={online.connected ? 'online' : ''} />
        {online.connected ? 'Realtime bağlı' : 'Bağlantı yeniden kuruluyor...'}
      </div>
      <section className="lobby-players">
        <PlayerSlot slot={1} player={playerOne} host presence={online.presence} />
        <span className="lobby-vs">VS</span>
        <PlayerSlot slot={2} player={playerTwo} presence={online.presence} />
      </section>
      <section className="lobby-actions">
        <button
          className={`zg-button ready-button ${self?.isReady ? 'is-ready' : ''}`}
          disabled={!self || online.busy !== null || snapshot.room.status === 'closed'}
          onClick={() => void online.toggleReady()}
        >
          {online.busy === 'ready'
            ? 'HAZIRLANIYOR...'
            : self?.isReady
              ? 'HAZIR DEĞİLİM'
              : 'HAZIRIM!'}
        </button>
        {host && (
          <button
            className="zg-button primary start-online"
            disabled={!canStart}
            onClick={() => setNotice('Online oyun senkronizasyonu Phase 2’de bağlanacak.')}
          >
            OYUNU BAŞLAT →
          </button>
        )}
        {!host && <p className="host-wait">Oyunu ev sahibi başlatacak.</p>}
        <button
          className="leave-room"
          disabled={online.busy !== null}
          onClick={() => void online.leave()}
        >
          ODADAN AYRIL
        </button>
      </section>
      <p className="online-message" role="alert" aria-live="polite">
        {snapshot.room.status === 'closed' ? 'Ev sahibi odadan ayrıldı.' : online.error}
      </p>
    </main>
  );
}

function PlayerSlot({
  slot,
  player,
  host = false,
  presence,
}: {
  slot: 1 | 2;
  player?: RoomPlayer;
  host?: boolean;
  presence: Record<string, boolean>;
}) {
  if (!player)
    return (
      <article className="lobby-player empty">
        <div className="lobby-mascot">
          <Mascot mood="hello" />
        </div>
        <span>PLAYER {slot}</span>
        <strong>{slot === 1 ? 'EV SAHİBİ AYRILDI' : 'ARKADAŞ BEKLENİYOR...'}</strong>
        <small>○ BOŞ SLOT</small>
      </article>
    );
  const connected = Boolean(presence[player.userId]);
  return (
    <article className={`lobby-player slot-${player.playerSlot} ${player.isReady ? 'ready' : ''}`}>
      <div className="lobby-mascot">
        <Mascot mood={player.isReady ? 'winner' : 'idle'} />
      </div>
      <span>
        PLAYER {player.playerSlot}
        {host && <b className="zg-sticker coral">HOST</b>}
      </span>
      <strong title={player.displayName}>{player.displayName}</strong>
      <small className={player.isReady ? 'ready-label' : ''}>
        {player.isReady ? '● HAZIR' : '○ BEKLİYOR'}
      </small>
      <em className={connected ? 'connected' : ''}>{connected ? 'Bağlı' : 'Bağlantı kesildi'}</em>
    </article>
  );
}
