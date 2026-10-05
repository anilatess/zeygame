import type { RoundScore } from './room-types';

export type CompletedRound = {
  roundId: string;
  scoreOne: number;
  scoreTwo: number;
  winner: 0 | 1 | 2;
  finishedAt: string;
};

export type MatchScore = {
  rounds: CompletedRound[];
  winsOne: number;
  winsTwo: number;
  draws: number;
  complete: boolean;
};

export function calculateMatchScore(scores: RoundScore[], bestOf = 3): MatchScore {
  const grouped = new Map<string, RoundScore[]>();
  for (const score of scores) {
    if (!score.isFinal) continue;
    const entries = grouped.get(score.roundId) ?? [];
    entries.push(score);
    grouped.set(score.roundId, entries);
  }

  const rounds = [...grouped.entries()]
    .flatMap(([roundId, entries]) => {
      const one = entries.find((entry) => entry.playerSlot === 1);
      const two = entries.find((entry) => entry.playerSlot === 2);
      if (!one || !two) return [];
      return [
        {
          roundId,
          scoreOne: one.score,
          scoreTwo: two.score,
          winner: one.score === two.score ? 0 : one.score > two.score ? 1 : 2,
          finishedAt: one.updatedAt > two.updatedAt ? one.updatedAt : two.updatedAt,
        } satisfies CompletedRound,
      ];
    })
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))
    .slice(0, bestOf);

  return {
    rounds,
    winsOne: rounds.filter((round) => round.winner === 1).length,
    winsTwo: rounds.filter((round) => round.winner === 2).length,
    draws: rounds.filter((round) => round.winner === 0).length,
    complete: rounds.length >= bestOf,
  };
}
