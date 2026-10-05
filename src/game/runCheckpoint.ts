import type { GeneratedLevel } from '../types/level';
import { activateItem, isItemId, LOADOUT_LIMIT, type ItemInventory, type ItemUse } from './items';
import { advancePlayback, chooseCheckpointItem, chooseMove, nextLevel, startRun, type RunRules, type RunState } from './run';
import { validCheckpointRewards, type CheckpointReward } from './checkpointRewards';

export interface RunCheckpoint {
    moves: { levelId: string; uci: string }[];
    itemUses?: ItemUse[];
    checkpointRewards?: CheckpointReward[];
    levelIndex: number;
    phase: RunState['phase'];
}

export const checkpointRun = (run: RunState): RunCheckpoint => ({
    moves: run.history.map(move => ({ levelId: move.levelId, uci: move.playerMove.uci })),
    itemUses: run.itemUses.map(use => ({ ...use })),
    checkpointRewards: structuredClone(run.checkpointRewards),
    levelIndex: run.levelIndex, phase: run.phase,
});

/** Reconstruct gameplay from offered moves and item activations, never saved totals or tree nodes. */
export function restoreRunCheckpoint(levels: readonly GeneratedLevel[], rules: RunRules,
    items: ItemInventory, checkpoint: RunCheckpoint): RunState {
    const rewards = checkpoint.checkpointRewards ?? [];
    if (!validCheckpointRewards(rewards, levels.length)) throw new Error('Invalid saved rewards.');
    let run = startRun(levels, rules, Math.random, items, rewards.map(reward => ({ ...reward, selected: null })));
    const moves = checkpoint.moves;
    const uses = checkpoint.itemUses ?? [];
    if (!Array.isArray(moves) || !Array.isArray(uses)
        || uses.length > LOADOUT_LIMIT + rewards.filter(reward => reward.selected !== null).length) throw new Error('Invalid saved checkpoint.');
    let useIndex = 0;
    function replayItems() {
        while (useIndex < uses.length && uses[useIndex]!.beforeDecision === run.decisionsMade) {
            const use = uses[useIndex]!;
            if (!isItemId(use.itemId) || use.levelIndex !== run.levelIndex) throw new Error('Invalid saved item.');
            const next = activateItem(run, use.itemId);
            if (next === run) throw new Error('Invalid saved item activation.');
            run = next;
            useIndex++;
        }
    }
    function replayNextLevel() {
        run = nextLevel(run);
        if (run.phase === 'checkpoint') {
            const reward = rewards.find(entry => entry.afterRound === run.levelIndex + 1);
            if (reward?.selected) run = chooseCheckpointItem(run, reward.selected);
        }
    }
    moves.forEach((move, index) => {
        if (run.phase === 'level-ended') replayNextLevel();
        replayItems();
        if (run.levels[run.levelIndex]?.id !== move.levelId || run.phase !== 'decision') throw new Error('Invalid saved move.');
        const updated = chooseMove(run, move.uci);
        if (updated === run) throw new Error('Invalid saved choice.');
        run = updated;
        if (index === moves.length - 1 && checkpoint.phase === 'reveal') return;
        run = advancePlayback(run);
        if (index === moves.length - 1 && checkpoint.phase === 'reply') return;
        run = advancePlayback(run);
    });
    if (run.phase === 'level-ended' && (checkpoint.levelIndex === run.levelIndex + 1 || checkpoint.phase === 'checkpoint')) replayNextLevel();
    replayItems();
    if (useIndex !== uses.length) throw new Error('Invalid saved item ordering.');
    if (run.checkpointRewards.some((reward, index) => reward.selected !== rewards[index]!.selected)) throw new Error('Invalid saved reward ordering.');
    if (run.phase !== checkpoint.phase || run.levelIndex !== checkpoint.levelIndex) throw new Error('Invalid checkpoint.');
    return run;
}
