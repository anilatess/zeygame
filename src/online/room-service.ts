import type { PostgrestError, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import {
  OnlineRoomError,
  type Room,
  type RoomPlayer,
  type RoomSnapshot,
  validateDisplayName,
  validateRoomCode,
} from './room-types';

type RpcRoomResult = { room_id: string; room_code: string; player_id: string; player_slot: 1 | 2 };
type RoomRow = {
  id: string;
  code: string;
  host_user_id: string;
  status: 'waiting' | 'closed';
  expires_at: string;
};
type PlayerRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  player_slot: 1 | 2;
  is_ready: boolean;
  joined_at: string;
};

export const ROOM_RECOVERY_KEY = 'zeygame.online-room.v1';

export async function ensureOnlineUser(): Promise<User> {
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw mapOnlineError(sessionError);
  if (sessionData.session?.user) return sessionData.session.user;
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user)
    throw new OnlineRoomError('auth', 'Online kimlik oluşturulamadı. Tekrar dene.');
  return data.user;
}

export async function createRoom(displayName: string): Promise<RoomSnapshot> {
  const cleanName = validateDisplayName(displayName);
  await ensureOnlineUser();
  const { data, error } = await getSupabaseClient().rpc('create_room', { display_name: cleanName });
  if (error) throw mapOnlineError(error);
  const result = firstRpcRow(data);
  rememberRoom(result.room_id, result.room_code);
  return fetchRoom(result.room_id);
}

export async function joinRoom(code: string, displayName: string): Promise<RoomSnapshot> {
  const cleanCode = validateRoomCode(code);
  const cleanName = validateDisplayName(displayName);
  await ensureOnlineUser();
  const { data, error } = await getSupabaseClient().rpc('join_room', {
    room_code: cleanCode,
    display_name: cleanName,
  });
  if (error) throw mapOnlineError(error);
  const result = firstRpcRow(data);
  rememberRoom(result.room_id, result.room_code);
  return fetchRoom(result.room_id);
}

export async function fetchRoom(roomId: string): Promise<RoomSnapshot> {
  const client = getSupabaseClient();
  const user = await ensureOnlineUser();
  const [roomResult, playersResult] = await Promise.all([
    client.from('rooms').select('id,code,host_user_id,status,expires_at').eq('id', roomId).single(),
    client
      .from('room_players')
      .select('id,room_id,user_id,display_name,player_slot,is_ready,joined_at')
      .eq('room_id', roomId)
      .order('player_slot'),
  ]);
  if (roomResult.error) throw mapOnlineError(roomResult.error);
  if (playersResult.error) throw mapOnlineError(playersResult.error);
  const room = toRoom(roomResult.data as RoomRow);
  const players = (playersResult.data as PlayerRow[]).map(toPlayer);
  if (!players.some((player) => player.userId === user.id))
    throw new OnlineRoomError('not-member', 'Bu odanın üyesi değilsin.');
  return { room, players, currentUserId: user.id };
}

export async function recoverRoom(): Promise<RoomSnapshot | null> {
  const saved = readRememberedRoom();
  if (!saved) return null;
  try {
    const snapshot = await fetchRoom(saved.roomId);
    return snapshot;
  } catch (error) {
    if (error instanceof OnlineRoomError && ['not-found', 'not-member'].includes(error.kind)) {
      forgetRoom();
      return null;
    }
    throw error;
  }
}

export async function setReady(roomId: string, ready: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_room_ready', { room_id: roomId, ready });
  if (error) throw mapOnlineError(error);
}

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('leave_room', { room_id: roomId });
  forgetRoom();
  if (error) throw mapOnlineError(error);
}

export function forgetRoom(): void {
  localStorage.removeItem(ROOM_RECOVERY_KEY);
}

function rememberRoom(roomId: string, roomCode: string): void {
  localStorage.setItem(ROOM_RECOVERY_KEY, JSON.stringify({ roomId, roomCode }));
}

function readRememberedRoom(): { roomId: string; roomCode: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(ROOM_RECOVERY_KEY) ?? 'null') as unknown;
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.roomId === 'string' && typeof candidate.roomCode === 'string'
      ? { roomId: candidate.roomId, roomCode: candidate.roomCode }
      : null;
  } catch {
    forgetRoom();
    return null;
  }
}

function firstRpcRow(data: unknown): RpcRoomResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object')
    throw new OnlineRoomError('unknown', 'Oda yanıtı alınamadı.');
  return row as RpcRoomResult;
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    hostUserId: row.host_user_id,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

function toPlayer(row: PlayerRow): RoomPlayer {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    playerSlot: row.player_slot,
    isReady: row.is_ready,
    joinedAt: row.joined_at,
  };
}

export function mapOnlineError(
  error: Pick<PostgrestError, 'code' | 'message'> | Error,
): OnlineRoomError {
  const message = error.message ?? '';
  if (error instanceof OnlineRoomError) return error;
  if (message.includes('ROOM_NOT_FOUND') || ('code' in error && error.code === 'PGRST116'))
    return new OnlineRoomError('not-found', 'Bu oda bulunamadı.');
  if (message.includes('ROOM_FULL') || ('code' in error && error.code === '23505'))
    return new OnlineRoomError('full', 'Bu oda dolu!');
  if (message.includes('ROOM_CLOSED'))
    return new OnlineRoomError('closed', 'Bu oda artık aktif değil.');
  if (message.includes('ROOM_EXPIRED'))
    return new OnlineRoomError('expired', 'Bu odanın süresi dolmuş.');
  if (message.includes('INVALID_ROOM_CODE'))
    return new OnlineRoomError('invalid-code', '6 haneli oda kodunu kontrol et.');
  if (message.includes('INVALID_DISPLAY_NAME'))
    return new OnlineRoomError('invalid-name', 'Adın 1–20 karakter arasında olmalı.');
  if (message.includes('NOT_A_ROOM_MEMBER'))
    return new OnlineRoomError('not-member', 'Bu odanın üyesi değilsin.');
  if (message.includes('AUTH_REQUIRED'))
    return new OnlineRoomError('auth', 'Online oturum oluşturulamadı.');
  if (message.includes('Failed to fetch') || message.includes('NetworkError'))
    return new OnlineRoomError('network', 'Bağlantı kurulamadı. İnternetini kontrol et.');
  return new OnlineRoomError('unknown', 'Bir şey ters gitti. Lütfen tekrar dene.');
}
