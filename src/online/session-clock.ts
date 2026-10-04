export function estimatedServerNow(clockOffsetMs: number, browserNow = Date.now()): number {
  return browserNow + clockOffsetMs;
}

export function remainingUntilStart(
  startAt: string,
  clockOffsetMs: number,
  browserNow = Date.now(),
): number {
  return Math.max(0, Date.parse(startAt) - estimatedServerNow(clockOffsetMs, browserNow));
}

export function countdownLabel(remainingMs: number): '3' | '2' | '1' | 'BAŞLA!' {
  if (remainingMs <= 0) return 'BAŞLA!';
  return String(Math.min(3, Math.max(1, Math.ceil(remainingMs / 1000)))) as '3' | '2' | '1';
}
