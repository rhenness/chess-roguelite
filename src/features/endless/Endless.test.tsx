import { StrictMode } from 'react';
import { Chess } from 'chess.js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import App from '../../App';
import { makeLevel } from '../../test/levels';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from '../../game/progression';
import { DAILY_STORAGE_KEY } from '../../game/daily';
import { PLAYER_PROFILE_STORAGE_KEY } from '../../game/playerProfile';
import { RUN_HISTORY_STORAGE_KEY } from '../../game/runHistory';
import { PIECE_SETS, PIECE_SET_IDS } from '../../game/pieceSets';
import { moveToUci } from './chess';
import { startSession } from './session';
import { ENDLESS_STORAGE_KEY, loadSave, saveState } from './storage';
import { offer } from './test/fixtures';

const engine = vi.hoisted(() => ({ analyze: vi.fn(), dispose: vi.fn() }));
vi.mock('./engine/stockfish', () => ({ StockfishAnalyzer: class {
    analyze = engine.analyze; dispose = engine.dispose;
} }));
vi.mock('react-chessboard', async () => ({ ...await vi.importActual<typeof import('react-chessboard')>('react-chessboard'),
    Chessboard: ({ options }: { options: ChessboardOptions }) => <div data-testid="board"
    data-id={options.id} data-fen={options.position} data-orientation={options.boardOrientation}>
    {['e2', 'e4', 'e7', 'e5', 'g1', 'f3'].map(square => <button key={square} aria-label={`Square ${square}`}
        onClick={() => options.onSquareClick?.({ square, piece: null })} />)}
</div> }));

beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '#/play');
    localStorage.clear();
    saveUserProgression({ ...initialUserProgression(), finishedRuns: 8, coins: 100 });
    engine.analyze.mockReset(); engine.dispose.mockReset();
    engine.analyze.mockImplementation(async (fen: string) => new Chess(fen).moves({ verbose: true }).slice(0, 8)
        .map((move, index) => ({ uci: moveToUci(move), depth: 10, score: { kind: 'cp', value: -index * 100 } })));
});
afterEach(() => {
    vi.useRealTimers();
    for (const key of [ENDLESS_STORAGE_KEY, PROGRESSION_STORAGE_KEY, DAILY_STORAGE_KEY, PLAYER_PROFILE_STORAGE_KEY, RUN_HISTORY_STORAGE_KEY,
        ...PIECE_SET_IDS.map(id => PIECE_SETS[id].storageKey)]) localStorage.removeItem(key);
});
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const openEndless = () => fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
function startHardcore() {
    openEndless();
    fireEvent.click(screen.getByRole('button', { name: /Hardcore.*One mistake/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start hardcore' }));
}
function playOption(uci: string) {
    const session = loadSave().session!;
    const index = session.options.findIndex(option => option.uci === uci);
    const button = within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button')[index]!;
    fireEvent.click(button); fireEvent.click(button);
}

describe('Endless integration', () => {
    it('starts Hardcore with one life, plays both colors, fails immediately, and credits once across refresh', async () => {
        const view = render(<StrictMode><App levels={[makeLevel()]} /></StrictMode>);
        startHardcore();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Run supplies' })).not.toBeInTheDocument();
        expect(loadSave().session).toMatchObject({ mode: 'hardcore', health: 1, items: {} });
        playOption('e2e4');
        expect(screen.getByLabelText('Streak: 1')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1400)); await flush();
        expect(screen.getByTestId('board').getAttribute('data-fen')?.split(' ')[1]).toBe('b');
        const failure = loadSave().session!.options.find(option => option.quality === 'inaccuracy' || option.quality === 'bad')!;
        playOption(failure.uci);
        expect(screen.getByRole('heading', { name: 'Endless over' })).toHaveFocus();
        expect(screen.getByLabelText('Earned 3 coins')).toBeInTheDocument();
        const credited = loadUserProgression();
        expect(credited.coins).toBe(103);
        expect(credited.finishedRuns).toBe(8);
        expect(credited.paidUpgrades).toEqual({});
        view.unmount(); render(<App levels={[makeLevel()]} />);
        expect(screen.getByRole('heading', { name: 'Endless over' })).toBeInTheDocument();
        expect(loadUserProgression()).toEqual(credited);
        fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
        expect(screen.getByLabelText('Lifetime stats')).toHaveTextContent('Best Hardcore streak1 moves');
    });

    it('charges Standard items once at entry, activates shared item controls, and restores exact choices', async () => {
        const view = render(<App levels={[makeLevel()]} />);
        openEndless();
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back to sets' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(screen.getByRole('region', { name: 'Run supplies' })).toHaveTextContent('Total 30');
        expect(loadUserProgression().coins).toBe(100);
        fireEvent.click(screen.getByRole('button', { name: 'Start endless' }));
        expect(loadUserProgression().coins).toBe(70);
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Triple Crown' }));
        playOption('e2e4');
        expect(screen.getByLabelText('Score: 225')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1400)); await flush();
        const saved = loadSave().session!;
        view.unmount(); render(<App levels={[makeLevel()]} />);
        expect(loadSave().session).toEqual(saved);
        expect(screen.getByLabelText(/Triple Crown: 2 moves remaining/)).toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(70);
    });

    it('automatically rolls checkmate into a new game while retaining the streak and inventory', async () => {
        const chess = new Chess();
        for (const san of ['f3', 'e5', 'g4']) chess.move(san);
        let session = startSession('standard', 'default', { 'healing-potion': 1 });
        session = offer({ ...session, pgn: chess.pgn(), moves: 3, successfulMoves: 3, streak: 3, longestStreak: 3,
            score: 225, basePoints: 225, counts: { best: 0, good: 3, inaccuracy: 0, bad: 0 } }, 'Qh4#', 'best');
        saveState({ version: 1, session, records: [] });
        window.history.replaceState(null, '', '#/endless-game');
        render(<App levels={[makeLevel()]} />);
        playOption('d8h4');
        act(() => vi.advanceTimersByTime(1400));
        expect(screen.getByRole('status', { name: /Checkmate.*Game 2 starting/ })).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1500));
        expect(screen.getByRole('group', { name: 'Available moves' })).toBeInTheDocument();
        expect(screen.getByLabelText('Streak: 4')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Healing Potion, 1 remaining' })).toBeInTheDocument();
        expect(loadSave().session!.pgn).toBe('');
        expect(loadUserProgression().coins).toBe(100);
    });

    it('pauses timers during help and browsing, then resumes without disturbing dungeon runs', async () => {
        render(<App levels={[makeLevel()]} />);
        startHardcore(); playOption('e2e4');
        fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
        act(() => vi.advanceTimersByTime(5000));
        expect(loadSave().session!.phase).toBe('reveal');
        expect(engine.analyze).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        act(() => vi.advanceTimersByTime(1400)); await flush();
        const saved = loadSave().session!;
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-id', 'knightfall-board');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        expect(screen.getByRole('button', { name: 'Endless' })).toHaveAccessibleDescription('In progress · Move 2');
        openEndless();
        fireEvent.click(screen.getByRole('button', { name: 'Resume endless' }));
        expect(loadSave().session).toEqual(saved);
        expect(screen.getByTestId('board')).toHaveAttribute('data-id', 'endless-board');
    });

    it('keeps engine errors recoverable without altering streaks or health', async () => {
        engine.analyze.mockRejectedValueOnce(new Error('Test engine error'));
        render(<App levels={[makeLevel()]} />);
        startHardcore(); playOption('e2e4');
        act(() => vi.advanceTimersByTime(1400)); await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('Test engine error');
        expect(loadSave().session).toMatchObject({ health: 1, streak: 1, phase: 'analyzing' });
        fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' })); await flush();
        expect(screen.getByRole('group', { name: 'Available moves' })).toBeInTheDocument();
        expect(loadSave().session).toMatchObject({ health: 1, streak: 1, phase: 'ready' });
    });
});
