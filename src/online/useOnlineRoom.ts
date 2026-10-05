import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../lib/supabase';
import type { GameId } from '../games';
import {
  confirmRoomPlaying,
  createRoom,
  fetchRoom,
  finishRoomGame,
  getServerClockOffset,
  joinRoom,
  leaveRoom,
  recoverRoom,
  resetRoomSession,
  selectRoomGame,
  setReady,
  startRoomGame,
  submitRoundScore,
} from './room-service';
import { subscribeToRoom } from './room-realtime';
import { ScoreOutbox } from './score-outbox';
import type { OnlineEvent } from './online-events';
import {
  OnlineRoomError,
  type OnlineBusyAction,
  type PresenceState,
  type RoomSnapshot,
} from './room-types';

export function useOnlineRoom() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [presence, setPresence] = useState<PresenceState>({});
  const [connected, setConnected] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [busy, setBusy] = useState<OnlineBusyAction>(hasSupabaseConfig() ? 'recovering' : null);
  const [error, setError] = useState(
    hasSupabaseConfig() ? '' : 'Online mod için Supabase ayarları eksik.',
  );
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const sendEventRef = useRef<((event: OnlineEvent) => Promise<void>) | null>(null);
  const eventSubscribers = useRef(new Set<(event: OnlineEvent) => void>());
  const outbox = useRef<ScoreOutbox | null>(null);
  if (!outbox.current) {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* Storage can be disabled. */
    }
    outbox.current = new ScoreOutbox(storage);
  }
  const [scorePending, setScorePending] = useState(false);
  const flushScores = useCallback(async () => {
    try {
      await outbox.current!.flush((score) =>
        submitRoundScore(score.roomId, score.roundId, score.score, score.sequence, score.final),
      );
    } catch {
      /* Retained for the next connection event or retry interval. */
    }
    if (mounted.current) setScorePending(outbox.current!.hasPending());
  }, []);

  const applyError = useCallback((reason: unknown) => {
    setError(
      reason instanceof OnlineRoomError ? reason.message : 'Bir şey ters gitti. Tekrar dene.',
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!hasSupabaseConfig())
      return () => {
        mounted.current = false;
      };
    void recoverRoom()
      .then(async (room) => {
        if (room?.room.startAt && room.room.sessionState !== 'waiting') {
          try {
            setClockOffsetMs(await getServerClockOffset());
          } catch {
            // The room can still recover with the browser clock as fallback.
          }
        }
        if (mounted.current) setSnapshot(room);
      })
      .catch(applyError)
      .finally(() => {
        if (mounted.current) setBusy(null);
      });
    return () => {
      mounted.current = false;
    };
  }, [applyError]);

  const roomId = snapshot?.room.id;
  const currentUserId = snapshot?.currentUserId;
  const roundId = snapshot?.room.roundId;
  useEffect(() => {
    if (!roomId || !currentUserId) return;
    outbox.current!.setScope(roomId, roundId ?? null, currentUserId);
    void flushScores();
    const timer = window.setInterval(() => void flushScores(), 1500);
    const retry = () => void flushScores();
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [roomId, roundId, currentUserId, flushScores]);
  const acceptSnapshot = useCallback(async (next: RoomSnapshot | null) => {
    if (next?.room.startAt && next.room.sessionState !== 'waiting') {
      try {
        setClockOffsetMs(await getServerClockOffset());
      } catch {
        // The absolute server timestamp remains usable; browser clock is the fallback.
      }
    }
    if (mounted.current) setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await fetchRoom(roomId);
      if (mounted.current) {
        await acceptSnapshot(next);
        if (next.room.status === 'closed') setError('Ev sahibi odadan ayrıldı.');
      }
    } catch (reason) {
      if (mounted.current) applyError(reason);
    }
  }, [acceptSnapshot, applyError, roomId]);

  useEffect(() => {
    if (!roomId || !currentUserId) return;
    const realtime = subscribeToRoom(roomId, currentUserId, {
      onRoomChanged: () => void refresh(),
      onPresenceChanged: setPresence,
      onConnectionChanged: (nextConnected) => {
        setConnected(nextConnected);
        if (nextConnected) void refresh();
      },
      onEvent: (event) => {
        if (event.senderUserId === currentUserId) return;
        for (const subscriber of eventSubscribers.current) subscriber(event);
      },
    });
    sendEventRef.current = realtime.send;
    return () => {
      sendEventRef.current = null;
      realtime.unsubscribe();
    };
  }, [currentUserId, refresh, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const recoverConnection = () => void refresh();
    const recoverVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', recoverConnection);
    document.addEventListener('visibilitychange', recoverVisibility);
    return () => {
      window.removeEventListener('online', recoverConnection);
      document.removeEventListener('visibilitychange', recoverVisibility);
    };
  }, [refresh, roomId]);

  const sendEvent = useCallback(async (event: OnlineEvent) => {
    const send = sendEventRef.current;
    if (!send) throw new OnlineRoomError('network', 'Canlı bağlantı henüz hazır değil.');
    await send(event);
  }, []);

  const subscribeEvent = useCallback((listener: (event: OnlineEvent) => void) => {
    eventSubscribers.current.add(listener);
    return () => {
      eventSubscribers.current.delete(listener);
    };
  }, []);

  const run = useCallback(
    async (
      action: Exclude<OnlineBusyAction, 'recovering' | null>,
      task: () => Promise<void>,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(action);
      setError('');
      try {
        await task();
        return true;
      } catch (reason) {
        applyError(reason);
        return false;
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(null);
      }
    },
    [applyError],
  );

  return {
    snapshot,
    presence,
    connected,
    scorePending,
    clockOffsetMs,
    busy,
    error,
    configured: hasSupabaseConfig(),
    sendEvent,
    subscribeEvent,
    publishScore: async (
      roundId: string,
      playerSlot: 1 | 2,
      score: number,
      sequence: number,
      final: boolean,
    ) => {
      if (!snapshot) return;
      const event: OnlineEvent = {
        kind: 'score',
        roundId,
        senderUserId: snapshot.currentUserId,
        playerSlot,
        score,
        sequence,
        final,
      };
      const queue = outbox.current!;
      queue.setScope(snapshot.room.id, roundId, snapshot.currentUserId);
      const nextSequence = Math.max(sequence, queue.getSequence() + 1);
      queue.enqueue({
        roomId: snapshot.room.id,
        roundId,
        userId: snapshot.currentUserId,
        score,
        sequence: nextSequence,
        final,
      });
      setScorePending(queue.hasPending());
      // Persistence is authoritative; a failed Broadcast must not block its retry.
      void sendEvent({ ...event, sequence: nextSequence }).catch(() => undefined);
      await flushScores();
    },
    create: (name: string) => run('creating', async () => setSnapshot(await createRoom(name))),
    join: (code: string, name: string) =>
      run('joining', async () => setSnapshot(await joinRoom(code, name))),
    toggleReady: () =>
      run('ready', async () => {
        if (!snapshot) return;
        const self = snapshot.players.find((player) => player.userId === snapshot.currentUserId);
        if (!self) return;
        await setReady(snapshot.room.id, !self.isReady);
        await refresh();
      }),
    selectGame: (gameId: GameId) =>
      run('selecting', async () => {
        if (!snapshot) return;
        await selectRoomGame(snapshot.room.id, gameId);
        await refresh();
      }),
    startGame: () =>
      run('starting', async () => {
        if (!snapshot) return;
        const result = await startRoomGame(snapshot.room.id);
        setClockOffsetMs(Date.parse(result.serverNow) - Date.now());
        await refresh();
      }),
    confirmPlaying: (roundId: string) =>
      run('starting', async () => {
        if (!snapshot) return;
        await confirmRoomPlaying(snapshot.room.id, roundId);
        await refresh();
      }),
    finishGame: (roundId: string) =>
      run('finishing', async () => {
        if (!snapshot) return;
        await finishRoomGame(snapshot.room.id, roundId);
        await refresh();
      }),
    resetSession: () =>
      run('resetting', async () => {
        if (!snapshot) return;
        await resetRoomSession(snapshot.room.id);
        await refresh();
      }),
    leave: () =>
      run('leaving', async () => {
        if (!snapshot) return;
        await leaveRoom(snapshot.room.id);
        setSnapshot(null);
        setPresence({});
        setConnected(false);
      }),
    clearError: () => setError(''),
  };
}
