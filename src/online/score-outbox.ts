export type PendingScore = {
  roomId: string;
  roundId: string;
  userId: string;
  score: number;
  sequence: number;
  final: boolean;
};

const STORAGE_KEY = 'zeygame.pending-score.v1';

/** Keep the latest unacknowledged score, including across a page reload. */
export class ScoreOutbox {
  private pending: PendingScore | null = null;
  private inFlight = false;
  private scope = '';
  private sequence = 0;

  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    try {
      const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      if (
        value &&
        typeof value.roomId === 'string' &&
        typeof value.roundId === 'string' &&
        typeof value.userId === 'string' &&
        Number.isFinite(value.score) &&
        Number.isInteger(value.sequence) &&
        typeof value.final === 'boolean'
      )
        this.pending = value;
    } catch {
      /* Storage is optional; in-memory retries still work. */
    }
  }

  setScope(roomId: string, roundId: string | null, userId: string): void {
    const scope = `${roomId}:${roundId}:${userId}`;
    if (scope !== this.scope) this.sequence = 0;
    this.scope = scope;
    if (this.pending && this.key(this.pending) !== this.scope) {
      this.pending = null;
      this.persist();
    }
    this.sequence = Math.max(this.sequence, this.pending?.sequence ?? 0);
  }

  enqueue(score: PendingScore): void {
    if (this.key(score) !== this.scope) return;
    if (this.pending?.final || (this.pending && this.pending.sequence > score.sequence)) return;
    this.pending = score;
    this.sequence = Math.max(this.sequence, score.sequence);
    this.persist();
  }

  getSequence(): number {
    return this.sequence;
  }
  hasPending(): boolean {
    return this.pending !== null;
  }

  async flush(send: (score: PendingScore) => Promise<void>): Promise<boolean> {
    if (this.inFlight || !this.pending || this.key(this.pending) !== this.scope) return false;
    this.inFlight = true;
    const score = this.pending;
    try {
      await send(score);
      if (this.pending === score) {
        this.pending = null;
        this.persist();
      }
      return true;
    } finally {
      this.inFlight = false;
    }
  }

  private key(score: PendingScore): string {
    return `${score.roomId}:${score.roundId}:${score.userId}`;
  }
  private persist(): void {
    try {
      if (this.pending) this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.pending));
      else this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* Private browsing/quota failures must not interrupt the game. */
    }
  }
}
