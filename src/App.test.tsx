import { StrictMode, type ReactElement } from 'react';
import { Chess } from 'chess.js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import type { GeneratedLevel, MoveQuality } from './types/level';
import { decision, makeLevel } from './test/levels';
import { DEFAULT_RULES } from './game/run';
import { BOARD_SQUARES, formatMultiplier, initialMultiplierProfile, loadMultiplierProfile, MULTIPLIER_STORAGE_KEY } from './game/multipliers';
import { PIECE_SET_IDS, PIECE_SETS } from './game/pieceSets';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from './game/progression';
import { PIECE_RENDERERS } from './components/pieces/pieceRenderers';
import App from './App';

// Assert the FEN/orientation sent to the board without depending on drag animations.
vi.mock('react-chessboard', async () => ({
    ...await vi.importActual<typeof import('react-chessboard')>('react-chessboard'),
    Chessboard: ({ options }: { options: ChessboardOptions }) => options.id?.startsWith('upgrades-') ? (
        <div data-testid="upgrade-board" data-position={JSON.stringify(options.position)}>
            {BOARD_SQUARES.map(square => <div key={square} data-square={square}
                onTouchEnd={() => options.onSquareClick?.({ square, piece: null })}>
                {options.squareRenderer?.({ square, piece: null, children: null })}
            </div>)}
        </div>
    ) : (
        <div data-testid="board" data-position={typeof options.position === 'string' ? options.position : JSON.stringify(options.position)} data-orientation={options.boardOrientation} data-arrows={JSON.stringify(options.arrows)} data-square-styles={JSON.stringify(options.squareStyles)} data-piece-set={PIECE_SET_IDS.find(id => options.pieces === PIECE_RENDERERS[id]) ?? 'default'}>
            {BOARD_SQUARES.map(square => <button key={square} aria-label={`Square ${square}`}
                onClick={() => options.onSquareClick?.({ square, piece: null })} />)}
        </div>
    ),
}));

afterEach(() => { vi.useRealTimers(); window.localStorage.removeItem(PROGRESSION_STORAGE_KEY); });
beforeEach(() => {
    PIECE_SET_IDS.forEach(id => window.localStorage.removeItem(PIECE_SETS[id].storageKey));
    // Existing gameplay scenarios exercise all sets after they have been unlocked.
    saveUserProgression({ ...initialUserProgression(), finishedRuns: 8 });
});

function renderGame(element: ReactElement) {
    const view = render(element);
    const defaultSet = screen.queryByRole('button', { name: 'Default' });
    if (defaultSet) fireEvent.click(defaultSet);
    return view;
}

function selectQuality(level: GeneratedLevel, quality: MoveQuality) {
    const move = decision(level).choices.find(choice => choice.quality === quality)!;
    const button = screen.getByRole('button', { name: name => name.startsWith('Option ') && name.includes(`: ${move.playerMove.san},`) });
    fireEvent.click(button);
    fireEvent.click(button);
    return move;
}

function summaryValue(label: string): string | null {
    return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}

function finishPayout() {
    for (let step = 0; step < 32 && !screen.queryByRole('dialog'); step++) {
        act(() => { vi.runOnlyPendingTimers(); });
    }
    expect(screen.getByRole('dialog')).toBeInTheDocument();
}

