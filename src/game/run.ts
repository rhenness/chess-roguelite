import type { ChessMove, GeneratedLevel, MoveQuality, PlayerChoice, TreeNode } from '../types/level';
import { sampleRunLevels, selectSkillTierLevels } from './levels';
import { isSkillTier, SKILL_TIER_CONFIG, type SkillTier } from '../config/difficulty';
import { createCheckpointRewards, validCheckpointRewards, type CheckpointReward } from './checkpointRewards';
import { isItemInventory, itemCount, LOADOUT_LIMIT, resolveItemEffects, type ActiveEffect, type ItemId, type ItemInventory, type ItemUse, type MoveResolution } from './items';

export const QUALITY_LABELS: Record<MoveQuality, string> = {
    best: 'A', good: 'B', inaccuracy: 'C', bad: 'F',
};
export const QUALITY_ORDER: MoveQuality[] = ['best', 'good', 'inaccuracy', 'bad'];
export const BEST_MOVE_STREAK_LENGTH = 4;
export const RUN_LEVEL_COUNT = 10;

export interface RunRules {
    startingHealth: number;
    damage: Record<MoveQuality, number>;
    points: Record<MoveQuality, number>;
}

export const DEFAULT_RULES: RunRules = {
    startingHealth: 3,
    damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
    points: { best: 100, good: 75, inaccuracy: 25, bad: 0 },
};

export interface LevelOutcome {
    id: string;
    difficultyScore: number;
    status: 'completed' | 'failed';
}

export interface RunState {
    id: string;
    skillTier: SkillTier;
    floorCount: number;
    daily?: { day: string; expiresAt: number };
    levels: GeneratedLevel[];
    rules: RunRules;
    levelIndex: number;
    node: TreeNode;
    phase: 'decision' | 'reveal' | 'reply' | 'level-ended' | 'checkpoint' | 'finished';
    result: 'defeat' | 'complete' | null;
    health: number;
    score: number;
    itemBonusPoints: number;
    items: ItemInventory;
    activeEffects: ActiveEffect[];
    itemUses: ItemUse[];
    checkpointRewards: CheckpointReward[];
    lastMoveResolution: MoveResolution | null;
    decisionsMade: number;
    bestMoveStreak: number;
    lastHealthBonus: number;
    moveCounts: Record<MoveQuality, number>;
    levelsCompleted: number;
    highestDifficultyScoreReached: number;
    highestDifficultyScoreCompleted: number | null;
    outcomes: LevelOutcome[];
    lastChoice: PlayerChoice | null;
    history: { levelId: string; playerMove: ChessMove; opponentReply: ChessMove | null }[];
}

function validateRules(rules: RunRules): void {
    if (!Number.isInteger(rules.startingHealth) || rules.startingHealth <= 0) {
        throw new Error('Starting health must be a positive integer.');
    }
    for (const quality of QUALITY_ORDER) {
        if (!Number.isSafeInteger(rules.damage[quality]) || rules.damage[quality] < 0 || !Number.isSafeInteger(rules.points[quality])) {
            throw new Error('Damage and points must be integers, with nonnegative damage for every move quality.');
        }
    }
}

function settleNode(state: RunState): RunState {
    if (state.node.kind === 'decision') return { ...state, phase: 'decision' };
    const level = state.levels[state.levelIndex]!;
    const completed = state.node.kind === 'depth-limit'
        || state.node.result === 'draw' || state.node.result === level.playerColor;
    const earlyMate = state.node.kind === 'terminal' && state.node.reason === 'checkmate'
        && state.node.result === level.playerColor && state.node.decisionsTaken > 0;
    // Credit unplayed decisions as Best points without recording moves or extending the streak.
    const mateBonus = earlyMate
        ? Math.max(0, level.generation.decisionDepth - state.node.decisionsTaken) * state.rules.points.best : 0;
    const lastLevel = state.levelIndex === state.levels.length - 1;
    return {
        ...state,
        score: Math.max(0, state.score + mateBonus),
        items: lastLevel ? {} : state.items,
        activeEffects: lastLevel ? [] : state.activeEffects,
        phase: lastLevel ? 'finished' : 'level-ended',
        result: lastLevel ? 'complete' : null,
        levelsCompleted: state.levelsCompleted + Number(completed),
        highestDifficultyScoreCompleted: completed ? level.difficultyScore : state.highestDifficultyScoreCompleted,
        outcomes: [...state.outcomes, { id: level.id, difficultyScore: level.difficultyScore, status: completed ? 'completed' : 'failed' }],
    };
}

let nextRunId = 0;

export interface RunOptions {
    skillTier?: SkillTier;
    /** Snapshot at entry; saved runs retain this limit if config changes later. */
    floorCount?: number;
}

export function skillTierRules(skillTier: SkillTier): RunRules {
    const rules = SKILL_TIER_CONFIG[skillTier].run.rules;
    return { startingHealth: rules.startingHealth, damage: { ...rules.damage }, points: { ...rules.points } };
}

