import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameIndexById } from '../games';
import type { GameController } from '../game-controller';
import { CAMERA_BYPASS_ENABLED } from '../online/camera-bypass';
import {
  cameraPreparationErrorMessage,
  withCameraPreparationTimeout,
} from '../online/camera-preparation';
import { countdownLabel, remainingUntilStart } from '../online/session-clock';
import {
  canConfirmPlaying,
  type CountdownMeasurement,
  onlineEngineSessionKey,
  shouldStartOnlineEngine,
} from '../online/session-start';
import { useOnlineRoom } from '../online/useOnlineRoom';
import { useRoomPeer } from '../online/use-room-peer';
import { createPeerMediaStream } from '../online/webrtc-config';
import { createRoomInviteUrl, roomCodeFromInvite } from '../online/invite-link';
import { calculateMatchScore } from '../online/match-score';
import type { OnlineReaction } from '../online/online-events';
import type { RoomPlayer } from '../online/room-types';
import type { MiniGame } from '../types';
import { GameHost } from './GameHost';
import {
  OnlineArena,
  OnlineOrientationGate,
  RemotePeerVideo,
  requestOnlineFullscreen,
  usePortrait,
} from './OnlineArena';
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
  const portrait = usePortrait();
  const invitedRoomCode = useMemo(() => roomCodeFromInvite(window.location.search), []);
  const [tab, setTab] = useState<'create' | 'join'>(invitedRoomCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState(invitedRoomCode);
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
        portrait={portrait}
      />
    );
  }

  const pending = online.busy !== null;
  return (
    <>
      <OnlineOrientationGate onBack={onBack} />
      <main className="zg-page online-page" inert={portrait}>
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
              <div className="online-icon online-entry-mascot">
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
    </>
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
  portrait,
}: {
  online: OnlineState;
  notice: string;
  setNotice: (message: string) => void;
  onBack: () => void;
  games: MiniGame[];
  portrait: boolean;
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
  const match = useMemo(() => calculateMatchScore(snapshot.scores), [snapshot.scores]);
  const nextRoundNumber = Math.min(3, match.rounds.length + 1);
  const controllerRef = useRef<GameController | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const [liveLocalScore, setLiveLocalScore] = useState(0);
  const [liveRemoteScore, setLiveRemoteScore] = useState(0);
  const [serverNow, setServerNow] = useState(() => Date.now() + online.clockOffsetMs);
  const [cameraMode, setCameraMode] = useState<CameraPreparationMode>('none');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [countdownMeasurement, setCountdownMeasurement] = useState<CountdownMeasurement | null>(
    null,
  );
  const [peerLocalStream, setPeerLocalStream] = useState<MediaStream | null>(null);
  const [remoteReaction, setRemoteReaction] = useState<{
    value: OnlineReaction;
    id: number;
  } | null>(null);
  const reactionTimerRef = useRef(0);
  const stopPeerAudioRef = useRef<() => void>(() => undefined);
  const preparedGameRef = useRef(snapshot.room.selectedGameId);
  const confirmedRoundRef = useRef<string | null>(null);
  const confirmingRoundRef = useRef<string | null>(null);
  const confirmRetryTimerRef = useRef(0);
  const [confirmRetry, setConfirmRetry] = useState(0);
  const confirmPlayingRef = useRef(online.confirmPlaying);
  confirmPlayingRef.current = online.confirmPlaying;
  const startedEngineSessionRef = useRef<string | null>(null);
  const scoreSequenceRef = useRef(0);
  const remoteScoreSequencesRef = useRef<[number, number]>([0, 0]);
  const scoreRoundRef = useRef(snapshot.room.roundId);
  const finishedRoundRef = useRef<string | null>(null);
  const activeSession =
    snapshot.room.sessionState === 'countdown' || snapshot.room.sessionState === 'playing';
  useEffect(() => {
    if (!activeSession) return;
    const tick = () => setServerNow(Date.now() + online.clockOffsetMs);
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [activeSession, online.clockOffsetMs]);
  useEffect(() => {
    const element = pageRef.current;
    return () => {
      if (element && document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const canStart =
    host &&
    snapshot.room.status === 'waiting' &&
    snapshot.players.length === 2 &&
    snapshot.players.every((player) => player.isReady) &&
    Boolean(snapshot.room.selectedGameId) &&
    cameraMode !== 'none';
  const remainingMs =
    countdownMeasurement?.roundId === snapshot.room.roundId
      ? countdownMeasurement.remainingMs
      : snapshot.room.startAt
        ? remainingUntilStart(snapshot.room.startAt, online.clockOffsetMs)
        : 0;
  const peer = useRoomPeer({
    enabled: cameraMode === 'camera',
    signalingConnected: online.connected,
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
    setLiveLocalScore(score);
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
      const preparationWasActive = cameraMode !== 'none';
      preparedGameRef.current = snapshot.room.selectedGameId;
      controllerRef.current?.stop();
      stopPeerAudioRef.current();
      stopPeerAudioRef.current = () => undefined;
      setPeerLocalStream(null);
      setCameraMode('none');
      setCameraBusy(false);
      scoreSequenceRef.current = 0;
      remoteScoreSequencesRef.current = [0, 0];
      if (preparationWasActive)
        setNotice('Oyun değişti. Hazır olmadan önce kameranı yeniden hazırla.');
    }
  }, [cameraMode, setNotice, snapshot.room.selectedGameId]);

  useEffect(() => {
    const roundId = snapshot.room.roundId;
    if (!roundId || !snapshot.room.startAt || snapshot.room.sessionState !== 'countdown') return;
    let frame = 0;
    const tick = () => {
      const remaining = remainingUntilStart(snapshot.room.startAt!, online.clockOffsetMs);
      setCountdownMeasurement({ roundId, remainingMs: remaining });
      if (remaining > 0) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [
    online.clockOffsetMs,
    snapshot.room.roundId,
    snapshot.room.sessionState,
    snapshot.room.startAt,
  ]);

  useEffect(() => {
    const roundId = snapshot.room.roundId;
    if (
      canConfirmPlaying({
        host,
        sessionState: snapshot.room.sessionState,
        roundId,
        measurement: countdownMeasurement,
        confirmedRoundId: confirmedRoundRef.current,
        confirmingRoundId: confirmingRoundRef.current,
      }) &&
      roundId
    ) {
      confirmingRoundRef.current = roundId;
      void confirmPlayingRef.current(roundId).then((confirmed) => {
        if (confirmingRoundRef.current !== roundId) return;
        confirmingRoundRef.current = null;
        if (confirmed) {
          confirmedRoundRef.current = roundId;
          return;
        }
        window.clearTimeout(confirmRetryTimerRef.current);
        confirmRetryTimerRef.current = window.setTimeout(
          () => setConfirmRetry((attempt) => attempt + 1),
          300,
        );
      });
    }
  }, [confirmRetry, countdownMeasurement, host, snapshot.room.roundId, snapshot.room.sessionState]);

  useEffect(() => {
    const roundId = snapshot.room.roundId;
    const gameId = snapshot.room.selectedGameId;
    if (
      !shouldStartOnlineEngine({
        activeSession,
        cameraPrepared: cameraMode === 'camera',
        startAt: snapshot.room.startAt,
        roundId,
        gameId,
        preparedGameId: preparedGameRef.current,
        startedSessionKey: startedEngineSessionRef.current,
      }) ||
      !roundId ||
      !gameId ||
      !snapshot.room.startAt
    )
      return;
    const sessionKey = onlineEngineSessionKey(roundId, gameId);
    const started = controllerRef.current?.runOnline(
      remainingUntilStart(snapshot.room.startAt, online.clockOffsetMs) / 1000,
      snapshot.room.roundSeed,
      Date.parse(snapshot.room.startAt),
      online.clockOffsetMs,
    );
    if (started) startedEngineSessionRef.current = sessionKey;
  }, [
    activeSession,
    cameraMode,
    online.clockOffsetMs,
    snapshot.room.roundId,
    snapshot.room.roundSeed,
    snapshot.room.selectedGameId,
    snapshot.room.startAt,
  ]);

  useEffect(
    () =>
      online.subscribeEvent((event) => {
        if (event.kind === 'reaction' && event.senderUserId !== snapshot.currentUserId) {
          window.clearTimeout(reactionTimerRef.current);
          setRemoteReaction({ value: event.reaction, id: event.sentAt });
          reactionTimerRef.current = window.setTimeout(() => setRemoteReaction(null), 1800);
          return;
        }
        if (event.kind !== 'score' || event.roundId !== snapshot.room.roundId) return;
        const index = event.playerSlot - 1;
        if (event.sequence <= remoteScoreSequencesRef.current[index]) return;
        remoteScoreSequencesRef.current[index] = event.sequence;
        controllerRef.current?.setOnlineRemoteScore(event.playerSlot, event.score);
        if (event.playerSlot !== self?.playerSlot) setLiveRemoteScore(event.score);
      }),
    [online.subscribeEvent, snapshot.room.roundId, self?.playerSlot],
  );

  useEffect(() => {
    if (scoreRoundRef.current === snapshot.room.roundId) return;
    scoreRoundRef.current = snapshot.room.roundId;
    scoreSequenceRef.current = 0;
    remoteScoreSequencesRef.current = [0, 0];
    setLiveLocalScore(0);
    setLiveRemoteScore(0);
  }, [snapshot.room.roundId]);

  useEffect(() => {
    const localScore = snapshot.scores.find(
      (score) => score.roundId === snapshot.room.roundId && score.playerSlot === self?.playerSlot,
    );
    scoreSequenceRef.current = Math.max(scoreSequenceRef.current, localScore?.sequence ?? 0);
    for (const score of snapshot.scores) {
      if (score.roundId === snapshot.room.roundId) {
        const index = score.playerSlot - 1;
        if (score.sequence < remoteScoreSequencesRef.current[index]) continue;
        remoteScoreSequencesRef.current[index] = Math.max(
          remoteScoreSequencesRef.current[index],
          score.sequence,
        );
        controllerRef.current?.setOnlineRemoteScore(score.playerSlot, score.score);
        if (score.playerSlot !== self?.playerSlot) setLiveRemoteScore(score.score);
      }
    }
  }, [self?.playerSlot, snapshot.room.roundId, snapshot.scores]);

  const finishGameRef = useRef(online.finishGame);
  finishGameRef.current = online.finishGame;
  const finalScoreCount = new Set(
    currentScores.filter((score) => score.isFinal).map((score) => score.playerSlot),
  ).size;
  useEffect(() => {
    const roundId = snapshot.room.roundId;
    if (!host || !roundId || snapshot.room.sessionState !== 'playing') return;
    if (finalScoreCount !== 2 || finishedRoundRef.current === roundId) return;
    let cancelled = false;
    let timer = 0;
    const finish = async () => {
      const finished = await finishGameRef.current(roundId);
      if (cancelled) return;
      if (finished) finishedRoundRef.current = roundId;
      else timer = window.setTimeout(() => void finish(), 1500);
    };
    void finish();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [host, finalScoreCount, snapshot.room.roundId, snapshot.room.sessionState]);

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
      startedEngineSessionRef.current = null;
      confirmingRoundRef.current = null;
      window.clearTimeout(confirmRetryTimerRef.current);
      setCountdownMeasurement(null);
    }
  }, [snapshot.room.roundId, snapshot.room.sessionState]);

  useEffect(
    () => () => {
      window.clearTimeout(confirmRetryTimerRef.current);
      window.clearTimeout(reactionTimerRef.current);
      stopPeerAudioRef.current();
    },
    [],
  );

  const prepareCamera = async () => {
    if (!snapshot.room.selectedGameId || !self || portrait) return;
    void requestOnlineFullscreen(pageRef.current);
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

  const shareInvite = async () => {
    const inviteUrl = createRoomInviteUrl(snapshot.room.code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'ZeyGame daveti',
          text: `${self?.displayName ?? 'Arkadaşın'} seni ZeyGame odasına davet ediyor!`,
          url: inviteUrl,
        });
        setNotice('Davet bağlantısı paylaşıldı!');
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      setNotice('Davet bağlantısı kopyalandı!');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice('Bağlantı paylaşılamadı. Oda kodunu gönderebilirsin.');
    }
  };

  const sendReaction = (reaction: OnlineReaction) => {
    if (!self) return;
    void online
      .sendEvent({
        kind: 'reaction',
        senderUserId: snapshot.currentUserId,
        playerSlot: self.playerSlot,
        reaction,
        sentAt: Date.now(),
      })
      .catch(() => setNotice('Tepki gönderilemedi.'));
  };

  return (
    <main
      ref={pageRef}
      className={`zg-page lobby-page ${activeSession ? 'online-game-active' : ''}`}
    >
      <OnlineOrientationGate onBack={onBack} />
      <OnlineArena
        active={activeSession && cameraMode === 'camera'}
        localName={self?.displayName ?? 'Sen'}
        remoteName={
          snapshot.players.find((player) => player.playerSlot !== self?.playerSlot)?.displayName ??
          'Arkadaşın'
        }
        localScore={liveLocalScore}
        remoteScore={liveRemoteScore}
        gameName={selectedGame?.name ?? 'ZeyGame'}
        remaining={Math.max(
          0,
          Math.ceil(
            (selectedGame?.duration ?? 20) -
              Math.max(0, (serverNow - Date.parse(snapshot.room.startAt ?? '')) / 1000),
          ),
        )}
        pending={online.scorePending}
        onBack={onBack}
        onFullscreen={() => void requestOnlineFullscreen(pageRef.current)}
        reaction={remoteReaction}
        onReaction={sendReaction}
        remote={<RemotePeerVideo stream={peer.remoteStream} state={peer.state} />}
      >
        <GameHost
          controllerRef={controllerRef}
          games={games}
          visible={activeSession && cameraMode === 'camera'}
          onHome={onBack}
          onChooseAnother={() => undefined}
          onScore={handleScore}
        />
      </OnlineArena>
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
          <span className="zg-sticker coral">
            {match.complete ? 'MAÇ TAMAMLANDI' : `${match.rounds.length}. RAUND`}
          </span>
          <h2>{match.complete ? 'Maçın galibi belli oldu!' : 'Rövanş zamanı!'}</h2>
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
          <div className="online-match-score" aria-label="Üç raundluk maç durumu">
            <span>{playerOne?.displayName ?? 'Oyuncu 1'}</span>
            <strong>
              {match.winsOne} – {match.winsTwo}
            </strong>
            <span>{playerTwo?.displayName ?? 'Oyuncu 2'}</span>
            <small>
              {match.rounds.length}/3 raund tamamlandı
              {match.draws ? ` · ${match.draws} beraberlik` : ''}
            </small>
          </div>
          {match.complete ? (
            <p className="match-winner">
              {match.winsOne === match.winsTwo
                ? 'MAÇ BERABERE!'
                : match.winsOne > match.winsTwo
                  ? `${playerOne?.displayName ?? 'Oyuncu 1'} MAÇI KAZANDI!`
                  : `${playerTwo?.displayName ?? 'Oyuncu 2'} MAÇI KAZANDI!`}
            </p>
          ) : host ? (
            <button className="zg-button primary" onClick={() => void online.resetSession()}>
              {nextRoundNumber}. RAUND İÇİN RÖVANŞ
            </button>
          ) : (
            <p>Ev sahibi rövanşı hazırlıyor.</p>
          )}
          {match.complete && (
            <button className="zg-button" onClick={onBack}>
              ODADAN AYRIL
            </button>
          )}
        </section>
      )}
      {!activeSession && snapshot.room.sessionState !== 'finished' && (
        <>
          <ZeyHeader onHome={onBack} />
          <section className="lobby-heading">
            <span className="zg-sticker yellow">
              {match.rounds.length ? `3 RAUNDLUK MAÇ · ${nextRoundNumber}. RAUND` : 'CANLI LOBBY'}
            </span>
            <h1>{match.rounds.length ? 'RÖVANŞA HAZIRLAN!' : 'ODA HAZIR!'}</h1>
            <p>
              {match.rounds.length
                ? `Maç durumu ${match.winsOne}–${match.winsTwo}. Kameranı hazırla ve yeniden hazır ol.`
                : 'Arkadaşına bu kodu gönder, sonra birlikte hazır olun.'}
            </p>
          </section>
          <section className="room-code-card">
            <span>ODA KODU</span>
            <strong>{snapshot.room.code}</strong>
            <div className="room-share-actions">
              <button className="zg-button" onClick={() => void shareInvite()}>
                DAVET LİNKİNİ PAYLAŞ
              </button>
              <button className="room-code-copy" onClick={() => void copyCode()}>
                Yalnızca kodu kopyala
              </button>
            </div>
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
                {games.map((game) => {
                  const selected = snapshot.room.selectedGameId === game.id;
                  return (
                    <button
                      key={game.id}
                      className={selected ? 'selected' : ''}
                      aria-pressed={selected}
                      disabled={online.busy !== null}
                      onClick={() => void online.selectGame(game.id)}
                    >
                      {selected && (
                        <>
                          <span className="selected-game-check" aria-hidden="true">
                            ✓
                          </span>
                          <span className="selected-game-label">SEÇİLDİ</span>
                        </>
                      )}
                      <GameIllustration name={game.name} />
                      <strong>{game.name}</strong>
                    </button>
                  );
                })}
              </div>
            ) : selectedGame ? (
              <article
                className="selected-online-game selected"
                aria-label={`Seçilen oyun: ${selectedGame.name}`}
              >
                <span className="selected-game-check" aria-hidden="true">
                  ✓
                </span>
                <GameIllustration name={selectedGame.name} />
                <div>
                  <span>{playerOne?.displayName} BU OYUNU SEÇTİ</span>
                  <strong>{selectedGame.name}</strong>
                  <span className="selected-game-label">SEÇİLDİ</span>
                </div>
              </article>
            ) : (
              <p className="host-wait">Ev sahibinin oyun seçmesi bekleniyor.</p>
            )}
          </section>
          <section className="lobby-actions">
            <div className="ready-checklist" aria-label="Oyuna hazırlık durumu">
              <strong>BAŞLAMADAN ÖNCE</strong>
              <span className={selectedGame ? 'done' : ''}>1. Oyun seçildi</span>
              <span className={cameraMode !== 'none' ? 'done' : ''}>2. Kamera hazır</span>
              <span className={self?.isReady ? 'done' : ''}>3. Sen hazırsın</span>
              <span className={snapshot.players.length === 2 ? 'done' : ''}>
                4. Arkadaşın odada
              </span>
              <span
                className={
                  snapshot.players.length === 2 &&
                  snapshot.players.every((player) => player.isReady)
                    ? 'done'
                    : ''
                }
              >
                5. İki oyuncu da hazır
              </span>
            </div>
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
