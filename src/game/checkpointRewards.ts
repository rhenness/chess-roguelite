import { isItemId, ITEM_IDS, type ItemId } from './items';

export const CHECKPOINT_ROUNDS = [3, 6] as const;

export interface CheckpointReward {
    afterRound: number;
    offers: [ItemId, ItemId];
    selected: ItemId | null;
}

/** Draw separately from moves and payouts; offers stay fixed for the entire run. */
export function createCheckpointRewards(levelCount: number, random = Math.random): CheckpointReward[] {
    return CHECKPOINT_ROUNDS.filter(round => round < levelCount).map(afterRound => {
        const available = [...ITEM_IDS];
        const first = available.splice(Math.floor(random() * available.length), 1)[0]!;
        const second = available[Math.floor(random() * available.length)]!;
        return { afterRound, offers: [first, second], selected: null };
    });
}

export function validCheckpointRewards(value: unknown, levelCount: number): value is CheckpointReward[] {
    if (!Array.isArray(value)) return false;
    // Empty plans preserve runs saved before reward checkpoints existed.
    if (!value.length) return true;
    const rounds = CHECKPOINT_ROUNDS.filter(round => round < levelCount);
    return value.length === rounds.length && value.every((reward, index) =>
        reward && reward.afterRound === rounds[index] && Array.isArray(reward.offers)
        && reward.offers.length === 2 && reward.offers.every(isItemId)
        && reward.offers[0] !== reward.offers[1]
        && (reward.selected === null || reward.offers.includes(reward.selected)));
}
