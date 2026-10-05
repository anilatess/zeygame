export type OnlineScoreEvent = {
  kind: 'score';
  roundId: string;
  senderUserId: string;
  playerSlot: 1 | 2;
  score: number;
  sequence: number;
  final: boolean;
};

export type OnlineMediaReadyEvent = {
  kind: 'media-ready';
  senderUserId: string;
  playerSlot: 1 | 2;
  reply?: boolean;
};

export type OnlineSignalEvent = {
  kind: 'webrtc-signal';
  senderUserId: string;
  playerSlot: 1 | 2;
  targetSlot: 1 | 2;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export type OnlineEvent = OnlineScoreEvent | OnlineMediaReadyEvent | OnlineSignalEvent;

export function isOnlineEvent(value: unknown): value is OnlineEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.kind !== 'string' || typeof event.senderUserId !== 'string') return false;
  if (event.playerSlot !== 1 && event.playerSlot !== 2) return false;
  if (event.kind === 'media-ready') return true;
  if (event.kind === 'score')
    return (
      typeof event.roundId === 'string' &&
      typeof event.score === 'number' &&
      Number.isFinite(event.score) &&
      typeof event.sequence === 'number' &&
      typeof event.final === 'boolean'
    );
  return (
    event.kind === 'webrtc-signal' &&
    (event.targetSlot === 1 || event.targetSlot === 2) &&
    (Boolean(event.description) || Boolean(event.candidate))
  );
}
