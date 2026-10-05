import { Chess } from 'chess.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { MoveQuality } from '../../types/level';
import { DEFAULT_RULES } from '../../game/run';
import { ITEMS } from '../../game/items';
import { createChess, gameStatus } from './chess';
import { acceptOptions, advanceReveal, canUseItem, coinReward, nextBoard, playMove, startSession, useItem } from './session';
import { loadSave, saveState, ENDLESS_STORAGE_KEY, isSession } from './storage';
import { buildOptions, STARTING_FEN } from './options';
import { classifyScore, selectFour } from './classification';
import type { EndlessSession } from './types';

import { offer } from './test/fixtures';
const play = (session: EndlessSession, san: string, quality: MoveQuality = 'good') => {
    const ready = offer(session, san, quality);
    return playMove(ready, ready.options[0]!.uci, 1000);
};
afterEach(() => localStorage.removeItem(ENDLESS_STORAGE_KEY));

describe('Endless session', () => {
    it('uses the original four Good opening moves and supports both sides without an opponent reply', () => {
        const initial = startSession('hardcore', 'gilded', { 'healing-potion': 3 });
        expect(initial.health).toBe(1);
        expect(initial.items).toEqual({});
        expect(initial.options.map(option => option.san)).toEqual(['c4', 'd4', 'e4', 'Nf3']);
        expect(initial.options.every(option => option.quality === 'good')).toBe(true);
        const white = playMove(initial, 'e2e4');
        expect(createChess(white.pgn).turn()).toBe('b');
        expect(createChess(white.pgn).history()).toEqual(['e4']);
        const black = play(advanceReveal(white), 'e5', 'best');
        expect(createChess(black.pgn).turn()).toBe('w');
        expect(black).toMatchObject({ score: 2, streak: 2, successfulMoves: 2, health: 1 });
        expect(canUseItem(initial, 'healing-potion')).toBe(false);
    });

    it.each(['inaccuracy', 'bad'] as const)('ends Hardcore on %s without counting the failing move', quality => {
        const first = play(startSession('hardcore', 'default'), 'e4');
        const failed = play(advanceReveal(first), 'e5', quality);
        expect(failed).toMatchObject({ phase: 'finished', score: 1, streak: 0, longestStreak: 1, moves: 2, health: 0 });
        expect(coinReward(failed)).toBe(3);
        expect(playMove(failed, 'g1f3')).toBe(failed);
        expect(useItem(failed, 'healing-potion')).toBe(failed);
    });

    it('shields damage while resetting the accuracy streak, and excludes boosted points from coins', () => {
        let session = startSession('standard', 'obsidian', { 'triple-crown': 1, 'kings-guard': 1, 'healing-potion': 1 });
        session = useItem(session, 'triple-crown');
        session = play(session, 'e4', 'best');
        expect(session).toMatchObject({ score: 300, basePoints: 100, streak: 1, health: 2 });
        session = offer(advanceReveal(session), 'e5', 'inaccuracy');
        session = useItem(session, 'kings-guard');
        session = playMove(session, 'e7e5');
        expect(session).toMatchObject({ score: 375, basePoints: 125, streak: 0, longestStreak: 1, health: 2 });
        expect(session.lastResolution).toMatchObject({ damageTaken: 0, damagePrevented: 1, shieldSpent: true });
        session = offer(advanceReveal(session), 'Nf3', 'good');
        session = useItem(session, 'healing-potion');
        expect(session.health).toBe(3);
        session = playMove(session, 'g1f3');
        expect(session.score).toBe(600);
        expect(session.activeEffects).toEqual([]);
        session = play(advanceReveal(session), 'Nc6', 'bad');
        session = play(advanceReveal(session), 'Bc4', 'bad');
        expect(session.phase).toBe('finished');
        expect(coinReward(session)).toBe(8);
    });

    it('restores one Standard heart every four consecutive Best moves and gives Hardcore no healing', () => {
        for (const mode of ['standard', 'hardcore'] as const) {
            let session = startSession(mode, 'default');
            for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) session = play(advanceReveal(session), san, 'best');
            expect(session.health).toBe(mode === 'standard' ? 4 : 1);
        }
    });

    it('carries streaks, lives, unspent items, and active charges through checkmate into a normal new board', () => {
        let session = startSession('standard', 'default', { 'triple-crown': 1, 'healing-potion': 1 });
        session = play(session, 'f3');
        session = play(advanceReveal(session), 'e5');
        session = offer(advanceReveal(session), 'g4', 'good');
        session = useItem(session, 'triple-crown');
        session = playMove(session, 'g2g4');
        session = play(advanceReveal(session), 'Qh4#', 'best');
        expect(session).toMatchObject({ phase: 'reveal', gamesCompleted: 1, streak: 4, health: 3 });
        expect(session.activeEffects[0]!.remainingMoves).toBe(1);
        const between = advanceReveal(session);
        expect(between.phase).toBe('between-games');
        const next = nextBoard(between);
        expect(createChess(next.pgn).fen()).toBe(STARTING_FEN);
        expect(next).toMatchObject({ phase: 'ready', gamesCompleted: 1, streak: 4, score: session.score,
            health: 3, moves: 4, items: { 'triple-crown': 0, 'healing-potion': 1 }, activeEffects: session.activeEffects });
        const opening = playMove(next, 'e2e4');
        expect(opening.activeEffects).toEqual([]);
        expect(opening.streak).toBe(5);
        expect(opening.score - next.score).toBe(225);
    });

    it('continues automatically after threefold repetition instead of ending the attempt', () => {
        let session = startSession('hardcore', 'default');
        for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) session = play(advanceReveal(session), san);
        expect(session.boardResult).toBe('Draw by threefold repetition');
        expect(session.gamesCompleted).toBe(1);
        const next = nextBoard(advanceReveal(session));
        expect(next).toMatchObject({ phase: 'ready', score: 8, streak: 8, health: 1, gamesCompleted: 1 });
        expect(gameStatus(createChess(next.pgn))).toBeNull();
    });

    it('rejects stale evaluations, illegal choices, and item use outside a decision', () => {
        const start = startSession('standard', 'default', { 'healing-potion': 1 });
        expect(playMove(start, 'e2e5')).toBe(start);
        const revealing = playMove(start, 'e2e4');
        expect(useItem(revealing, 'healing-potion')).toBe(revealing);
        const analyzing = advanceReveal(revealing);
        expect(acceptOptions(analyzing, STARTING_FEN, start.options)).toBe(analyzing);
        expect(acceptOptions(analyzing, createChess(analyzing.pgn).fen(), start.options)).toBe(analyzing);
    });
});

