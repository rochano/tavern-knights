// API contract shared by the Angular client and the Hono server. Keep both sides on these types.

export type BoardId = 'stage1_score' | 'stage1_time' | 'tavern_gold';
export type Period = 'week' | 'all';

/** Lower is better only for times. */
export const BOARDS: Record<BoardId, { desc: boolean }> = {
  stage1_score: { desc: true },
  stage1_time: { desc: false },
  tavern_gold: { desc: true },
};

/** Plausibility limits (score = 100 per monster, 500 per mimic, 20/50 per pickup, 5000 for the boss). */
export const LIMITS = {
  stage1: { minMs: 45000, maxMs: 3600000, maxKills: 200, maxScore: 5000 + 200 * 500 + 6000 },
  tavern: { minMs: 70000, maxMs: 900000, maxGold: 600 },
} as const;

export interface Player { id: string; name: string }
export interface ApiError { ok: false; error: string }

export interface GuestResponse { ok: true; player: Player; token: string }
export interface MeResponse { ok: true; player: Player }
export interface RunStartRequest { mode: 'stage' | 'tavern'; v?: string }
export interface RunStartResponse { ok: true; run: { id: string; seed: number } }
export interface RunFinishRequest { run: string; score?: number; timeMs?: number; kills?: number; gold?: number; ai?: boolean }
export interface BoardResult { best: number; newBest: boolean; rank: number }
export type RunFinishResponse =
  | { ok: true; accepted: false; reason: string }
  | { ok: true; accepted: true; boards: Partial<Record<BoardId, { week: BoardResult; all: BoardResult }>> };
export interface BoardRow { rank: number; name: string; value: number; me: boolean }
export interface BoardResponse { ok: true; board: BoardId; period: Period; week: string; rows: BoardRow[]; me: { value: number; rank: number } | null }
export interface HealthResponse { ok: true; db: boolean; week: string }
