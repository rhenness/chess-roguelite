import { describe, expect, it } from 'vitest';
import { decision, makeLevel } from '../test/levels';
import { isPlayableLevel, loadBundledLevels, loadLevelCatalog, selectLevels } from './levels';

describe('level selection', () => {
    it('ignores unscored levels, sorts by difficulty, and prevents repeat IDs without mutating the pool', () => {
        const pool = [makeLevel('hard', 80), makeLevel('unscored', -1), makeLevel('easy', 10), makeLevel('hard', 80), makeLevel('mid', 40)];
        expect(selectLevels(pool).map(level => level.id)).toEqual(['easy', 'mid', 'hard']);
        expect(pool[0]?.id).toBe('hard');
    });

    it('orders ties consistently and accepts fewer than four offered moves', () => {
        const a = makeLevel('a', 20);
        decision(a).choices = decision(a).choices.slice(0, 1);
        expect(selectLevels([makeLevel('b', 20), a]).map(level => level.id)).toEqual(['a', 'b']);
    });

    it.each([-1, -2, 101, 10.5, Number.NaN, Number.POSITIVE_INFINITY])('excludes invalid difficulty %s', difficultyScore => {
        expect(isPlayableLevel(makeLevel('invalid', difficultyScore))).toBe(false);
    });

    it('rejects malformed nodes and mismatched player turns', () => {
        const invalidFen = makeLevel();
        invalidFen.root.fen = 'invalid';
        const wrongColor = makeLevel();
        wrongColor.playerColor = 'black';
        const duplicateMove = makeLevel();
        decision(duplicateMove).choices[1]!.playerMove = decision(duplicateMove).choices[0]!.playerMove;
        const invalidDepth = makeLevel();
        decision(invalidDepth).choices[0]!.next.decisionsTaken = 5;
        expect([null, {}, invalidFen, wrongColor, duplicateMove, invalidDepth].every(level => !isPlayableLevel(level))).toBe(true);
        expect(isPlayableLevel(makeLevel('black', 20, 2, 'black'))).toBe(true);
    });

    it('warns about invalid and duplicate files, quietly skipping unscored files', () => {
        const catalog = loadLevelCatalog({
            '/levels/a.json': makeLevel('easy', 10), '/levels/duplicate.json': makeLevel('easy', 10),
            '/levels/invalid.json': {}, '/levels/unscored.json': makeLevel('new', -1),
        });
        expect(catalog.levels.map(level => level.id)).toEqual(['easy']);
        expect(catalog.warnings).toEqual(['duplicate.json: duplicate floor ID.', 'invalid.json: invalid floor data.']);
    });

    it('loads the existing bundled JSON files as a scored, ascending catalog', () => {
        const catalog = loadBundledLevels();
        expect(catalog.warnings).toEqual([]);
        expect(catalog.levels.length).toBeGreaterThanOrEqual(10);
        expect(catalog.levels.map(level => level.difficultyScore)).toEqual(catalog.levels.map(level => level.difficultyScore).sort((a, b) => a - b));
    });

    it('normalizes version 1 scores alongside version 2 levels without changing legacy input', () => {
        const { difficultyScore, ...metadata } = makeLevel('legacy', 20);
        const legacy = { ...metadata, schemaVersion: 1, difficulty: difficultyScore };
        const before = structuredClone(legacy);
        const catalog = loadLevelCatalog({
            '/levels/legacy.json': legacy,
            '/levels/current.json': makeLevel('current', 40),
            '/levels/unscored.json': { ...legacy, id: 'unscored', difficulty: -1 },
        });
        expect(catalog.warnings).toEqual([]);
        expect(catalog.levels.map(level => [level.id, level.schemaVersion, level.difficultyScore]))
            .toEqual([['legacy', 2, 20], ['current', 2, 40]]);
        expect(catalog.levels[0]!.root).toBe(legacy.root);
        expect(catalog.levels[0]).not.toHaveProperty('difficulty');
        expect(legacy).toEqual(before);
    });

    it('rejects conflicting rating fields and unsupported schema versions', () => {
        const current = makeLevel('current', 40);
        const catalog = loadLevelCatalog({
            '/levels/conflict.json': { ...current, difficulty: 10 },
            '/levels/legacy-conflict.json': { ...current, schemaVersion: 1, difficulty: 10 },
            '/levels/future.json': { ...current, schemaVersion: 3 },
        });
        expect(catalog.levels).toEqual([]);
        expect(catalog.warnings).toHaveLength(3);
    });

    it('accepts expert inaccuracies and selects one tier while retaining legacy levels for intermediate', () => {
        const beginner = { ...makeLevel('beginner', 10), skillTier: 'beginner' as const };
        decision(beginner).choices = [decision(beginner).choices[0]!, decision(beginner).choices[3]!];
        const expert = { ...makeLevel('expert', 30), skillTier: 'expert' as const };
        decision(expert).choices[3]!.quality = 'inaccuracy';
        const intermediate = { ...makeLevel('intermediate', 20), skillTier: 'intermediate' as const };
        const files = { 'beginner.json': beginner, 'expert.json': expert,
            'intermediate.json': intermediate, 'legacy.json': makeLevel('legacy', 15) };
        expect(loadLevelCatalog(files).warnings).toEqual([]);
        expect(loadLevelCatalog(files, 'beginner').levels.map(level => level.id)).toEqual(['beginner']);
        expect(loadLevelCatalog(files, 'expert').levels.map(level => level.id)).toEqual(['expert']);
        expect(loadLevelCatalog(files, 'intermediate').levels.map(level => level.id)).toEqual(['legacy', 'intermediate']);
        const invalid = structuredClone(expert);
        decision(invalid).choices[1]!.quality = 'inaccuracy';
        expect(isPlayableLevel(invalid)).toBe(false);
        expect(isPlayableLevel({ ...expert, skillTier: 'unknown' })).toBe(false);
    });
});