describe('Endless classification and persistence', () => {
    it('preserves Fourced Move thresholds, mate handling, and category selection', () => {
        const cp = (value: number) => ({ kind: 'cp' as const, value });
        expect(classifyScore(cp(0), cp(0), true)).toBe('best');
        expect(classifyScore(cp(-50), cp(0), false)).toBe('good');
        expect(classifyScore(cp(-51), cp(0), false)).toBe('inaccuracy');
        expect(classifyScore(cp(-150), cp(0), false)).toBe('inaccuracy');
        expect(classifyScore(cp(-151), cp(0), false)).toBe('bad');
        expect(classifyScore({ kind: 'mate', value: 4 }, { kind: 'mate', value: 2 }, false)).toBe('good');
        expect(classifyScore(cp(500), { kind: 'mate', value: 2 }, false)).toBe('bad');
        const moves = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3', 'f2f3'].map((uci, index) => ({ uci, depth: 10, score: cp(-index * 50) }));
        expect(selectFour(moves).map(move => move.quality)).toEqual(['best', 'good', 'inaccuracy', 'bad']);
        expect(buildOptions(new Chess(), [{ uci: 'illegal', depth: 10, score: cp(0) }])).toEqual([]);
    });

    it('saves exact choices, active effects, between-game transitions, and finished attempts', () => {
        let session = startSession('standard', 'default', { 'triple-crown': 1 });
        session = useItem(session, 'triple-crown');
        expect(isSession(session)).toBe(true);
        saveState({ version: 1, session, records: [] });
        expect(loadSave().session).toEqual(session);
        for (const san of ['f3', 'e5', 'g4', 'Qh4#']) session = play(advanceReveal(session), san);
        session = advanceReveal(session);
        saveState({ version: 1, session, records: [] });
        expect(loadSave().session).toEqual(session);
        session = nextBoard(session);
        session = play(session, 'e4', 'bad');
        session = play(advanceReveal(session), 'e5', 'bad');
        expect(session.phase).toBe('finished');
        saveState({ version: 1, session, records: [] });
        expect(loadSave().session).toEqual(session);
    });

    it('ignores malformed saves and illegal or stale stored options', () => {
        const session = startSession('standard', 'default');
        for (const corrupted of [
            { ...session, phase: 'unknown' }, { ...session, optionsFen: 'bad fen' },
            { ...session, options: [{ ...session.options[0], uci: 'e2e5' }] },
            { ...session, rules: { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, good: 999 } } },
            { ...session, activeEffects: [{ sourceItemId: 'triple-crown', effect: ITEMS['triple-crown'].effect, remainingMoves: 99 }] },
        ]) {
            localStorage.setItem(ENDLESS_STORAGE_KEY, JSON.stringify({ version: 1, session: corrupted, records: [] }));
            expect(loadSave().session).toBeNull();
        }
        localStorage.setItem(ENDLESS_STORAGE_KEY, '{');
        expect(loadSave()).toEqual({ version: 1, session: null, records: [] });
    });
});
