import { StrictMode } from 'react';
import { Chess } from 'chess.js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import App from '../../App';
import { makeLevel } from '../../test/levels';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from '../../game/progression';
import { DAILY_STORAGE_KEY } from '../../game/daily';
import { initialPlayerProfile, PLAYER_PROFILE_STORAGE_KEY, savePlayerProfile } from '../../game/playerProfile';
import { RUN_HISTORY_STORAGE_KEY } from '../../game/runHistory';
import { loadPlayerLeveling, totalPlayerXp } from '../../game/playerLeveling';
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
    savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'intermediate' });
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
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
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
    it('prepares the four opening children without advancing play and immediately reuses a completed branch after the reveal', async () => {
        render(<App levels={[makeLevel()]} />);
        startHardcore();
        await flush();
        const opening = loadSave().session!;
        expect(opening).toMatchObject({ phase: 'ready', pgn: '', moves: 0, health: 1, score: 0 });
        expect(engine.analyze).toHaveBeenCalledTimes(4);
        expect(engine.analyze.mock.calls.every(([fen]) => new Chess(fen).turn() === 'b')).toBe(true);
        playOption('e2e4');
        const fen = new Chess(); fen.move('e4');
        expect(loadSave().session!.phase).toBe('reveal');
        expect(loadSave().session!.options).toEqual([]);
        act(() => vi.advanceTimersByTime(1399));
        expect(loadSave().session!.phase).toBe('reveal');
        act(() => vi.advanceTimersByTime(1));
        expect(loadSave().session).toMatchObject({ phase: 'ready', optionsFen: fen.fen(), moves: 1, score: 1 });
        expect(screen.queryByText('Finding your moves…')).not.toBeInTheDocument();
        expect(engine.analyze.mock.calls.filter(([board]) => board === fen.fen())).toHaveLength(1);
    });

    it('prioritizes the first tap and keeps the selected search running across confirmation and the reveal timer', async () => {
        const requests: { fen: string; signal: AbortSignal; resolve: (moves: unknown[]) => void; reject: (error: Error) => void }[] = [];
        engine.analyze.mockImplementation((fen: string, _legal: string[], signal: AbortSignal) => new Promise((resolve, reject) => {
            requests.push({ fen, signal, resolve, reject });
        }));
        render(<App levels={[makeLevel()]} />);
        startHardcore();
        const e4 = screen.getByRole('button', { name: /Option \d+: e4,/ });
        fireEvent.click(e4);
        expect(loadSave().session!.moves).toBe(0);
        expect(requests[0]!.signal.aborted).toBe(true);
        expect(requests).toHaveLength(1);
        requests[0]!.reject(new DOMException('Stopped', 'AbortError')); await flush();
        const board = new Chess(); board.move('e4');
        expect(requests[1]!.fen).toBe(board.fen());
        fireEvent.click(screen.getByRole('button', { name: /^Confirm e4/ }));
        expect(loadSave().session!.phase).toBe('reveal');
        act(() => vi.advanceTimersByTime(1400));
        expect(loadSave().session!.phase).toBe('analyzing');
        expect(requests[1]!.signal.aborted).toBe(false);
        expect(requests).toHaveLength(2);
        requests[1]!.resolve(board.moves({ verbose: true }).slice(0, 8).map((move, index) => ({
            uci: moveToUci(move), depth: 10, score: { kind: 'cp', value: -index * 100 },
        }))); await flush();
        expect(loadSave().session).toMatchObject({ phase: 'ready', optionsFen: board.fen(), moves: 1, health: 1 });
        expect(requests.filter(request => request.fen === board.fen())).toHaveLength(1);
    });

    it('restarts preparation after a refreshed reveal and keeps offered choices unchanged on a later refresh', async () => {
        const view = render(<App levels={[makeLevel()]} />);
        startHardcore(); await flush(); playOption('e2e4');
        const saved = loadSave().session!;
        expect(saved.phase).toBe('reveal');
        view.unmount();
        const refreshed = render(<App levels={[makeLevel()]} />);
        await flush();
        expect(loadSave().session).toEqual(saved);
        act(() => vi.advanceTimersByTime(1400)); await flush();
        const ready = loadSave().session!;
        expect(ready).toMatchObject({ phase: 'ready', moves: 1, health: 1, score: 1 });
        refreshed.unmount(); render(<App levels={[makeLevel()]} />); await flush();
        expect(loadSave().session).toEqual(ready);
    });

    it('pauses preparation when the tab is hidden and resumes when visible again', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get');
        engine.analyze.mockImplementation((_fen: string, _legal: string[], signal: AbortSignal) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
        }));
        try {
            render(<App levels={[makeLevel()]} />); startHardcore();
            const session = loadSave().session;
            visibility.mockReturnValue('hidden'); fireEvent(document, new Event('visibilitychange')); await flush();
            expect(engine.analyze.mock.calls[0]![2].aborted).toBe(true);
            const calls = engine.analyze.mock.calls.length;
            act(() => vi.advanceTimersByTime(10000)); await flush();
            expect(engine.analyze).toHaveBeenCalledTimes(calls);
            expect(loadSave().session).toEqual(session);
            visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange')); await flush();
            expect(engine.analyze).toHaveBeenCalledTimes(calls + 1);
        } finally { visibility.mockRestore(); }
    });

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
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(805);
        expect(screen.getByLabelText('Earned 5 XP')).toBeInTheDocument();
        view.unmount(); render(<App levels={[makeLevel()]} />);
        expect(screen.getByRole('heading', { name: 'Endless over' })).toBeInTheDocument();
        expect(loadUserProgression()).toEqual(credited);
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(805);
        fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
        const highScores = screen.getByLabelText('High scores');
        expect(highScores.children).toHaveLength(4);
        expect(within(highScores).getByText('Best Hardcore streak').closest('dt')!.nextElementSibling).toHaveTextContent('1');
        expect(within(highScores).getByText('Best regular score').closest('dt')!.nextElementSibling).toHaveTextContent('—');
        expect(screen.queryByText('Your first adventure awaits.')).not.toBeInTheDocument();
        expect(screen.queryByText('Score history')).not.toBeInTheDocument();
        expect(highScores.querySelector('dd[aria-label="1 moves"]')).toHaveTextContent('1');
        expect(screen.queryByText('Stats & history')).not.toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        const help = screen.getByRole('dialog', { name: 'Playing Hardcore Endless' });
        expect(help).toHaveTextContent('One Inaccuracy or Bad move ends the attempt.');
        expect(help).toHaveTextContent('Help changes based on the page you’re viewing.');
        expect(within(help).queryByText(/items|restore one heart|health lost/i)).not.toBeInTheDocument();
        const callsBeforePause = engine.analyze.mock.calls.length;
        act(() => vi.advanceTimersByTime(5000));
        await flush();
        expect(loadSave().session!.phase).toBe('reveal');
        expect(engine.analyze).toHaveBeenCalledTimes(callsBeforePause);
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
        const normalAnalysis = engine.analyze.getMockImplementation()!;
        engine.analyze.mockRejectedValue(new Error('Test engine error'));
        render(<App levels={[makeLevel()]} />);
        startHardcore(); await flush(); playOption('c2c4'); await flush();
        act(() => vi.advanceTimersByTime(1400)); await flush();
        expect(screen.getByRole('alert')).toHaveTextContent('Test engine error');
        expect(loadSave().session).toMatchObject({ health: 1, streak: 1, phase: 'analyzing' });
        engine.analyze.mockImplementation(normalAnalysis);
        fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' })); await flush();
        expect(screen.getByRole('group', { name: 'Available moves' })).toBeInTheDocument();
        expect(loadSave().session).toMatchObject({ health: 1, streak: 1, phase: 'ready' });
    });
});
