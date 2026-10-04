import { useEffect, useRef } from 'react';
import { GameController } from '../game-controller';
import type { MiniGame } from '../types';
import { Mascot } from './ZeyVisuals';

type Props = {
  controllerRef: React.MutableRefObject<GameController | null>;
  games: MiniGame[];
  visible: boolean;
  onHome: () => void;
  onChooseAnother: () => void;
  onFinal?: () => void;
  onScore?: (score: number, final: boolean) => void;
};

export function GameHost({
  controllerRef,
  games,
  visible,
  onHome,
  onChooseAnother,
  onFinal,
  onScore,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!root || !video || !canvas) return;
    const controller = new GameController({ root, video, canvas }, games, onFinal, onScore);
    controllerRef.current = controller;
    const resize = () => controller.resize();
    const stop = () => controller.stop();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('beforeunload', stop);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.removeEventListener('beforeunload', stop);
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [controllerRef, games, onFinal, onScore]);

  return (
    <section className="game" tabIndex={-1} hidden={!visible} ref={rootRef}>
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} />
      <div className="camera-message" hidden />
      <div className="model-message" hidden>
        <p role="status" aria-live="polite" />
        <button data-action="retry" hidden onClick={() => controllerRef.current?.retryModel()}>
          Tekrar Dene
        </button>
        <button data-action="home" onClick={onHome}>
          Ana Menüye Dön
        </button>
      </div>
      <GameOverlay
        onReplay={() => controllerRef.current?.replay()}
        onChooseAnother={onChooseAnother}
        onHome={onHome}
      />
      <aside className="debug-panel" hidden aria-label="Solo test debug bilgileri">
        <strong>SOLO TEST</strong>
        <span data-debug="game" />
        <span data-debug="player" />
        <span data-debug="model" />
        <span data-debug="fps" />
        <span data-debug="score" />
        <span data-debug="state" />
        <span data-debug="camera" />
      </aside>
    </section>
  );
}

function GameOverlay({
  onReplay,
  onChooseAnother,
  onHome,
}: {
  onReplay: () => void;
  onChooseAnother: () => void;
  onHome: () => void;
}) {
  return (
    <div className="game-ui">
      <div className="calibration" hidden>
        <div className="calibration-card">
          <div className="eyebrow">HAZIRLIK</div>
          <h2 tabIndex={-1}>Yan yana, kameraya!</h2>
          <p data-ui="calibration-instruction">Solda ve sağda birer el gösterin.</p>
          <p className="calibration-status" role="status" aria-live="polite" />
        </div>
        <div className="ready-players">
          <div className="ready-player player-one">
            <strong>Oyuncu 1 · Sol</strong>
            <span data-ui="ready-one" />
          </div>
          <div className="ready-player player-two">
            <strong>Oyuncu 2 · Sağ</strong>
            <span data-ui="ready-two" />
          </div>
        </div>
      </div>
      <div className="play-hud" hidden>
        <div className="hud-player player-one">
          <span>OYUNCU 1</span>
          <strong data-ui="score-one">0</strong>
        </div>
        <div className="hud-time">
          <span data-ui="hud-game">ZEYGAME</span>
          <strong data-ui="time" />
        </div>
        <div className="hud-player player-two">
          <span>OYUNCU 2</span>
          <strong data-ui="score-two">0</strong>
        </div>
      </div>
      <span className="game-vs" aria-hidden="true" hidden>
        VS
      </span>
      <span className="tracking-pill" hidden>
        <i /> HAREKET ALGILANIYOR
      </span>
      <span className="keep-going" hidden>
        <small>SON 10 SANİYE</small>Devam et!
      </span>
      <div className="countdown-screen" hidden>
        <div className="round-intro">
          <span className="eyebrow">SIRADAKİ MEYDAN OKUMA</span>
          <h2 data-ui="game-name" />
          <p data-ui="instruction" />
        </div>
        <div className="countdown-number" data-ui="countdown" />
        <span className="countdown-hint">Hazır ol, hareket sırası sende!</span>
      </div>
      <div className="result-screen" hidden>
        <span className="confetti confetti-one" aria-hidden="true" />
        <span className="confetti confetti-two" aria-hidden="true" />
        <section className="result-card" aria-labelledby="result-title">
          <div className="winner-mascot">
            <Mascot mood="winner" />
          </div>
          <div className="eyebrow" data-ui="result-kicker" />
          <h2 id="result-title" tabIndex={-1} data-ui="result-title" />
          <p className="winner-label" data-ui="winner" role="status" aria-live="polite" />
          <div className="result-scores">
            <div className="player-one">
              <span>Oyuncu 1</span>
              <strong data-ui="result-one" />
              <small data-ui="award-one" />
            </div>
            <div className="player-two">
              <span>Oyuncu 2</span>
              <strong data-ui="result-two" />
              <small data-ui="award-two" />
            </div>
          </div>
          <p className="next-round" data-ui="next" />
          <div className="final-actions" hidden>
            <button data-action="replay" onClick={onReplay}>
              Tekrar Oyna
            </button>
            <button data-action="choose-another" hidden onClick={onChooseAnother}>
              Başka Oyun Seç
            </button>
            <button data-action="home" onClick={onHome}>
              Ana Menüye Dön
            </button>
          </div>
        </section>
        <div className="rematch-mascot">
          <Mascot mood="sad" />
          <span>Rövanş?</span>
        </div>
      </div>
    </div>
  );
}