describe('gameplay interface', () => {
    it('shows every multiplier before selection, saves purchases, and prevents overspending', () => {
        saveUserProgression({ ...initialUserProgression(), coins: 80 });
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
        const shop = screen.getByRole('dialog', { name: 'Default' });
        expect(within(shop).getByTestId('upgrade-board')).toHaveAttribute('data-position', '{}');
        const squares = within(shop).getAllByRole('button', { name: /^[a-h][1-8]: / });
        expect(squares).toHaveLength(64);
        expect(squares.every(square => square.getAttribute('aria-pressed') === 'false')).toBe(true);
        expect(screen.getByRole('button', { name: 'Select a square to upgrade' })).toBeDisabled();
        fireEvent.touchEnd(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` }).closest('[data-square]')!);
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
        expect(loadUserProgression()).toMatchObject({ coins: 50, paidUpgrades: { default: { a1: 1 } } });
        expect(screen.getByRole('button', { name: `a1: ${formatMultiplier(12)}` })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('status', { name: `a1 upgraded to ${formatMultiplier(12)}` })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 40 coins' }));
        expect(loadUserProgression()).toMatchObject({ coins: 10, paidUpgrades: { default: { a1: 2 } } });
        const unavailable = screen.getByRole('button', { name: 'Upgrade a1 for 50 coins (unavailable)' });
        expect(unavailable).toBeDisabled();
        fireEvent.click(unavailable);
        expect(loadUserProgression().coins).toBe(10);
        expect(within(shop).getAllByRole('button', { name: /^[a-h][1-8]: / })).toHaveLength(64);
        expect(loadMultiplierProfile().board.a1).toBe(11);
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        expect(screen.getByRole('dialog', { name: 'Choose your set' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('shares the coin wallet across sets but restores their purchases independently', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 8, coins: 120 });
        const level = makeLevel();
        const view = render(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade Obsidian Order' }));
        fireEvent.click(screen.getByRole('button', { name: `a1: ${formatMultiplier(13)}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade Gilded Court' }));
        fireEvent.click(screen.getByRole('button', { name: `d4: ${formatMultiplier(15)}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade d4 for 30 coins' }));
        const saved = loadUserProgression();
        expect(saved).toMatchObject({ coins: 60, paidUpgrades: { obsidian: { a1: 1 }, gilded: { d4: 1 } } });
        expect(saved.paidUpgrades.default).toBeUndefined();
        view.unmount();
        render(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade Gilded Court' }));
        expect(screen.getByRole('button', { name: `d4: ${formatMultiplier(16)}` })).toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Coins: 60' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
        expect(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` })).toBeInTheDocument();
    });

    it('uses paid multipliers for payouts and awards coins once from base score', () => {
        vi.useFakeTimers();
        saveUserProgression({ ...initialUserProgression(), coins: 30 });
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const level = makeLevel();
            render(<StrictMode><App levels={[level]} /></StrictMode>);
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
            fireEvent.click(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` }));
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            fireEvent.click(screen.getByRole('button', { name: 'Default' }));
            selectQuality(level, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            const saved = loadUserProgression();
            expect(saved.coins).toBe(24);
            finishPayout();
            expect(screen.getByText(`100 ${formatMultiplier(12)}`)).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('120');
            expect(screen.getByLabelText('Earned 24 coins')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            fireEvent.click(screen.getByRole('button', { name: 'View score' }));
            expect(loadUserProgression()).toEqual(saved);
        } finally { random.mockRestore(); }
    });

    it('keeps a finished run on its original board when upgrading during its death notification', () => {
        vi.useFakeTimers();
        saveUserProgression({ ...initialUserProgression(), coins: 60 });
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const levels = [makeLevel('first', 10), makeLevel('second', 20)];
            renderGame(<App levels={levels} rules={{ ...DEFAULT_RULES, startingHealth: 2 }} />);
            selectQuality(levels[0]!, 'good');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
            selectQuality(levels[1]!, 'bad');
            expect(loadUserProgression().coins).toBe(63);
            fireEvent.click(screen.getByRole('button', { name: 'New run' }));
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
            fireEvent.click(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` }));
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            finishPayout();
            expect(screen.getByText(`75 ${formatMultiplier(11)}`)).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('83');
            expect(loadUserProgression()).toMatchObject({ coins: 33, paidUpgrades: { default: { a1: 1 } } });
        } finally { random.mockRestore(); }
    });

    it('keeps premium sets locked for a new player and gives no credit for abandoning a run', () => {
        window.localStorage.removeItem(PROGRESSION_STORAGE_KEY);
        const level = makeLevel('abandoned', 10, 2);
        render(<App levels={[level]} />);
        expect(screen.getByRole('button', { name: 'Default' })).toBeEnabled();
        const obsidian = screen.getByRole('button', { name: 'Obsidian Order' });
        expect(obsidian).toBeDisabled();
        expect(obsidian).toHaveTextContent('0/3');
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent('0/8');
        expect(screen.queryByRole('button', { name: 'Upgrade Obsidian Order' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upgrade Gilded Court' })).not.toBeInTheDocument();
        fireEvent.click(obsidian);
        expect(screen.getByRole('dialog', { name: 'Choose your set' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        selectQuality(level, 'best');
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(loadUserProgression().finishedRuns).toBe(0);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('counts a defeat once and celebrates unlocking Obsidian after its payout', () => {
        vi.useFakeTimers();
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 2 });
        const level = makeLevel();
        const element = <StrictMode><App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} /></StrictMode>;
        const view = renderGame(element);
        selectQuality(level, 'bad');
        const saved = loadUserProgression();
        expect(saved.finishedRuns).toBe(3);
        expect(screen.getByRole('status', { name: 'Run over' })).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Obsidian Order unlocked' })).not.toBeInTheDocument();
        view.rerender(element);
        expect(loadUserProgression()).toEqual(saved);
        for (let step = 0; step < 32 && !screen.queryByRole('status', { name: 'Obsidian Order unlocked' }); step++) {
            act(() => { vi.runOnlyPendingTimers(); });
        }
        expect(screen.getByRole('status', { name: 'Obsidian Order unlocked' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(2000); });
        expect(screen.getByRole('dialog', { name: 'Run over' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'View score' }));
        expect(loadUserProgression()).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent('3/8');
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'obsidian');
        expect(loadUserProgression()).toEqual(saved);
    });

    it('counts a completed run before payout and restores unlocked sets after remounting', () => {
        vi.useFakeTimers();
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 7 });
        const level = makeLevel();
        const view = renderGame(<App levels={[level]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        expect(loadUserProgression().finishedRuns).toBe(7);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(loadUserProgression().finishedRuns).toBe(8);
        // Skipping the presentation must not lose the completed run or show a stale unlock.
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Gilded Court' }));
        act(() => { vi.advanceTimersByTime(10000); });
        expect(screen.queryByRole('status', { name: 'Gilded Court unlocked' })).not.toBeInTheDocument();
        view.unmount();
        render(<App levels={[level]} />);
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toBeEnabled();
        expect(loadUserProgression().finishedRuns).toBe(8);
    });

    it('retains unlock progress in memory when localStorage is blocked', () => {
        const level = makeLevel();
        const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
        const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        try {
            renderGame(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
            for (let count = 1; count <= 3; count++) {
                selectQuality(level, 'bad');
                fireEvent.click(screen.getByRole('button', { name: 'New run' }));
                expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent(`${count}/8`);
                if (count < 3) fireEvent.click(screen.getByRole('button', { name: 'Default' }));
            }
            expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeEnabled();
            fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
            expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        } finally { read.mockRestore(); write.mockRestore(); }
    });

    it.each(['white', 'black'] as const)('plays only an offered source/destination pair for %s after flipping the board', color => {
        const level = makeLevel('board-taps', 10, 2, color);
        renderGame(<App levels={[level]} />);
        const choice = decision(level).choices.find(candidate => candidate.quality === 'inaccuracy')!;
        const from = choice.playerMove.uci.slice(0, 2);
        const to = choice.playerMove.uci.slice(2, 4);
        const tap = (square: string) => fireEvent.click(screen.getByRole('button', { name: `Square ${square}` }));
        tap(to);
        tap('e2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-square-styles', '{}');
        fireEvent.click(screen.getByRole('button', { name: 'Flip board' }));
        tap(from);
        const styles = JSON.parse(screen.getByTestId('board').getAttribute('data-square-styles')!);
        expect(Object.keys(styles).sort()).toEqual([...new Set([from, ...decision(level).choices
            .filter(candidate => candidate.playerMove.uci.startsWith(from)).map(candidate => candidate.playerMove.uci.slice(2, 4))])].sort());
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        tap('h5');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        tap(to);
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 25')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByRole('status', { name: '−1 health' })).toBeInTheDocument();
        tap(from);
        tap(to);
        expect(screen.getByLabelText('Score: 25')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history').querySelectorAll('.history-row')).toHaveLength(1);
    });

    it('can switch or deselect board pieces and interchange board taps with colored options', () => {
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        const [first, second, third] = decision(level).choices;
        const tap = (square: string) => fireEvent.click(screen.getByRole('button', { name: `Square ${square}` }));
        tap(first!.playerMove.uci.slice(0, 2));
        tap(third!.playerMove.uci.slice(0, 2));
        const styles = JSON.parse(screen.getByTestId('board').getAttribute('data-square-styles')!);
        expect(styles).not.toHaveProperty(first!.playerMove.uci.slice(0, 2));
        tap(third!.playerMove.uci.slice(0, 2));
        expect(screen.getByTestId('board')).toHaveAttribute('data-square-styles', '{}');
        const button = screen.getByRole('button', { name: name => name.startsWith('Option ') && name.includes(`: ${second!.playerMove.san},`) });
        fireEvent.click(button);
        tap(first!.playerMove.uci.slice(0, 2));
        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button);
        expect(button).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(button);
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', second!.fenAfterPlayerMove);
    });

    it('requires a promotion choice when offered moves share a destination', () => {
        const level = makeLevel('promotions');
        const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
        const node = decision(level);
        node.fen = fen;
        const choices = node.choices.map((choice, index) => {
            const promotion = ['q', 'r', 'b', 'n'][index]!;
            const board = new Chess(fen);
            const move = board.move({ from: 'a7', to: 'a8', promotion });
            return { ...choice, playerMove: { uci: `a7a8${promotion}`, san: move.san },
                fenAfterPlayerMove: board.fen(), opponentReply: null,
                next: { kind: 'depth-limit' as const, fen: board.fen(), decisionsTaken: 1 } };
        });
        node.choices = choices;
        renderGame(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Square a7' }));
        fireEvent.click(screen.getByRole('button', { name: 'Square a8' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', fen);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /^Promote to / })).toHaveLength(4);
        fireEvent.click(screen.getByRole('button', { name: /^Promote to knight:/ }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choices[3]!.fenAfterPlayerMove);
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('Bad');
    });

    it.each(['obsidian', 'gilded'] as const)('shows the set cards before play and starts as soon as %s is selected', set => {
        render(<App levels={[makeLevel()]} />);
        const picker = screen.getByRole('dialog', { name: 'Choose your set' });
        expect(within(picker).getByRole('heading', { name: 'Choose your set' })).toBeInTheDocument();
        expect(within(picker).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
            'Default', 'Upgrade Default', 'Obsidian Order', 'Upgrade Obsidian Order', 'Gilded Court', 'Upgrade Gilded Court',
        ]);
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Default' })).toHaveFocus();
        fireEvent(picker, new Event('cancel', { cancelable: true }));
        expect(picker).toBeInTheDocument();
        const footer = screen.getByTestId('board').parentElement?.nextElementSibling;
        fireEvent.click(screen.getByRole('button', { name: PIECE_SETS[set].name }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(screen.getByLabelText(`Health: ${PIECE_SETS[set].startingHealth}`)).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', set);
        expect(screen.getByRole('progressbar')).toBe(footer);
        expect(document.documentElement.style.overflow).toBe('');
    });

    it('pauses playback while choosing a set, resumes on cancel, and resets on selection', () => {
        vi.useFakeTimers();
        const level = makeLevel('paused', 10, 2);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.next.fen);
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('uses the Obsidian multiplier for a payout and keeps default progress untouched', () => {
        vi.useFakeTimers();
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const levels = [makeLevel('first', 10), makeLevel('second', 20)];
            render(<App levels={levels} />);
            fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
            selectQuality(levels[0]!, 'good');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
            selectQuality(levels[1]!, 'bad');
            expect(screen.getByLabelText('Health: 0')).toBeInTheDocument();
            finishPayout();
            expect(screen.getByText('75 ×1.3')).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('98');
            expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
            fireEvent.click(screen.getByRole('button', { name: 'Default' }));
            expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
            expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'default');
        } finally { random.mockRestore(); }
    });

    it('requires a second click to commit and lets the player change the pending choice', () => {
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        const best = decision(level).choices[0]!;
        const good = decision(level).choices[1]!;
        const firstButton = screen.getByRole('button', { name: name => name.includes(`: ${best.playerMove.san},`) });
        fireEvent.click(firstButton);
        expect(firstButton).toHaveAttribute('aria-pressed', 'true');
        expect(firstButton).toHaveAccessibleName(`Confirm ${best.playerMove.san}. Tap again to play this move.`);
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
        const arrows = JSON.parse(screen.getByTestId('board').getAttribute('data-arrows')!) as { startSquare: string; endSquare: string; color: string }[];
        expect(arrows.find(arrow => arrow.startSquare + arrow.endSquare === best.playerMove.uci)?.color).toBe('#2f8a5c');
        const secondButton = screen.getByRole('button', { name: name => name.includes(`: ${good.playerMove.san},`) });
        fireEvent.click(secondButton);
        expect(firstButton).toHaveAttribute('aria-pressed', 'false');
        expect(secondButton).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(secondButton);
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', good.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Good');
    });

    it('flips the view without changing the position, choices, or the player’s side', () => {
        const level = makeLevel('black', 10, 1, 'black');
        renderGame(<App levels={[level, makeLevel('next', 30)]} />);
        const choices = screen.getByLabelText('Available moves').innerHTML;
        fireEvent.click(screen.getByRole('button', { name: 'Flip board' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'white');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(screen.getByLabelText('Available moves').innerHTML).toBe(choices);
        selectQuality(level, 'good');
        expect(screen.getByRole('status')).toHaveTextContent('Good');
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
        expect(screen.queryByText('White', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText('Black', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText(/Level \d+ \/ \d+/)).not.toBeInTheDocument();
        const progress = screen.getByRole('progressbar', { name: 'Run progress' });
        expect(progress).toHaveAttribute('aria-valuenow', '1');
        expect(progress).toHaveAttribute('aria-valuemax', '2');
        expect(progress.children[0]).toHaveClass('current');
        expect(progress.children[1]).toHaveClass('future');
        expect(screen.getByTestId('board').parentElement?.nextElementSibling).toBe(progress);
        expect(progress.nextElementSibling).toBe(screen.getByLabelText('Run statistics'));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('puts black player moves and white replies in the correct history columns', () => {
        vi.useFakeTimers();
        const level = makeLevel('black', 10, 1, 'black');
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'best');
        const history = screen.getByLabelText('Move history');
        expect(history.children[0]?.children[0]).toHaveTextContent('1.');
        expect(history.children[0]?.children[1]).toBeEmptyDOMElement();
        expect(history.children[0]?.children[2]).toHaveTextContent(choice.playerMove.san);
        act(() => { vi.advanceTimersByTime(1400); });
        expect(history.children[1]?.children[0]).toHaveTextContent('2.');
        expect(history.children[1]?.children[1]).toHaveTextContent(choice.opponentReply!.san);
        expect(history.children[1]?.children[2]).toBeEmptyDOMElement();
    });

    it('starts the easiest scored level, respects black orientation, and hides qualities before selection', () => {
        const easy = makeLevel('easy', 10, 1, 'black');
        renderGame(<App levels={[makeLevel('hard', 80), makeLevel('unscored', -1), easy]} />);
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', easy.root.fen);
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
        const offered = screen.getByLabelText('Available moves');
        expect(within(offered).getAllByRole('button')).toHaveLength(4);
        expect(offered).toHaveTextContent('');
        const arrows = JSON.parse(screen.getByTestId('board').getAttribute('data-arrows')!) as { startSquare: string; endSquare: string; color: string }[];
        expect(arrows).toHaveLength(4);
        within(offered).getAllByRole('button').forEach((button, index) => {
            expect(button).toHaveStyle({ '--option-color': arrows[index]!.color });
        });
        const move = decision(easy).choices[2]!;
        const button = within(offered).getByRole('button', { name: name => name.includes(`: ${move.playerMove.san},`) });
        fireEvent.focus(button);
        expect(JSON.parse(screen.getByTestId('board').getAttribute('data-square-styles')!)).toHaveProperty(move.playerMove.uci.slice(0, 2));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', easy.root.fen);
        fireEvent.blur(button);
        expect(screen.getByTestId('board')).toHaveAttribute('data-square-styles', '{}');
    });

    it('shows player and opponent positions in sequence and renders only the selected branch next', () => {
        vi.useFakeTimers();
        const level = makeLevel('branches', 10, 2);
        renderGame(<StrictMode><App levels={[level]} /></StrictMode>);
        const choice = selectQuality(level, 'inaccuracy');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('Inaccuracy');
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('+25 points');
        expect(screen.getByRole('status', { name: 'Move quality' })).not.toHaveTextContent('HP');
        expect(screen.getByRole('status', { name: '−1 health' })).toHaveTextContent('−1');
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toHaveTextContent(choice.playerMove.san);
        expect(screen.getByLabelText('Move history')).not.toHaveTextContent(choice.opponentReply!.san);
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.next.fen);
        expect(screen.getByRole('status', { name: 'Move quality' })).not.toHaveTextContent('Reply');
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('+25 points');
        expect(screen.getByLabelText('Move history')).toHaveTextContent(choice.opponentReply!.san);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        if (choice.next.kind !== 'decision') throw new Error('Expected branch decision.');
        const offered = screen.getByLabelText('Available moves');
        for (const nextChoice of choice.next.choices) expect(within(offered).getByRole('button', { name: name => name.includes(`: ${nextChoice.playerMove.san},`) })).toBeInTheDocument();
        expect(within(offered).getAllByRole('button').every(button => !button.hasAttribute('disabled'))).toBe(true);
    });

    it('advances playback automatically, persists run totals between levels, and shows the complete summary', () => {
        vi.useFakeTimers();
        const easy = makeLevel('easy', 10);
        const hard = makeLevel('hard', 70);
        renderGame(<App levels={[hard, easy]} />);
        selectQuality(easy, 'inaccuracy');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('heading', { name: 'Level completed' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        const progress = screen.getByRole('progressbar', { name: 'Run progress' });
        expect(progress).toHaveAttribute('aria-valuenow', '2');
        expect(progress.children[0]).toHaveClass('past');
        expect(progress.children[1]).toHaveClass('current');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', hard.root.fen);
        const stats = screen.getByLabelText('Run statistics');
        expect(within(stats).getByText('25')).toBeInTheDocument();
        expect(within(stats).getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
        act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        selectQuality(hard, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Run complete' })).toBeInTheDocument();
        expect([100, 110]).toContain(Number(screen.getByText('Total score').nextElementSibling!.textContent));
        expect(screen.getByText(/^100 ×1\.[01]$/)).toBeInTheDocument();
        expect(summaryValue('Levels completed')).toBe('2 / 2');
        expect(summaryValue('Total decisions')).toBe('2');
        expect(screen.getByRole('dialog', { name: 'Run complete' })).toHaveAttribute('aria-modal', 'true');
        expect(document.body).not.toHaveTextContent(/difficulty/i);
        expect(screen.getByLabelText('Move counts')).toHaveTextContent('0Best1Good1Inaccuracy0Bad');
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(progress).toHaveAttribute('aria-valuenow', '1');
        expect(progress.children[0]).toHaveClass('current');
        expect(progress.children[1]).toHaveClass('future');
        expect(within(stats).getByLabelText('Score: 0')).toBeInTheDocument();
        expect(within(stats).getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Run complete' })).not.toBeInTheDocument();
    });

    it('ends immediately on lethal damage, blocks further moves, and restarts with fresh health', () => {
        vi.useFakeTimers();
        const level = makeLevel('lethal', 25);
        const rules = { ...DEFAULT_RULES, startingHealth: 1 };
        renderGame(<App levels={[level]} rules={rules} />);
        const choice = selectQuality(level, 'bad');
        expect(screen.getByRole('status', { name: 'Run over. No health remaining.' })).toHaveTextContent('Run over');
        expect(screen.queryByRole('status', { name: '−2 health' })).not.toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.queryByRole('dialog', { name: 'Run over' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Health: 0')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1799); });
        expect(screen.queryByRole('status', { name: 'Score payout' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1); });
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Run over' })).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show opponent reply' })).not.toBeInTheDocument();
        expect(summaryValue('Levels completed')).toBe('0 / 1');
        expect(summaryValue('Total decisions')).toBe('1');
        expect(screen.getByRole('dialog', { name: 'Run over' })).toHaveAttribute('aria-modal', 'true');
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        expect(document.body).not.toHaveTextContent(/difficulty/i);
        expect(screen.getByLabelText('Move counts')).toHaveTextContent('0Best0Good0Inaccuracy1Bad');
        act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
    });

    it('finishes a terminal player move without a reply and completes a draw', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove, decisionsTaken: 1, reason: 'draw', result: 'draw' };
        renderGame(<App levels={[level]} />);
        selectQuality(level, 'best');
        expect(screen.queryByRole('button', { name: 'Show opponent reply' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1400); });
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Run complete' })).toBeInTheDocument();
        expect(summaryValue('Levels completed')).toBe('1 / 1');
    });

    it('shows an opponent win and lets a surviving player continue to the next level', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.next = { kind: 'terminal', fen: choice.next.fen, decisionsTaken: 1, reason: 'checkmate', result: 'black' };
        renderGame(<App levels={[level, makeLevel('next', 30)]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('heading', { name: 'Level lost' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
    });

    it('handles an empty catalog and provides actionable loading warnings', () => {
        renderGame(<App levels={[makeLevel('unscored', -1)]} levelWarnings={['broken.json: invalid level data.']} />);
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New run' })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('No scored, playable levels');
        fireEvent.click(screen.getByText('1 level file(s) could not be loaded'));
        expect(screen.getByText('broken.json: invalid level data.')).toBeVisible();
    });

    it('shows the configured scoring and health rules', () => {
        const rules = { ...DEFAULT_RULES, startingHealth: 5, points: { ...DEFAULT_RULES.points, best: 200 } };
        renderGame(<App levels={[makeLevel()]} rules={rules} />);
        fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
        expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('Start with 5 health.');
        expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('+200 points / 0 health lost');
        expect(screen.getByRole('button', { name: 'How to play' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows extra health on the fourth consecutive Best move and resets it on a new run', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 4 }, (_, index) => makeLevel(`streak-${index}`, index));
        renderGame(<App levels={levels} />);
        levels.forEach((level, index) => {
            selectQuality(level, 'best');
            if (index === 3) {
                expect(screen.getByRole('status', { name: '+1 health' })).toHaveTextContent('+1');
                expect(screen.getByText('+100 points')).toBeInTheDocument();
                expect(screen.getByLabelText('Health: 4')).toBeInTheDocument();
            }
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 3) fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        });
        finishPayout();
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: '+1 health' })).not.toBeInTheDocument();
        selectQuality(levels[0]!, 'best');
        expect(screen.getByRole('status')).not.toHaveTextContent('+1 HP');
    });

    it('opens the score as a dismissible modal, restores focus, and reopens without changing the position', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        renderGame(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
        expect(document.body).not.toHaveTextContent(/difficulty/i);
        selectQuality(level, 'bad');
        act(() => { vi.advanceTimersByTime(1500); });
        finishPayout();
        const modal = screen.getByRole('dialog', { name: 'Run over' });
        expect(screen.getByRole('button', { name: 'Start new run' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('button', { name: 'Start new run' }), { key: 'Tab' });
        expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('button', { name: 'Close dialog' }), { key: 'Tab', shiftKey: true });
        expect(screen.getByRole('button', { name: 'Start new run' })).toHaveFocus();
        expect(modal.closest('.options-area')).toBeNull();
        expect(document.documentElement.style.overflow).toBe('hidden');
        const finalFen = screen.getByTestId('board').getAttribute('data-position');
        fireEvent(modal, new Event('cancel', { cancelable: true }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View score' })).toHaveFocus();
        expect(document.documentElement.style.overflow).toBe('');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', finalFen);
        fireEvent.click(screen.getByRole('button', { name: 'View score' }));
        expect(screen.getByRole('dialog', { name: 'Run over' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View score' })).toHaveFocus();
    });

    it('shows the rules in an overlay and returns focus to help when dismissed', () => {
        renderGame(<App levels={[makeLevel()]} />);
        const help = screen.getByRole('button', { name: 'How to play' });
        fireEvent.click(help);
        expect(screen.getByRole('dialog', { name: 'How to play' }).closest('.game-layout')).toBeNull();
        expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(help).toHaveFocus();
        expect(document.documentElement.style.overflow).toBe('');
    });

    it('previews the whole payout without changing the run or saving an upgrade', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        act(() => { window.knightfall!.payout({ score: 1200, completed: true }); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Score payout' })).toBeInTheDocument();
        for (let step = 0; step < 32; step++) act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        expect(loadUserProgression().finishedRuns).toBe(8);
        act(() => { window.knightfall!.payout(); });
        expect(loadUserProgression().coins).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        for (let step = 0; step < 32; step++) act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.queryByRole('status', { name: 'Score payout' })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
    });

    it('saves one upgrade for ten completed levels and does not award another when reopening the score', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`complete-${index}`, index));
        renderGame(<App levels={levels} />);
        for (let index = 0; index < 10; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 9) fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        }
        finishPayout();
        const saved = loadMultiplierProfile();
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(673);
        expect(saved.board).not.toEqual(initialMultiplierProfile().board);
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'View score' }));
        expect(loadMultiplierProfile()).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(loadMultiplierProfile()).toEqual(saved);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('awards Obsidian upgrades to its own profile and retains them across set changes', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`obsidian-${index}`, index));
        render(<App levels={levels} />);
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        for (let index = 0; index < 10; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 9) fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        }
        finishPayout();
        const saved = loadMultiplierProfile('obsidian');
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(737);
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(loadMultiplierProfile()).toEqual(initialMultiplierProfile());
        expect(loadMultiplierProfile('obsidian')).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(loadMultiplierProfile('obsidian')).toEqual(saved);
    });

    it('renders the installed chessboard with a real FEN', async () => {
        const actual = await vi.importActual<typeof import('react-chessboard')>('react-chessboard');
        const onSquareClick = vi.fn();
        const { container } = render(<actual.Chessboard options={{ position: makeLevel().root.fen, allowDragging: false, allowDrawingArrows: false, onSquareClick }} />);
        expect(container.querySelectorAll('[data-square]')).toHaveLength(64);
        expect(container.querySelectorAll('[data-piece]')).toHaveLength(32);
        fireEvent.click(container.querySelector('[data-square="a2"] [data-piece]')!);
        expect(onSquareClick).toHaveBeenCalledTimes(1);
        expect(onSquareClick).toHaveBeenLastCalledWith({ square: 'a2', piece: { pieceType: 'wP' } });
        fireEvent.click(container.querySelector('[data-square="a3"]')!);
        expect(onSquareClick).toHaveBeenCalledTimes(2);
        expect(onSquareClick).toHaveBeenLastCalledWith({ square: 'a3', piece: null });
    });
});
