import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../lib/supabase';
import { createRoom, fetchRoom, joinRoom, leaveRoom, recoverRoom, setReady } from './room-service';
import { subscribeToRoom } from './room-realtime';
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
  const [busy, setBusy] = useState<OnlineBusyAction>(hasSupabaseConfig() ? 'recovering' : null);
  const [error, setError] = useState(
    hasSupabaseConfig() ? '' : 'Online mod için Supabase ayarları eksik.',
  );
  const mounted = useRef(true);
  const busyRef = useRef(false);

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
      .then((room) => {
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
  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await fetchRoom(roomId);
      if (mounted.current) {
        setSnapshot(next);
        if (next.room.status === 'closed') setError('Ev sahibi odadan ayrıldı.');
      }
    } catch (reason) {
      if (mounted.current) applyError(reason);
    }
  }, [applyError, roomId]);

  useEffect(() => {
    if (!roomId || !currentUserId) return;
    return subscribeToRoom(roomId, currentUserId, {
      onRoomChanged: () => void refresh(),
      onPresenceChanged: setPresence,
      onConnectionChanged: setConnected,
    });
  }, [currentUserId, refresh, roomId]);

  const run = useCallback(
    async (action: Exclude<OnlineBusyAction, 'recovering' | null>, task: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(action);
      setError('');
      try {
        await task();
      } catch (reason) {
        applyError(reason);
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
    busy,
    error,
    configured: hasSupabaseConfig(),
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
