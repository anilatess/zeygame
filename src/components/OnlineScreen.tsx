import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameIndexById } from '../games';
import type { GameController } from '../game-controller';
import { CAMERA_BYPASS_ENABLED } from '../online/camera-bypass';
import {
  cameraPreparationErrorMessage,
  withCameraPreparationTimeout,
} from '../online/camera-preparation';
import { countdownLabel, remainingUntilStart } from '../online/session-clock';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { useRoomPeer } from '../online/use-room-peer';
import { createPeerMediaStream } from '../online/webrtc-config';
import type { RoomPlayer } from '../online/room-types';
import type { MiniGame } from '../types';
import { GameHost } from './GameHost';
import { ZeyHeader } from './ZeyHeader';
import { GameIllustration, Mascot } from './ZeyVisuals';

export function OnlineScreen({
  onBack,
  games,
}: {
  onBack: () => void;
  games: readonly MiniGame[];
}) {
  const onlineGames = useMemo(() => [...games], [games]);
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
        games={onlineGames}
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
type CameraPreparationMode = 'none' | 'camera' | 'bypass';
function LobbyScreen({
  online,
  notice,
  setNotice,
  onBack,
  games,
}: {
  online: OnlineState;
  notice: string;
  setNotice: (message: string) => void;
  onBack: () => void;
  games: MiniGame[];
}) {
  const { snapshot } = online;
  if (!snapshot) return null;
  const self = snapshot.players.find((player) => player.userId === snapshot.currentUserId);
  const host = snapshot.room.hostUserId === snapshot.currentUserId;
  const playerOne = snapshot.players.find((player) => player.playerSlot === 1);
  const playerTwo = snapshot.players.find((player) => player.playerSlot === 2);
  const selectedGame = games.find((game) => game.id === snapshot.room.selectedGameId);
  const currentScores = snapshot.scores.filter((score) => score.roundId === snapshot.room.roundId);
  const scoreOne = currentScores.find((score) => score.playerSlot === 1)?.score ?? 0;
  const scoreTwo = currentScores.find((score) => score.playerSlot === 2)?.score ?? 0;
  const controllerRef = useRef<GameController | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraPreparationMode>('none');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [peerLocalStream, setPeerLocalStream] = useState<MediaStream | null>(null);
  const stopPeerAudioRef = useRef<() => void>(() => undefined);
  const preparedGameRef = useRef(snapshot.room.selectedGameId);
  const confirmedRoundRef = useRef<string | null>(null);
  const scoreSequenceRef = useRef(0);
  const remoteScoreSequencesRef = useRef<[number, number]>([0, 0]);
  const scoreRoundRef = useRef(snapshot.room.roundId);
  const finishedRoundRef = useRef<string | null>(null);
  const activeSession =
    snapshot.room.sessionState === 'countdown' || snapshot.room.sessionState === 'playing';
  const canStart =
    host &&
    snapshot.room.status === 'waiting' &&
    snapshot.players.length === 2 &&
    snapshot.players.every((player) => player.isReady) &&
    Boolean(snapshot.room.selectedGameId) &&
    cameraMode !== 'none';
  const peer = useRoomPeer({
    enabled: cameraMode === 'camera',
    localStream: peerLocalStream,
    localPlayerSlot: self?.playerSlot,
    currentUserId: snapshot.currentUserId,
    sendEvent: online.sendEvent,
    subscribeEvent: online.subscribeEvent,
  });

  const scoreContextRef = useRef({
    roundId: snapshot.room.roundId,
    playerSlot: self?.playerSlot,
    publishScore: online.publishScore,
  });
  scoreContextRef.current = {
    roundId: snapshot.room.roundId,
    playerSlot: self?.playerSlot,
    publishScore: online.publishScore,
  };
  const handleScore = useCallback((score: number, final: boolean) => {
    const context = scoreContextRef.current;
    if (!context.roundId || !context.playerSlot) return;
    scoreSequenceRef.current += 1;
    void context.publishScore(
      context.roundId,
      context.playerSlot,
      score,
      scoreSequenceRef.current,
      final,
    );
  }, []);

  useEffect(() => {
    if (preparedGameRef.current !== snapshot.room.selectedGameId) {
      preparedGameRef.current = snapshot.room.selectedGameId;
      controllerRef.current?.stop();
      stopPeerAudioRef.current();
      stopPeerAudioRef.current = () => undefined;
      setPeerLocalStream(null);
      setCameraMode('none');
      setCameraBusy(false);
      scoreSequenceRef.current = 0;
      remoteScoreSequencesRef.current = [0, 0];
    }
  }, [snapshot.room.selectedGameId]);

  useEffect(() => {
    if (!snapshot.room.startAt || snapshot.room.sessionState !== 'countdown') return;
    let frame = 0;
    const tick = () => {
      const remaining = remainingUntilStart(snapshot.room.startAt!, online.clockOffsetMs);
      setRemainingMs(remaining);
      if (remaining > 0) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [online.clockOffsetMs, snapshot.room.sessionState, snapshot.room.startAt]);

  useEffect(() => {
    const roundId = snapshot.room.roundId;
    if (
      host &&
      roundId &&
      snapshot.room.sessionState === 'countdown' &&
      remainingMs <= 0 &&
      confirmedRoundRef.current !== roundId
    ) {
      confirmedRoundRef.current = roundId;
      void online.confirmPlaying(roundId);
    }
  }, [host, online.confirmPlaying, remainingMs, snapshot.room.roundId, snapshot.room.sessionState]);

  useEffect(() => {
    if (!activeSession || cameraMode !== 'camera' || !snapshot.room.startAt) return;
    controllerRef.current?.runOnline(
      remainingUntilStart(snapshot.room.startAt, online.clockOffsetMs) / 1000,
      snapshot.room.roundSeed,
    );
  }, [
    activeSession,
    cameraMode,
    online.clockOffsetMs,
    snapshot.room.roundSeed,
    snapshot.room.startAt,
  ]);

  useEffect(
    () =>
      online.subscribeEvent((event) => {
        if (event.kind !== 'score' || event.roundId !== snapshot.room.roundId) return;
        const index = event.playerSlot - 1;
        if (event.sequence <= remoteScoreSequencesRef.current[index]) return;
        remoteScoreSequencesRef.current[index] = event.sequence;
        controllerRef.current?.setOnlineRemoteScore(event.playerSlot, event.score);
      }),
    [online.subscribeEvent, snapshot.room.roundId],
  );

  useEffect(() => {
    if (scoreRoundRef.current === snapshot.room.roundId) return;
    scoreRoundRef.current = snapshot.room.roundId;
    scoreSequenceRef.current = 0;
    remoteScoreSequencesRef.current = [0, 0];
  }, [snapshot.room.roundId]);

  useEffect(() => {
    const localScore = snapshot.scores.find(
      (score) => score.roundId === snapshot.room.roundId && score.playerSlot === self?.playerSlot,
    );
    scoreSequenceRef.current = Math.max(scoreSequenceRef.current, localScore?.sequence ?? 0);
    for (const score of snapshot.scores) {
      if (score.roundId === snapshot.room.roundId) {
        const index = score.playerSlot - 1;
        remoteScoreSequencesRef.current[index] = Math.max(
          remoteScoreSequencesRef.current[index],
          score.sequence,
        );
        controllerRef.current?.setOnlineRemoteScore(score.playerSlot, score.score);
      }
    }
  }, [self?.playerSlot, snapshot.room.roundId, snapshot.scores]);

  useEffect(() => {
    const roundId = snapshot.room.roundId;
    if (!host || !roundId || snapshot.room.sessionState !== 'playing') return;
    const finalSlots = new Set(
      snapshot.scores
        .filter((score) => score.roundId === roundId && score.isFinal)
        .map((score) => score.playerSlot),
    );
    if (finalSlots.size === 2 && finishedRoundRef.current !== roundId) {
      finishedRoundRef.current = roundId;
      void online.finishGame(roundId);
    }
  }, [host, online.finishGame, snapshot.room.roundId, snapshot.room.sessionState, snapshot.scores]);

  useEffect(() => {
    if (
      (snapshot.room.sessionState === 'waiting' && !snapshot.room.roundId) ||
      snapshot.room.sessionState === 'finished'
    ) {
      controllerRef.current?.stop();
      stopPeerAudioRef.current();
      stopPeerAudioRef.current = () => undefined;
      setPeerLocalStream(null);
      setCameraMode('none');
    }
  }, [snapshot.room.roundId, snapshot.room.sessionState]);

  useEffect(
    () => () => {
      stopPeerAudioRef.current();
    },
    [],
  );

  const prepareCamera = async () => {
    if (!snapshot.room.selectedGameId || !self) return;
    setCameraBusy(true);
    setNotice('');
    try {
      const controller = controllerRef.current;
      if (!controller) throw new Error('Game controller is unavailable.');
      const prepared = await withCameraPreparationTimeout(
        controller.prepare(
          'online',
          gameIndexById(games, snapshot.room.selectedGameId),
          self.playerSlot,
        ),
        () => controller.stop(),
      );
      if (prepared) {
        const cameraStream = controller.getMediaStream();
        if (cameraStream) {
          stopPeerAudioRef.current();
          const peerMedia = await createPeerMediaStream(cameraStream);
          stopPeerAudioRef.current = peerMedia.stopAudio;
          setPeerLocalStream(peerMedia.stream);
          setNotice(
            peerMedia.hasAudio
              ? 'Kamera, hareket algılama ve mikrofon hazır!'
              : 'Kamera hazır. Mikrofon kullanılamadığı için görüntüyle devam edilecek.',
          );
        }
      }
      setCameraMode(prepared ? 'camera' : 'none');
      if (!prepared) setNotice('Kamera zaten hazırlanıyor.');
    } catch (error) {
      controllerRef.current?.stop();
      stopPeerAudioRef.current();
      stopPeerAudioRef.current = () => undefined;
      setPeerLocalStream(null);
      setCameraMode('none');
      setNotice(cameraPreparationErrorMessage(error));
      console.warn('Online camera preparation failed.', error);
    } finally {
      setCameraBusy(false);
    }
  };

  const bypassCamera = () => {
    if (!CAMERA_BYPASS_ENABLED || !snapshot.room.selectedGameId || !self) return;
    controllerRef.current?.stop();
    stopPeerAudioRef.current();
    stopPeerAudioRef.current = () => undefined;
    setPeerLocalStream(null);
    setCameraBusy(false);
    setCameraMode('bypass');
    setNotice('DEV ONLY: Kamera gereksinimi bu oturum için atlandı.');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setNotice('Kopyalandı!');
    } catch {
      setNotice('Kodu seçip elle kopyalayabilirsin.');
    }
  };

  return (
    <main className={`zg-page lobby-page ${activeSession ? 'online-game-active' : ''}`}>
      <GameHost
        controllerRef={controllerRef}
        games={games}
        visible={activeSession && cameraMode === 'camera'}
        onHome={onBack}
        onChooseAnother={() => undefined}
        onScore={handleScore}
      />
      {cameraMode === 'camera' && <RemotePeerVideo stream={peer.remoteStream} state={peer.state} />}
      {activeSession && cameraMode === 'none' && (
        <section className="session-recovery">
          <Mascot mood="hello" />
          <h2>Oyun oturumu hazır</h2>
          <p>Kameranı bu cihazda hazırlayıp tura katıl.</p>
          <button className="zg-button primary" onClick={() => void prepareCamera()}>
            KAMERAYI HAZIRLA
          </button>
          {CAMERA_BYPASS_ENABLED && (
            <button className="dev-camera-bypass" onClick={bypassCamera}>
              <b>DEV ONLY</b> Kamerasız devam et
            </button>
          )}
        </section>
      )}
      {CAMERA_BYPASS_ENABLED && activeSession && cameraMode === 'bypass' && (
        <DevCameraBypassScreen
          gameId={snapshot.room.selectedGameId}
          roundId={snapshot.room.roundId}
          playerSlot={self?.playerSlot}
          sessionState={snapshot.room.sessionState}
          startAt={snapshot.room.startAt}
        />
      )}
      {snapshot.room.sessionState === 'countdown' && (
        <div className="online-countdown" aria-live="assertive">
          <span>AYNI ANDA BAŞLIYORUZ</span>
          <strong>{countdownLabel(remainingMs)}</strong>
          <small>{selectedGame?.name}</small>
        </div>
      )}
      {CAMERA_BYPASS_ENABLED &&
        host &&
        cameraMode === 'bypass' &&
        snapshot.room.sessionState === 'playing' &&
        snapshot.room.roundId && (
          <button
            className="dev-finish-round"
            onClick={() => void online.finishGame(snapshot.room.roundId!)}
          >
            DEV ONLY · TURU BİTİR
          </button>
        )}
      {snapshot.room.sessionState === 'finished' && (
        <section className="session-finished">
          <Mascot mood="winner" />
          <span className="zg-sticker coral">ONLINE TUR</span>
          <h2>Tur tamamlandı!</h2>
          <div className="online-final-score" aria-label="Online tur sonucu">
            <span>
              {playerOne?.displayName ?? 'Oyuncu 1'} · {scoreOne}
            </span>
            <strong>
              {scoreOne === scoreTwo
                ? 'BERABERE'
                : scoreOne > scoreTwo
                  ? 'P1 KAZANDI'
                  : 'P2 KAZANDI'}
            </strong>
            <span>
              {playerTwo?.displayName ?? 'Oyuncu 2'} · {scoreTwo}
            </span>
          </div>
          {host ? (
            <button className="zg-button primary" onClick={() => void online.resetSession()}>
              LOBİYE DÖN
            </button>
          ) : (
            <p>Ev sahibi yeni tur için lobiyi hazırlıyor.</p>
          )}
        </section>
      )}
      {!activeSession && snapshot.room.sessionState !== 'finished' && (
        <>
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
          <section className="lobby-game-picker">
            <div className="lobby-game-heading">
              <span className="zg-sticker yellow">OYUN SEÇ</span>
              <h2>
                {host
                  ? 'Meydan okumayı seç!'
                  : `${playerOne?.displayName ?? 'Ev sahibi'} oyun seçiyor`}
              </h2>
            </div>
            {host ? (
              <div className="lobby-game-grid">
                {games.map((game) => (
                  <button
                    key={game.id}
                    className={snapshot.room.selectedGameId === game.id ? 'selected' : ''}
                    disabled={online.busy !== null || cameraMode !== 'none'}
                    onClick={() => void online.selectGame(game.id)}
                  >
                    <GameIllustration name={game.name} />
                    <strong>{game.name}</strong>
                  </button>
                ))}
              </div>
            ) : selectedGame ? (
              <article className="selected-online-game">
                <GameIllustration name={selectedGame.name} />
                <div>
                  <span>{playerOne?.displayName} BU OYUNU SEÇTİ</span>
                  <strong>{selectedGame.name}</strong>
                </div>
              </article>
            ) : (
              <p className="host-wait">Ev sahibinin oyun seçmesi bekleniyor.</p>
            )}
          </section>
          <section className="lobby-actions">
            <button
              className="zg-button camera-ready"
              disabled={
                !selectedGame || cameraBusy || cameraMode !== 'none' || online.busy !== null
              }
              onClick={() => void prepareCamera()}
            >
              {cameraBusy
                ? 'KAMERA HAZIRLANIYOR...'
                : cameraMode === 'camera'
                  ? 'KAMERA HAZIR ✓'
                  : cameraMode === 'bypass'
                    ? 'DEV: KAMERA BYPASS ✓'
                    : 'KAMERAYI HAZIRLA'}
            </button>
            {CAMERA_BYPASS_ENABLED && cameraMode === 'none' && selectedGame && (
              <button className="dev-camera-bypass" onClick={bypassCamera} disabled={cameraBusy}>
                <b>DEV ONLY</b> Kamerasız devam et
              </button>
            )}
            <button
              className={`zg-button ready-button ${self?.isReady ? 'is-ready' : ''}`}
              disabled={
                !self ||
                cameraMode === 'none' ||
                online.busy !== null ||
                snapshot.room.status === 'closed'
              }
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
                onClick={() => void online.startGame()}
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
        </>
      )}
    </main>
  );
}

function RemotePeerVideo({ stream, state }: { stream: MediaStream | null; state: string }) {
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
      <span>ARKADAŞIN · {state === 'connected' ? 'CANLI' : 'BAĞLANIYOR'}</span>
      <video ref={videoRef} autoPlay playsInline />
      {!stream && <small>Görüntü bağlantısı bekleniyor…</small>}
      {playBlocked && (
        <button
          onClick={() => {
            void videoRef.current?.play();
            setPlayBlocked(false);
          }}
        >
          SESİ AÇ
        </button>
      )}
    </aside>
  );
}

function DevCameraBypassScreen({
  gameId,
  roundId,
  playerSlot,
  sessionState,
  startAt,
}: {
  gameId: string | null;
  roundId: string | null;
  playerSlot?: 1 | 2;
  sessionState: string;
  startAt: string | null;
}) {
  return (
    <section className="dev-session-screen" aria-label="Development online session details">
      <span className="dev-only-badge">DEV ONLY</span>
      <h2>ONLINE DEV TEST</h2>
      <dl>
        <div>
          <dt>Game ID</dt>
          <dd>{gameId ?? '—'}</dd>
        </div>
        <div>
          <dt>Round ID</dt>
          <dd title={roundId ?? ''}>{roundId ? roundId.slice(0, 8) : '—'}</dd>
        </div>
        <div>
          <dt>Local Player</dt>
          <dd>{playerSlot ? `P${playerSlot}` : '—'}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{sessionState}</dd>
        </div>
        <div>
          <dt>Start Time</dt>
          <dd>{startAt ?? '—'}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>BYPASSED (DEV ONLY)</dd>
        </div>
      </dl>
      <p>Bu ekran yalnızca Supabase oturum senkronizasyonunu test eder.</p>
    </section>
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
