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
    daily: { date: string; matches: number; wins: number };
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
      daily: { date: localDateKey(), matches: 0, wins: 0 },
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
        daily:
          stats.daily && typeof stats.daily === 'object' && typeof stats.daily.date === 'string'
            ? {
                date: stats.daily.date,
                matches: safeCount(stats.daily.matches),
                wins: safeCount(stats.daily.wins),
              }
            : fallback.stats.daily,
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
  today = localDateKey(),
): PlayerProfile {
  if (profile.stats.recordedMatchIds.includes(result.matchId)) return profile;
  const won = result.localWins > result.remoteWins;
  const draw = result.localWins === result.remoteWins;
  const currentStreak = won ? profile.stats.currentStreak + 1 : 0;
  const daily =
    profile.stats.daily.date === today ? profile.stats.daily : { date: today, matches: 0, wins: 0 };
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
      daily: {
        ...daily,
        matches: daily.matches + 1,
        wins: daily.wins + Number(won),
      },
    },
  };
}

export type Achievement = {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
};

export function profileAchievements(profile: PlayerProfile): Achievement[] {
  const bestScore = Math.max(0, ...Object.values(profile.stats.bestScores));
  return [
    {
      id: 'first-match',
      icon: '🚀',
      title: 'İlk Adım',
      description: 'İlk online maçını tamamla.',
      unlocked: profile.stats.matchesPlayed >= 1,
    },
    {
      id: 'first-win',
      icon: '👑',
      title: 'İlk Zafer',
      description: 'İlk online maçını kazan.',
      unlocked: profile.stats.wins >= 1,
    },
    {
      id: 'streak-three',
      icon: '🔥',
      title: 'Alev Aldın',
      description: 'Üç maçlık galibiyet serisi yap.',
      unlocked: profile.stats.bestStreak >= 3,
    },
    {
      id: 'veteran',
      icon: '🌈',
      title: 'Müdavim',
      description: '10 online maç tamamla.',
      unlocked: profile.stats.matchesPlayed >= 10,
    },
    {
      id: 'score-fifty',
      icon: '🧊',
      title: 'Puan Ustası',
      description: 'Bir oyunda 50 puana ulaş.',
      unlocked: bestScore >= 50,
    },
  ];
}

export function unlockedAvatars(profile: PlayerProfile): readonly PlayerAvatar[] {
  const unlocked = new Set<PlayerAvatar>(['⚡']);
  for (const achievement of profileAchievements(profile))
    if (achievement.unlocked && AVATARS.includes(achievement.icon as PlayerAvatar))
      unlocked.add(achievement.icon as PlayerAvatar);
  return AVATARS.filter((avatar) => unlocked.has(avatar));
}

export function dailyProgress(
  profile: PlayerProfile,
  today = localDateKey(),
): { current: number; target: number; complete: boolean } {
  const current = profile.stats.daily.date === today ? Math.min(3, profile.stats.daily.matches) : 0;
  return { current, target: 3, complete: current >= 3 };
}

export function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
