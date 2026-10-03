import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import type { PresenceState } from './room-types';

type PresencePayload = { userId?: string; onlineAt?: string };

export function subscribeToRoom(
  roomId: string,
  userId: string,
  callbacks: {
    onRoomChanged: () => void;
    onPresenceChanged: (presence: PresenceState) => void;
    onConnectionChanged: (connected: boolean) => void;
  },
): () => void {
  const client = getSupabaseClient();
  const topic = `room:${roomId}`;
  const channel: RealtimeChannel = client.channel(topic, {
    config: { private: true, presence: { key: userId } },
  });

  const syncPresence = () => {
    const next: PresenceState = {};
    for (const entries of Object.values(channel.presenceState<PresencePayload>())) {
      for (const entry of entries) if (entry.userId) next[entry.userId] = true;
    }
    callbacks.onPresenceChanged(next);
  };

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      callbacks.onRoomChanged,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      callbacks.onRoomChanged,
    )
    .on('presence', { event: 'sync' }, syncPresence)
    .subscribe(async (status) => {
      const connected = status === 'SUBSCRIBED';
      callbacks.onConnectionChanged(connected);
      if (connected) await channel.track({ userId, onlineAt: new Date().toISOString() });
    });

  return () => {
    void channel.untrack();
    void client.removeChannel(channel);
  };
}
