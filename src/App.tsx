import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameHost } from './components/GameHost';
import { InfoScreen, MainMenu, type MenuScreen } from './components/MenuScreens';
import type { GameController } from './game-controller';
import { createGames } from './games';
import { activateServiceWorkerUpdate, registerServiceWorker } from './service-worker';
import type { GameMode, MiniGame } from './types';
import {
  loadPlayerProfile,
  recordOnlineMatch,
  savePlayerProfile,
  type OnlineMatchResult,
  type PlayerProfile,
} from './profile-store';

export default function App() {
  const games = useMemo<MiniGame[]>(() => createGames(), []);
  const controllerRef = useRef<GameController | null>(null);
  const [screen, setScreen] = useState<MenuScreen | 'game'>('menu');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [profile, setProfile] = useState(loadPlayerProfile);
  const updateRequested = useRef(false);

  useEffect(() => {
    registerServiceWorker(setWaitingWorker);
    const reload = () => {
      if (updateRequested.current) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', reload);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', reload);
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && screen !== 'menu' && screen !== 'game') returnToMenu();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);

  const startSession = async (mode: GameMode, selectedIndex?: number) => {
    if (busy) return;
    const controller = controllerRef.current;
    if (!controller) {
      setStatus('Oyun sistemi hazırlanamadı. Sayfayı yenileyip tekrar deneyin.');
      return;
    }
    setBusy(true);
    setStatus('⏳ Kamera izni bekleniyor…');
    try {
      const prepared = await controller.prepare(mode, selectedIndex);
      if (!prepared) return;
      setScreen('game');
      setStatus('');
      requestAnimationFrame(() => controller.run());
    } catch (error) {
      const message =
        error instanceof Object && 'message' in error
          ? String(error.message)
          : 'Kamera başlatılamadı. İzinleri kontrol edin.';
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const returnToMenu = () => {
    controllerRef.current?.stop();
    setStatus('');
    setBusy(false);
    setScreen('menu');
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus(),
    );
  };

  const chooseAnother = () => {
    const controller = controllerRef.current;
    const manager = controller?.getManager();
    const selectedIndex = manager ? games.indexOf(manager.getCurrentGame()) : 0;
    const target = manager?.isSoloTest() ? 'solo-test' : 'select';
    controller?.stop();
    setStatus('');
    setScreen(target);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-game-index="${selectedIndex}"]`)?.focus(),
    );
  };

  const updateProfile = useCallback((next: PlayerProfile) => {
    savePlayerProfile(next);
    setProfile(next);
  }, []);

  const recordMatch = useCallback((result: OnlineMatchResult) => {
    setProfile((current) => {
      const next = recordOnlineMatch(current, result);
      if (next !== current) savePlayerProfile(next);
      return next;
    });
  }, []);

  return (
    <>
      <section className="app" hidden={screen === 'game'}>
        {screen === 'game' ? null : screen === 'menu' ? (
          <MainMenu
            gameCount={games.length}
            status={status}
            busy={busy}
            profile={profile}
            onNavigate={(next) => {
              setStatus('');
              setScreen(next);
            }}
            onStartParty={() => void startSession('party')}
          />
        ) : (
          <InfoScreen
            kind={screen}
            games={games}
            status={status}
            busy={busy}
            profile={profile}
            onProfileChange={updateProfile}
            onOnlineMatchComplete={recordMatch}
            onBack={returnToMenu}
            onPlay={(index, solo) => void startSession(solo ? 'solo-test' : 'single', index)}
          />
        )}
      </section>
      <GameHost
        controllerRef={controllerRef}
        games={games}
        visible={screen === 'game'}
        onHome={returnToMenu}
        onChooseAnother={chooseAnother}
      />
      <div className="update-notice" role="status" aria-live="polite" hidden={!waitingWorker}>
        <span>Yeni sürüm hazır — Yenile</span>
        <button
          data-action="update"
          onClick={() => {
            if (!waitingWorker) return;
            updateRequested.current = true;
            activateServiceWorkerUpdate(waitingWorker);
          }}
        >
          Yenile
        </button>
      </div>
    </>
  );
}