export function startRun(pool: readonly GeneratedLevel[], rules: RunRules | undefined = undefined, random = Math.random,
    items: ItemInventory = {}, rewards?: CheckpointReward[], options: RunOptions = {}): RunState {
    const skillTier = options.skillTier ?? 'intermediate';
    if (!isSkillTier(skillTier)) throw new Error('Invalid skill tier.');
    rules ??= options.skillTier ? skillTierRules(skillTier) : DEFAULT_RULES;
    validateRules(rules);
    const floorCount = options.floorCount ?? (options.skillTier ? SKILL_TIER_CONFIG[skillTier].run.floorCount : RUN_LEVEL_COUNT);
    if (!Number.isSafeInteger(floorCount) || floorCount <= 0) throw new Error('Invalid floor count.');
    if (!isItemInventory(items) || itemCount(items) > LOADOUT_LIMIT) throw new Error('Invalid item loadout.');
    const levels = sampleRunLevels(options.skillTier ? selectSkillTierLevels(pool, skillTier) : pool, floorCount, random);
    const first = levels[0];
    if (!first) throw new Error('No scored floors are available.');
    const checkpointRewards = rewards ?? createCheckpointRewards(levels.length, random);
    if (!validCheckpointRewards(checkpointRewards, levels.length) || checkpointRewards.some(reward => reward.selected !== null)) {
        throw new Error('Invalid checkpoint rewards.');
    }
    return settleNode({
        id: globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${++nextRunId}`,
        skillTier, floorCount,
        levels, rules: structuredClone(rules), levelIndex: 0, node: first.root, phase: 'decision', result: null,
        health: rules.startingHealth, score: 0, decisionsMade: 0, bestMoveStreak: 0, lastHealthBonus: 0,
        items: { ...items }, activeEffects: [], itemUses: [], itemBonusPoints: 0, lastMoveResolution: null,
        checkpointRewards: structuredClone(checkpointRewards),
        moveCounts: { best: 0, good: 0, inaccuracy: 0, bad: 0 }, levelsCompleted: 0,
        highestDifficultyScoreReached: first.difficultyScore, highestDifficultyScoreCompleted: null, outcomes: [], lastChoice: null, history: [],
    });
}

/** Only a move offered by the current node can change the run. */
export function chooseMove(state: RunState, uci: string): RunState {
    if (state.phase !== 'decision' || state.node.kind !== 'decision') return state;
    const choice = state.node.choices.find(candidate => candidate.playerMove.uci === uci);
    if (!choice) return state;
    const bestMoveStreak = choice.quality === 'best' ? (state.bestMoveStreak ?? 0) + 1 : 0;
    const lastHealthBonus = bestMoveStreak > 0 && bestMoveStreak % BEST_MOVE_STREAK_LENGTH === 0 ? 1 : 0;
    const { resolution, activeEffects } = resolveItemEffects(state.activeEffects, state.rules.points[choice.quality], state.rules.damage[choice.quality], lastHealthBonus);
    const health = Math.max(0, state.health - resolution.damageTaken + lastHealthBonus);
    const score = Math.max(0, state.score + resolution.awardedPoints);
    const unboostedScore = Math.max(0, state.score - state.itemBonusPoints + resolution.normalPoints);
    return {
        ...state, health, bestMoveStreak, lastHealthBonus, score,
        activeEffects: health === 0 ? [] : activeEffects, items: health === 0 ? {} : state.items, lastMoveResolution: resolution,
        itemBonusPoints: score - unboostedScore,
        decisionsMade: state.decisionsMade + 1,
        moveCounts: { ...state.moveCounts, [choice.quality]: state.moveCounts[choice.quality] + 1 },
        lastChoice: choice, phase: health === 0 ? 'finished' : 'reveal', result: health === 0 ? 'defeat' : null,
        history: [...state.history, { levelId: state.levels[state.levelIndex]!.id, playerMove: choice.playerMove, opponentReply: null }],
    };
}

/** Separate playback steps make the player move and stored opponent reply visible. */
export function advancePlayback(state: RunState): RunState {
    if (!state.lastChoice) return state;
    if (state.phase === 'reveal' && state.lastChoice.opponentReply) return {
        ...state, phase: 'reply',
        history: state.history.map((entry, index) => index === state.history.length - 1
            ? { ...entry, opponentReply: state.lastChoice!.opponentReply } : entry),
    };
    if (state.phase !== 'reveal' && state.phase !== 'reply') return state;
    return settleNode({ ...state, node: state.lastChoice.next });
}

export function nextLevel(state: RunState): RunState {
    if (state.phase !== 'level-ended') return state;
    const reward = state.checkpointRewards.find(entry => entry.afterRound === state.levelIndex + 1);
    if (reward && reward.selected === null) return { ...state, phase: 'checkpoint' };
    const levelIndex = state.levelIndex + 1;
    const level = state.levels[levelIndex]!;
    return settleNode({
        ...state, levelIndex, node: level.root, lastChoice: null, lastHealthBonus: 0, lastMoveResolution: null,
        highestDifficultyScoreReached: level.difficultyScore,
    });
}

/** Claim exactly one offered item, then begin the next round without using it. */
export function chooseCheckpointItem(state: RunState, itemId: ItemId): RunState {
    if (state.phase !== 'checkpoint') return state;
    const reward = state.checkpointRewards.find(entry => entry.afterRound === state.levelIndex + 1);
    if (!reward || reward.selected !== null || !reward.offers.includes(itemId)) return state;
    return nextLevel({
        ...state, phase: 'level-ended',
        items: { ...state.items, [itemId]: (state.items[itemId] ?? 0) + 1 },
        checkpointRewards: state.checkpointRewards.map(entry => entry === reward ? { ...entry, selected: itemId } : entry),
    });
}

export function boardFen(state: RunState): string {
    if (state.lastChoice && (state.phase === 'reveal' || state.result === 'defeat')) return state.lastChoice.fenAfterPlayerMove;
    if (state.phase === 'reply' && state.lastChoice) return state.lastChoice.next.fen;
    return state.node.fen;
}

export function shuffleChoices(choices: readonly PlayerChoice[], random = Math.random): PlayerChoice[] {
    const shuffled = [...choices];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
}
