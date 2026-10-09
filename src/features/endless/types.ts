import type { PieceSymbol, Square } from 'chess.js';
import type { MoveQuality } from '../../types/level';
import type { ActiveEffect, ItemInventory, MoveResolution } from '../../game/items';
import type { PieceSetId } from '../../game/pieceSets';
import type { RunRules } from '../../game/run';

export type Quality = MoveQuality;
/** Perspective of the side making the evaluated move, including Black. */
export type EngineScore = { kind: 'cp' | 'mate'; value: number };
export interface EvaluatedMove { uci: string; score: EngineScore; depth: number }
export interface MoveOption {
    uci: string; san: string; from: Square; to: Square; promotion?: PieceSymbol;
    description: string; quality: Quality; score: EngineScore | null;
}
export interface Thresholds { goodMax: number; inaccurateMax: number }
export const DEFAULT_THRESHOLDS: Thresholds = { goodMax: 50, inaccurateMax: 150 };
export type EndlessMode = 'standard' | 'hardcore';
export interface EndlessSession {
    version: 1; id: string; mode: EndlessMode; set: PieceSetId; rules: RunRules;
    phase: 'analyzing' | 'ready' | 'reveal' | 'between-games' | 'finished';
    pgn: string; optionsFen: string; options: MoveOption[];
    health: number; score: number; basePoints: number; streak: number; longestStreak: number;
    bestChain: number; moves: number; successfulMoves: number; gamesCompleted: number;
    counts: Record<MoveQuality, number>;
    items: ItemInventory; activeEffects: ActiveEffect[];
    lastMove: MoveOption | null; lastResolution: MoveResolution | null; boardResult: string | null;
    /** Captured before offered options are cleared; absent in older saves. */
    lastBestScore?: EngineScore | null;
    startedAt: number; finishedAt: number | null;
}
export interface EndlessRecord {
    id: string; mode: EndlessMode; score: number; longestStreak: number;
    moves: number; gamesCompleted: number; coins: number; finishedAt: number;
}
export interface EndlessSave { version: 1; session: EndlessSession | null; records: EndlessRecord[] }
