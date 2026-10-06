import type { RunState } from './run';

export const ITEM_IDS = ['triple-crown', 'kings-guard', 'healing-potion'] as const;
export type ItemId = typeof ITEM_IDS[number];
export type ItemInventory = Partial<Record<ItemId, number>>;
export const LOADOUT_LIMIT = 3;
export type TimedItemEffect =
    | { kind: 'scoreMultiplier'; multiplier: number; moves: number }
    | { kind: 'damageShield'; moves: number };
export type ItemEffect = TimedItemEffect | { kind: 'heal'; amount: number };
export interface ItemDefinition {
    id: ItemId; name: string; summary: string; description: string; price: number; effect: ItemEffect;
}
export const ITEMS: Record<ItemId, ItemDefinition> = {
    'triple-crown': { id: 'triple-crown', name: 'Triple Crown', summary: '×3 points · 3 moves', description: 'Triple move points for your next 3 moves.', price: 30,
        effect: { kind: 'scoreMultiplier', multiplier: 3, moves: 3 } },
    'kings-guard': { id: 'kings-guard', name: 'King’s Guard', summary: 'Block damage · 3 moves', description: 'Prevent all damage for your next 3 moves. Uses a charge even on safe moves.', price: 20,
        effect: { kind: 'damageShield', moves: 3 } },
    'healing-potion': { id: 'healing-potion', name: 'Healing Potion', summary: '+1 heart', description: 'Restore 1 heart immediately.', price: 20,
        effect: { kind: 'heal', amount: 1 } },
};
export const DAILY_ITEMS: ItemInventory = { 'triple-crown': 1, 'kings-guard': 1, 'healing-potion': 1 };
export interface ActiveEffect { sourceItemId: ItemId; effect: TimedItemEffect; remainingMoves: number }
export interface ItemUse { itemId: ItemId; beforeDecision: number; levelIndex: number }
export interface MoveResolution {
    normalPoints: number; awardedPoints: number; incomingDamage: number; damageTaken: number;
    damagePrevented: number; healthBonus: number; shieldSpent: boolean; expiredItems: ItemId[];
}
export const isItemId = (value: unknown): value is ItemId => ITEM_IDS.includes(value as ItemId);
export function isItemInventory(value: unknown): value is ItemInventory {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.entries(value).every(([id, count]) => isItemId(id) && Number.isSafeInteger(count) && count >= 0);
}
export const itemCount = (inventory: ItemInventory) => Object.values(inventory).reduce((sum, count) => sum + (count ?? 0), 0);
export const loadoutCost = (items: ItemInventory) => ITEM_IDS.reduce((total, id) => total + (items[id] ?? 0) * ITEMS[id].price, 0);
export function canActivateItem(run: RunState, id: ItemId): boolean {
    return run.phase === 'decision' && run.node.kind === 'decision' && (run.items[id] ?? 0) > 0
        && !run.activeEffects.some(active => active.effect.kind === ITEMS[id].effect.kind);
}
/** Run supplies were purchased at entry; activation only changes this replayable run. */
export function activateItem(run: RunState, id: ItemId): RunState {
    if (!isItemId(id) || !canActivateItem(run, id)) return run;
    const effect = ITEMS[id].effect;
    return {
        ...run, items: { ...run.items, [id]: run.items[id]! - 1 },
        itemUses: [...run.itemUses, { itemId: id, beforeDecision: run.decisionsMade, levelIndex: run.levelIndex }],
        health: run.health + (effect.kind === 'heal' ? effect.amount : 0),
        activeEffects: effect.kind === 'heal' ? run.activeEffects
            : [...run.activeEffects, { sourceItemId: id, effect: { ...effect }, remainingMoves: effect.moves }],
    };
}
/** Each effect handler transforms a move's outcome, independent of item names. */
const handlers: Record<TimedItemEffect['kind'], (effect: TimedItemEffect, result: MoveResolution) => MoveResolution> = {
    scoreMultiplier: (effect, result) => effect.kind === 'scoreMultiplier' && result.awardedPoints > 0
        ? { ...result, awardedPoints: result.awardedPoints * effect.multiplier } : result,
    damageShield: (_effect, result) => ({ ...result, damageTaken: 0,
        damagePrevented: result.damagePrevented + result.damageTaken, shieldSpent: true }),
};
export function resolveItemEffects(effects: readonly ActiveEffect[], points: number, damage: number, healthBonus: number) {
    let resolution: MoveResolution = { normalPoints: points, awardedPoints: points, incomingDamage: damage,
        damageTaken: damage, damagePrevented: 0, healthBonus, shieldSpent: false, expiredItems: [] };
    for (const active of effects) resolution = handlers[active.effect.kind](active.effect, resolution);
    resolution.expiredItems = effects.filter(active => active.remainingMoves === 1).map(active => active.sourceItemId);
    return { resolution, activeEffects: effects.filter(active => active.remainingMoves > 1)
        .map(active => ({ ...active, remainingMoves: active.remainingMoves - 1 })) };
}
