export type MatchDifficulty = {
  id: 'relaxed' | 'normal' | 'hard';
  label: 'RAHAT' | 'NORMAL' | 'ZORLU';
  durationMultiplier: number;
};

const LEVELS: readonly MatchDifficulty[] = [
  { id: 'relaxed', label: 'RAHAT', durationMultiplier: 1.15 },
  { id: 'normal', label: 'NORMAL', durationMultiplier: 1 },
  { id: 'hard', label: 'ZORLU', durationMultiplier: 0.85 },
];

export function difficultyForRound(completedRoundCount: number): MatchDifficulty {
  const index = Math.max(0, Math.min(LEVELS.length - 1, Math.trunc(completedRoundCount)));
  return LEVELS[index];
}
