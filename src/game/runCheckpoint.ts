import type { GeneratedLevel } from '../types/level';
import { activateItem, isItemId, LOADOUT_LIMIT, type ItemInventory, type ItemUse } from './items';
import { advancePlayback, chooseMove, nextLevel, startRun, type RunRules, type RunState } from './run';

export interface RunCheckpoint {
    moves: { levelId: string; uci: string }[];
    itemUses?: ItemUse[];
    levelIndex: number;
    phase: RunState['phase'];
}

export const checkpointRun = (run: RunState): RunCheckpoint => ({
    moves: run.history.map(move => ({ levelId: move.levelId, uci: move.playerMove.uci })),
    itemUses: run.itemUses.map(use => ({ ...use })),
    levelIndex: run.levelIndex, phase: run.phase,
});

/** Reconstruct gameplay from offered moves and item activations, never saved totals or tree nodes. */
export function restoreRunCheckpoint(levels: readonly GeneratedLevel[], rules: RunRules,
    items: ItemInventory, checkpoint: RunCheckpoint): RunState {
    let run = startRun(levels, rules, Math.random, items);
    const moves = checkpoint.moves;
    const uses = checkpoint.itemUses ?? [];
    if (!Array.isArray(moves) || !Array.isArray(uses) || uses.length > LOADOUT_LIMIT) throw new Error('Invalid saved checkpoint.');
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
    moves.forEach((move, index) => {
        if (run.phase === 'level-ended') run = nextLevel(run);
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
    if (run.phase === 'level-ended' && checkpoint.levelIndex === run.levelIndex + 1) run = nextLevel(run);
    replayItems();
    if (useIndex !== uses.length) throw new Error('Invalid saved item ordering.');
    if (run.phase !== checkpoint.phase || run.levelIndex !== checkpoint.levelIndex) throw new Error('Invalid checkpoint.');
    return run;
}
