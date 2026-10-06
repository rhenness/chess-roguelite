import { afterEach, describe, expect, it } from 'vitest';
import { SKILL_TIERS, SKILL_TIER_CONFIG } from '../config/difficulty';
import { decision, makeLevel, makeSkillLevel } from '../test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, skillTierRules, startRun, type RunState } from './run';
import { activateItem } from './items';
import { isLevelCompatibleWithSkillTier, selectSkillTierLevels } from './levels';
import { loadPlayerProfile, initialPlayerProfile, PLAYER_PROFILE_STORAGE_KEY, savePlayerProfile } from './playerProfile';
import { loadRegularRun, REGULAR_STORAGE_KEY, saveRegularRun } from './regular';
import { createDailyDungeon, enterDailyDungeon, initialDailyArchive, loadDailyArchive, recordDailyRun, restoreDailyRun, saveDailyArchive, storeDailyDungeon } from './daily';
import { initialMultiplierProfile } from './multipliers';
import { dailyLeaderboard } from './leaderboard';

afterEach(() => window.localStorage.clear());
const play = (run: RunState, quality: string) => {
    if (run.node.kind !== 'decision') throw new Error('Expected a decision');
    return chooseMove(run, run.node.choices.find(choice => choice.quality === quality)!.playerMove.uci);
};
const settle = (run: RunState) => advancePlayback(advancePlayback(run));

