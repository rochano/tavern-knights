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

/* ---------------------------------------------------------------- shop + AI advisor (full version only) */
// One premium currency (working name "Dragon Coins"). Coins live only in the server ledger; the client never
// decides a balance. Real-money coin packs come with in-app payments (phase 4); until then the develop site
// can grant test coins.

export type ShopKind = 'look' | 'gold' | 'crate';
export interface ShopItem {
  id: string;
  kind: ShopKind;
  /** Thai name; the client translates it with tr() */
  th: string;
  /** coins */
  price: number;
  /** a look can be bought once; gold and crates can be bought again */
  once: boolean;
  /** look: outfit tier art to wear (2-5); gold: gold added; crate: ingredients added */
  look?: number;
  gold?: number;
  ing?: Record<string, number>;
}

/** The catalog. Looks are cosmetic only (they reuse the upgrade outfit art, no stats). */
export const SHOP: ShopItem[] = [
  { id: 'look2', kind: 'look', th: 'ชุดอัศวินเหล็ก', price: 20, once: true, look: 2 },
  { id: 'look3', kind: 'look', th: 'ชุดเกราะมังกร', price: 40, once: true, look: 3 },
  { id: 'look4', kind: 'look', th: 'ชุดราชองครักษ์', price: 60, once: true, look: 4 },
  { id: 'look5', kind: 'look', th: 'ชุดมาสเตอร์เชฟ', price: 100, once: true, look: 5 },
  { id: 'gold150', kind: 'gold', th: 'ถุงทอง 150g', price: 10, once: false, gold: 150 },
  { id: 'crate1', kind: 'crate', th: 'ลังวัตถุดิบ', price: 15, once: false, ing: { glowcap: 2, truffle: 1, chili: 1 } },
];

/** Coins per advisor question: a short hint or a full coaching answer. */
export const AI_COST = { hint: 1, coach: 5 } as const;
export type AiMode = keyof typeof AI_COST;

export interface Grant { id: string; item: string; at: number }
export interface WalletResponse { ok: true; coins: number; owned: string[]; grants: Grant[]; ai: boolean; dev: boolean }
export interface BuyRequest { item: string }
export interface BuyResponse { ok: true; coins: number; grant: Grant }
/** Player progress sent with a question so the advisor can give advice that fits. */
export interface AiContext { lang: 'th' | 'en'; gold?: number; stages?: Record<string, { stars: number; hearts: number }>; up?: Record<string, number | boolean>; ing?: Record<string, number>; crew?: string[]; runs?: number }
export interface AskRequest { mode: AiMode; question: string; ctx: AiContext }
export interface AskResponse { ok: true; coins: number; answer: string }
