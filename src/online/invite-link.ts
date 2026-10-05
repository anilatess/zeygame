import { validateRoomCode } from './room-types';

export const ROOM_INVITE_QUERY = 'room';

export function roomCodeFromInvite(search: string): string {
  const value = new URLSearchParams(search).get(ROOM_INVITE_QUERY) ?? '';
  try {
    return validateRoomCode(value);
  } catch {
    return '';
  }
}

export function createRoomInviteUrl(
  roomCode: string,
  location: Location = window.location,
): string {
  const url = new URL(location.href);
  url.searchParams.set(ROOM_INVITE_QUERY, validateRoomCode(roomCode));
  url.hash = '';
  return url.toString();
}
