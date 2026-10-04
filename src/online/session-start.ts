import type { GameId } from '../games';

export type CountdownMeasurement = { roundId: string; remainingMs: number };

export function canConfirmPlaying({
  host,
  sessionState,
  roundId,
  measurement,
  confirmedRoundId,
  confirmingRoundId,
}: {
  host: boolean;
  sessionState: string;
  roundId: string | null;
  measurement: CountdownMeasurement | null;
  confirmedRoundId: string | null;
  confirmingRoundId: string | null;
}): boolean {
  return Boolean(
    host &&
    roundId &&
    sessionState === 'countdown' &&
    measurement?.roundId === roundId &&
    measurement.remainingMs <= 0 &&
    confirmedRoundId !== roundId &&
    confirmingRoundId !== roundId,
  );
}

export function onlineEngineSessionKey(roundId: string, gameId: GameId): string {
  return `${roundId}:${gameId}`;
}

export function shouldStartOnlineEngine({
  activeSession,
  cameraPrepared,
  startAt,
  roundId,
  gameId,
  preparedGameId,
  startedSessionKey,
}: {
  activeSession: boolean;
  cameraPrepared: boolean;
  startAt: string | null;
  roundId: string | null;
  gameId: GameId | null;
  preparedGameId: GameId | null;
  startedSessionKey: string | null;
}): boolean {
  if (!activeSession || !cameraPrepared || !startAt || !roundId || !gameId) return false;
  return preparedGameId === gameId && startedSessionKey !== onlineEngineSessionKey(roundId, gameId);
}
