import { IceBreaker } from './games/ice-breaker';
import { SquatRace } from './games/squat-race';
import { MouthOpenRace } from './games/mouth-open-race';
import { FruitSlice } from './games/fruit-slice';
import { JumpRace } from './games/jump-race';
import { DanceMimic } from './games/dance-mimic';
import { FaceMimic } from './games/face-mimic';
import { MouthCatch } from './games/mouth-catch';

export function createGames() {
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
