import type { SkillTier } from '../config/difficulty.js';

/** JSON contract for a generated file in /src/levels. */
export interface GeneratedLevel {
    /** Stable unique identifier, independent of the filename or difficulty order. */
    id: string;
    schemaVersion: 2;
    /** Legacy generation tag. New files store a profile in generation instead. */
    skillTier?: SkillTier;
    /** ISO 8601 UTC timestamp. */
    generatedAt: string;
    /** Fixed for the entire tree; inferred from the starting FEN's active color. */
    playerColor: Color;
    generation: {
        /** Legacy config version; normalized to profileVersion when loaded. */
        configVersion?: number;
        /** Recipe ID; its number orders intended difficulty within option count. */
        profileId?: string;
        profileVersion?: number;
        /** Target count; forced positions can offer fewer choices. */
        targetOptionCount?: 2 | 4;
        /** Frozen quality recipe so later config edits cannot invalidate a tree. */
        playerQualities?: readonly MoveQuality[];
        /** Generated as a replacement; pending retries must finish old-file cleanup. */
        regenerated?: boolean;
        /** Number of player decisions to generate, defaulting to 4. */
        decisionDepth: number;
        engine: {
            name: 'Stockfish';
            version: string;
            /** Requested Stockfish search depth, distinct from decisionDepth. */
            searchDepth: number;
            /** Requested number of candidate lines for player choices and opponent replies. */
            multiPv: number;
        };
    };
    /** root.fen is the starting FEN; the root may already be terminal. */
    root: TreeNode;
    /** Numeric puzzle rating from 0–100, independent of skill tier. -1 means unscored. */
    difficultyScore: number;
}

export type Color = 'white' | 'black';
export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'bad';

/** All scores use the player's perspective: positive favors the player. */
export type EvaluationScore =
    | { type: 'cp'; value: number }
    | {
          type: 'mate';
          /** UCI mate distance in moves; positive means the player can force mate. */
          value: number;
      };

export interface EngineEvaluation {
    score: EvaluationScore;
    /** Actual completed search depth for this analysis. */
    depth: number;
    /** Principal variation as UCI moves, beginning with the analyzed move. */
    pv: string[];
}

export interface ChessMove {
    /** UCI notation, including a promotion suffix when applicable, e.g. e7e8q. */
    uci: string;
    /** SAN notation for display, e.g. Nf3 or Qh7#. */
    san: string;
}

export type TreeNode = DecisionNode | DepthLimitNode | TerminalNode;

export interface DecisionNode {
    kind: 'decision';
    /** Full FEN at the beginning of this player decision. */
    fen: string;
    /** Number of player decisions already taken along this branch; root is 0. */
    decisionsTaken: number;
    /** Stockfish's best candidate evaluation, useful as a comparison baseline. */
    bestEvaluation: EngineEvaluation;
    choices: PlayerChoice[];
}

export interface PlayerChoice {
    quality: MoveQuality;
    playerMove: ChessMove;
    /** Candidate evaluation from MultiPV at the parent decision position. */
    evaluation: EngineEvaluation;
    /** Position immediately after the player move, before any opponent reply. */
    fenAfterPlayerMove: string;
    /** Null only when the player move ends the game. */
    opponentReply: ChessMove | null;
    /** Position after the opponent reply, or after a terminal player move. */
    next: TreeNode;
}

export interface DepthLimitNode {
    kind: 'depth-limit';
    fen: string;
    decisionsTaken: number;
}

export interface TerminalNode {
    kind: 'terminal';
    fen: string;
    decisionsTaken: number;
    reason: 'checkmate' | 'stalemate' | 'draw';
    /** Winning side, or draw. Independent of which side is the player. */
    result: Color | 'draw';
}
