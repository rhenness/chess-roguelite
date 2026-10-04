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

    it.each([-1, -2, 101, 10.5, Number.NaN, Number.POSITIVE_INFINITY])('excludes invalid difficulty %s', difficulty => {
        expect(isPlayableLevel(makeLevel('invalid', difficulty))).toBe(false);
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
        expect(catalog.warnings).toEqual(['duplicate.json: duplicate level ID.', 'invalid.json: invalid level data.']);
    });

    it('loads the existing bundled JSON files as a scored, ascending catalog', () => {
        const catalog = loadBundledLevels();
        expect(catalog.warnings).toEqual([]);
        expect(catalog.levels.length).toBeGreaterThanOrEqual(10);
        expect(catalog.levels[0]?.difficulty).toBe(43);
        expect(catalog.levels.map(level => level.difficulty)).toEqual(catalog.levels.map(level => level.difficulty).sort((a, b) => a - b));
    });
});