describe('skill tier gameplay', () => {
    it('remembers valid preferences and leaves legacy or invalid preferences unset for onboarding', () => {
        for (const preferredSkillTier of SKILL_TIERS) {
            savePlayerProfile({ ...initialPlayerProfile(), displayName: 'Keeper', preferredSkillTier });
            expect(loadPlayerProfile()).toMatchObject({ displayName: 'Keeper', preferredSkillTier });
        }
        window.localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ ...initialPlayerProfile(), preferredSkillTier: 'invalid' }));
        expect(loadPlayerProfile().preferredSkillTier).toBeUndefined();
        savePlayerProfile({ ...initialPlayerProfile(), displayName: 'Legacy Keeper' });
        expect(loadPlayerProfile()).toMatchObject({ displayName: 'Legacy Keeper' });
        expect(loadPlayerProfile().preferredSkillTier).toBeUndefined();
    });

    it('uses option-count pools, score bands and tier-specific rules, including their shared score range', () => {
        const pool = [...SKILL_TIERS.map(tier => makeSkillLevel(tier)), makeLevel('legacy')];
        expect(selectSkillTierLevels(pool, 'beginner').map(level => level.id)).toEqual(['beginner']);
        expect(selectSkillTierLevels(pool, 'expert').map(level => level.id)).toEqual(['expert']);
        expect(selectSkillTierLevels(pool, 'intermediate').map(level => level.id)).toEqual(['intermediate', 'legacy', 'expert']);
        for (const skillTier of SKILL_TIERS) {
            const run = startRun(pool, undefined, () => 0, {}, undefined, { skillTier });
            expect(run).toMatchObject({ skillTier, floorCount: 10, health: SKILL_TIER_CONFIG[skillTier].run.rules.startingHealth });
            expect(run.levels.every(level => isLevelCompatibleWithSkillTier(level, skillTier))).toBe(true);
            expect(play(run, 'best').score).toBe(SKILL_TIER_CONFIG[skillTier].run.rules.points.best);
        }
        expect(() => startRun([makeSkillLevel('expert')], skillTierRules('beginner'), Math.random, {}, undefined,
            { skillTier: 'beginner' })).toThrow('No scored floors');
    });

    it('plays and restores cross-profile regular and daily floors after score cutoffs change', () => {
        const easyExpert = makeSkillLevel('expert', 'easy-expert', 45, 2);
        const hardIntermediate = makeSkillLevel('intermediate', 'hard-intermediate', 75, 2);
        const pool = [easyExpert, hardIntermediate];
        const regular = play(startRun(pool, undefined, () => 0, {}, undefined, { skillTier: 'intermediate' }), 'best');
        expect(regular.levels.map(level => level.id)).toEqual(['easy-expert']);
        expect(regular.score).toBe(100);
        saveRegularRun({ run: regular, set: 'default', initialItems: {} });

        const now = Date.parse('2026-10-04T12:00:00Z');
        const entered = enterDailyDungeon(createDailyDungeon(pool, now, 'expert'), 'default', skillTierRules('expert'),
            initialMultiplierProfile().board, now);
        const dailyRun = play(entered.run, 'best');
        expect(dailyRun.levels.map(level => level.id)).toEqual(['hard-intermediate']);
        expect(dailyRun.score).toBe(150);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), recordDailyRun(entered.dungeon, dailyRun, now)));

        const intermediateRange = SKILL_TIER_CONFIG.intermediate.run.difficultyScoreRange;
        const expertRange = SKILL_TIER_CONFIG.expert.run.difficultyScoreRange;
        try {
            Object.assign(SKILL_TIER_CONFIG.intermediate.run, { difficultyScoreRange: [0, 30] });
            Object.assign(SKILL_TIER_CONFIG.expert.run, { difficultyScoreRange: [80, 100] });
            expect(selectSkillTierLevels(pool, 'intermediate')).toEqual([]);
            expect(selectSkillTierLevels(pool, 'expert')).toEqual([]);
            expect(loadRegularRun(pool)?.run).toEqual(regular);
            expect(restoreDailyRun(loadDailyArchive(pool).days[entered.dungeon.day]!)).toEqual(dailyRun);
        } finally {
            Object.assign(SKILL_TIER_CONFIG.intermediate.run, { difficultyScoreRange: intermediateRange });
            Object.assign(SKILL_TIER_CONFIG.expert.run, { difficultyScoreRange: expertRange });
        }
    });

    it('honors configured score ranges and floor counts, with independent rule snapshots', () => {
        const config = SKILL_TIER_CONFIG.intermediate.run;
        const before = { floorCount: config.floorCount, difficultyScoreRange: config.difficultyScoreRange };
        try {
            Object.assign(config, { floorCount: 2, difficultyScoreRange: [20, 60] });
            const pool = [0, 20, 40, 60, 80].map(score => makeLevel(`score-${score}`, score));
            const rules = skillTierRules('intermediate');
            const run = startRun(pool, rules, () => 0, {}, undefined, { skillTier: 'intermediate' });
            expect(run.levels).toHaveLength(2);
            expect(run.levels.every(level => level.difficultyScore >= 20 && level.difficultyScore <= 60)).toBe(true);
            expect(run.floorCount).toBe(2);
            rules.points.best = 900;
            expect(run.rules.points.best).toBe(100);
            saveRegularRun({ run, set: 'default', initialItems: {} });
            Object.assign(config, before);
            expect(loadRegularRun(pool)?.run).toEqual(run);
        } finally { Object.assign(config, before); }
    });

    it('applies penalties and boosts only positive awards, clamping both boosted and unboosted totals at zero', () => {
        const level = makeSkillLevel('expert', 'expert-penalty', 60, 3);
        let run = startRun([level], skillTierRules('expert'), Math.random, { 'triple-crown': 1 }, undefined, { skillTier: 'expert' });
        run = activateItem(run, 'triple-crown');
        run = play(run, 'inaccuracy');
        expect(run).toMatchObject({ score: 0, health: 2, itemBonusPoints: 0 });
        expect(run.lastMoveResolution).toMatchObject({ awardedPoints: -25, normalPoints: -25 });
        run = play(settle(run), 'best');
        expect(run).toMatchObject({ score: 450, itemBonusPoints: 300 });
        run = play(settle(run), 'inaccuracy');
        expect(run).toMatchObject({ score: 425, itemBonusPoints: 300, health: 1 });

        const intermediate = makeSkillLevel('intermediate', 'clamped', 10, 2);
        const rules = skillTierRules('intermediate');
        rules.points.best = 5;
        rules.points.bad = -20;
        let small = activateItem(startRun([intermediate], rules, Math.random, { 'triple-crown': 1 }), 'triple-crown');
        small = play(small, 'best');
        expect(small).toMatchObject({ score: 15, itemBonusPoints: 10 });
        small = play(settle(small), 'bad');
        expect(small).toMatchObject({ score: 0, itemBonusPoints: 0 });
        expect(small.lastMoveResolution?.awardedPoints).toBe(-20);
    });

    it('restores expert penalties and original settings independently of preferences, and preserves legacy rules', () => {
        const level = makeSkillLevel('expert', 'saved-expert', 60, 2);
        let run = startRun([level], skillTierRules('expert'), Math.random, {}, undefined, { skillTier: 'expert' });
        run = play(settle(play(run, 'best')), 'inaccuracy');
        expect(run.score).toBe(125);
        saveRegularRun({ run, set: 'default', initialItems: {} });
        savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'beginner' });
        expect(loadRegularRun([level])?.run).toEqual(run);
        const tampered = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        tampered.skillTier = 'beginner';
        window.localStorage.setItem(REGULAR_STORAGE_KEY, JSON.stringify(tampered));
        expect(loadRegularRun([level])).toBeNull();

        const legacy = makeLevel('legacy-saved', 10, 2);
        const oldRun = play(startRun([legacy], DEFAULT_RULES), 'bad');
        saveRegularRun({ run: oldRun, set: 'default', initialItems: {} });
        const oldSave = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        delete oldSave.skillTier;
        delete oldSave.floorCount;
        window.localStorage.setItem(REGULAR_STORAGE_KEY, JSON.stringify(oldSave));
        expect(loadRegularRun([legacy])?.run).toEqual(oldRun);
        expect(oldRun.score).toBe(0);
    });

    it('generates shared per-day tier draws, locks one daily attempt, and replays its tier and rules', () => {
        const now = Date.parse('2026-10-04T12:00:00Z');
        const pool = SKILL_TIERS.flatMap(tier => Array.from({ length: 14 }, (_, i) => makeSkillLevel(tier, `${tier}-${i}`, tier === 'expert' ? 58 + i : tier === 'intermediate' ? 45 + i : i)));
        for (const skillTier of SKILL_TIERS) {
            const dungeon = createDailyDungeon(pool, now, skillTier);
            expect(dungeon.levels).toHaveLength(10);
            expect(dungeon.levels.every(level => isLevelCompatibleWithSkillTier(level, skillTier))).toBe(true);
            expect(createDailyDungeon([...pool].reverse(), now + 1000, skillTier).levels.map(level => level.id))
                .toEqual(dungeon.levels.map(level => level.id));
        }
        const dungeon = createDailyDungeon(pool, now, 'expert');
        const entered = enterDailyDungeon(dungeon, 'default', skillTierRules('expert'), initialMultiplierProfile().board, now);
        const saved = recordDailyRun(entered.dungeon, play(entered.run, 'inaccuracy'), now);
        expect(() => enterDailyDungeon({ ...saved, skillTier: 'beginner' }, 'default', skillTierRules('beginner'),
            initialMultiplierProfile().board, now)).toThrow('already been used');
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), saved));
        const restored = loadDailyArchive(pool).days[dungeon.day]!;
        expect(restoreDailyRun(restored)).toMatchObject({ skillTier: 'expert', score: 0, health: 2, rules: skillTierRules('expert') });
        const missingAssets = loadDailyArchive([]).days[dungeon.day]!;
        expect(missingAssets.attempt?.status).toBe('expired');
        expect(() => enterDailyDungeon(missingAssets, 'default', skillTierRules('beginner'), initialMultiplierProfile().board, now))
            .toThrow('already been used');
    });

    it('ranks final scores across tiers while retaining each attempt tier in the shared leaderboard', () => {
        const profile = initialPlayerProfile();
        const beginner = dailyLeaderboard('2026-10-04', profile, 10000, 'beginner');
        const expert = dailyLeaderboard('2026-10-04', profile, 10000, 'expert');
        expect(beginner[0]).toMatchObject({ id: 'you', score: 10000, skillTier: 'beginner' });
        expect(expert[0]).toMatchObject({ id: 'you', score: 10000, skillTier: 'expert', rank: beginner[0]!.rank });
        expect(beginner.slice(1)).toEqual(expert.slice(1));
    });
});
