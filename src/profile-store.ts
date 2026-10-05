import type { GameId } from './games';

export const PROFILE_STORAGE_KEY = 'zeygame.player-profile.v1';
export const AVATARS = ['⚡', '🚀', '👑', '🔥', '🌈', '🧊'] as const;
export type PlayerAvatar = (typeof AVATARS)[number];

export type PlayerProfile = {
  displayName: string;
  avatar: PlayerAvatar;
  stats: {
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    currentStreak: number;
    bestStreak: number;
    bestScores: Partial<Record<GameId, number>>;
    recordedMatchIds: string[];
  };
};

export type OnlineMatchResult = {
  matchId: string;
  gameId: GameId;
  localWins: number;
  remoteWins: number;
  bestScore: number;
};

export function defaultPlayerProfile(): PlayerProfile {
  return {
    displayName: '',
    avatar: '⚡',
    stats: {
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestScores: {},
      recordedMatchIds: [],
    },
  };
}

export function loadPlayerProfile(storage: Storage = localStorage): PlayerProfile {
  try {
    const saved = JSON.parse(
      storage.getItem(PROFILE_STORAGE_KEY) ?? 'null',
    ) as Partial<PlayerProfile>;
    const fallback = defaultPlayerProfile();
    if (!saved || typeof saved !== 'object') return fallback;
    const stats = saved.stats && typeof saved.stats === 'object' ? saved.stats : fallback.stats;
    return {
      displayName: typeof saved.displayName === 'string' ? saved.displayName.slice(0, 20) : '',
      avatar: AVATARS.includes(saved.avatar as PlayerAvatar)
        ? (saved.avatar as PlayerAvatar)
        : '⚡',
      stats: {
        matchesPlayed: safeCount(stats.matchesPlayed),
        wins: safeCount(stats.wins),
        draws: safeCount(stats.draws),
        losses: safeCount(stats.losses),
        currentStreak: safeCount(stats.currentStreak),
        bestStreak: safeCount(stats.bestStreak),
        bestScores:
          stats.bestScores && typeof stats.bestScores === 'object' ? stats.bestScores : {},
        recordedMatchIds: Array.isArray(stats.recordedMatchIds)
          ? stats.recordedMatchIds.filter((id): id is string => typeof id === 'string').slice(-50)
          : [],
      },
    };
  } catch {
    return defaultPlayerProfile();
  }
}

export function savePlayerProfile(profile: PlayerProfile, storage: Storage = localStorage): void {
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function recordOnlineMatch(
  profile: PlayerProfile,
  result: OnlineMatchResult,
): PlayerProfile {
  if (profile.stats.recordedMatchIds.includes(result.matchId)) return profile;
  const won = result.localWins > result.remoteWins;
  const draw = result.localWins === result.remoteWins;
  const currentStreak = won ? profile.stats.currentStreak + 1 : 0;
  return {
    ...profile,
    stats: {
      ...profile.stats,
      matchesPlayed: profile.stats.matchesPlayed + 1,
      wins: profile.stats.wins + Number(won),
      draws: profile.stats.draws + Number(draw),
      losses: profile.stats.losses + Number(!won && !draw),
      currentStreak,
      bestStreak: Math.max(profile.stats.bestStreak, currentStreak),
      bestScores: {
        ...profile.stats.bestScores,
        [result.gameId]: Math.max(profile.stats.bestScores[result.gameId] ?? 0, result.bestScore),
      },
      recordedMatchIds: [...profile.stats.recordedMatchIds, result.matchId].slice(-50),
    },
  };
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
