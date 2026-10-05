import { PIECE_SET_IDS, PIECE_SETS, type PieceSetId } from './pieceSets';
import type { RunState } from './run';
import { isPaidUpgradeCounts, runCoinReward, type PaidUpgradeCounts } from './economy';

export const PROGRESSION_STORAGE_KEY = 'knightfall.progression.v1';

export interface UserProgression {
    version: 1;
    finishedRuns: number;
    lastFinishedRunId: string | null;
    coins: number;
    paidUpgrades: PaidUpgradeCounts;
    lastDailyRewardDay?: string;
    rewardReceipts?: string[];
}

export const initialUserProgression = (): UserProgression => ({
    version: 1, finishedRuns: 0, lastFinishedRunId: null, coins: 0, paidUpgrades: {},
});

export function loadUserProgression(): UserProgression {
    try {
        const source = window.localStorage.getItem(PROGRESSION_STORAGE_KEY);
        if (source) {
            const profile = JSON.parse(source) as UserProgression;
            if (profile?.version === 1 && Number.isSafeInteger(profile.finishedRuns) && profile.finishedRuns >= 0
                && (profile.lastFinishedRunId === null || (typeof profile.lastFinishedRunId === 'string'
                    && profile.lastFinishedRunId.trim().length > 0))) {
                // Older saves have unlock progress but no wallet. Preserve their run count.
                const validWallet = Number.isSafeInteger(profile.coins) && profile.coins >= 0
                    && isPaidUpgradeCounts(profile.paidUpgrades);
                return {
                    version: 1, finishedRuns: profile.finishedRuns, lastFinishedRunId: profile.lastFinishedRunId,
                    coins: validWallet ? profile.coins : 0, paidUpgrades: validWallet ? profile.paidUpgrades : {},
                    ...(typeof profile.lastDailyRewardDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.lastDailyRewardDay)
                        ? { lastDailyRewardDay: profile.lastDailyRewardDay } : {}),
                    ...(Array.isArray(profile.rewardReceipts) && profile.rewardReceipts.every(id => typeof id === 'string' && !!id.trim())
                        ? { rewardReceipts: [...new Set(profile.rewardReceipts)] } : {}),
                };
            }
        }
    } catch { /* Storage may be unavailable or contain invalid data. */ }
    return initialUserProgression();
}

export function saveUserProgression(profile: UserProgression): void {
    try { window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(profile)); }
    catch { /* Unlocks, coins, and purchases still work in memory for this session. */ }
}

export const isPieceSetUnlocked = (set: PieceSetId, profile: UserProgression): boolean =>
    profile.finishedRuns >= PIECE_SETS[set].unlockAfterRuns;

/** Only ended runs count; the run ID prevents replaying the same completion. */
export function recordFinishedRun(profile: UserProgression, run: RunState): UserProgression {
    if (run.phase !== 'finished' || !run.result || profile.lastFinishedRunId === run.id) return profile;
    if (run.daily && profile.lastDailyRewardDay && profile.lastDailyRewardDay >= run.daily.day) return profile;
    return {
        ...profile,
        version: 1, finishedRuns: Math.min(Number.MAX_SAFE_INTEGER, profile.finishedRuns + 1),
        lastFinishedRunId: run.id,
        coins: Math.min(Number.MAX_SAFE_INTEGER, profile.coins + runCoinReward(run)),
        ...(run.daily ? { lastDailyRewardDay: run.daily.day } : {}),
    };
}

export const newlyUnlockedSets = (before: UserProgression, after: UserProgression): PieceSetId[] =>
    PIECE_SET_IDS.filter(set => !isPieceSetUnlocked(set, before) && isPieceSetUnlocked(set, after));
