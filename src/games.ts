import { IceBreaker } from './games/ice-breaker';
import { SquatRace } from './games/squat-race';
import { MouthOpenRace } from './games/mouth-open-race';
import { FruitSlice } from './games/fruit-slice';
import { JumpRace } from './games/jump-race';
import { DanceMimic } from './games/dance-mimic';
import { FaceMimic } from './games/face-mimic';
import { MouthCatch } from './games/mouth-catch';
import type { MiniGame } from './types';

export const GAME_IDS = [
  'ice-breaker',
  'squat-race',
  'mouth-open-race',
  'fruit-slice',
  'jump-race',
  'dance-mimic',
  'face-mimic',
  'mouth-catch',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: string | null): value is GameId {
  return value !== null && (GAME_IDS as readonly string[]).includes(value);
}

export function gameIndexById(games: readonly MiniGame[], gameId: GameId): number {
  return games.findIndex((game) => game.id === gameId);
}

export function createGames(): MiniGame[] {
  return [
    new IceBreaker(),
    new SquatRace(),
    new MouthOpenRace(),
    new FruitSlice(),
    new JumpRace(),
    new DanceMimic(),
    new FaceMimic(),
    new MouthCatch(),
  ];
}
