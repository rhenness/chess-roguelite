import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import type { GeneratedLevel, MoveQuality } from './types/level';
import { decision, makeLevel } from './test/levels';
import { DEFAULT_RULES } from './game/run';
import { initialMultiplierProfile, loadMultiplierProfile, MULTIPLIER_STORAGE_KEY } from './game/multipliers';
import App from './App';

// Assert the FEN/orientation sent to the board without depending on drag animations.
vi.mock('react-chessboard', () => ({
    Chessboard: ({ options }: { options: ChessboardOptions }) => (
        <div data-testid="board" data-position={typeof options.position === 'string' ? options.position : JSON.stringify(options.position)} data-orientation={options.boardOrientation} data-arrows={JSON.stringify(options.arrows)} data-square-styles={JSON.stringify(options.squareStyles)} />
    ),
}));

afterEach(() => { vi.useRealTimers(); });
beforeEach(() => window.localStorage.removeItem(MULTIPLIER_STORAGE_KEY));

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
    it('requires a second click to commit and lets the player change the pending choice', () => {
        const level = makeLevel();
        render(<App levels={[level]} />);
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
        render(<App levels={[level, makeLevel('next', 30)]} />);
        const choices = screen.getByLabelText('Available moves').innerHTML;
        fireEvent.click(screen.getByRole('button', { name: 'Flip board' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'white');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(screen.getByLabelText('Available moves').innerHTML).toBe(choices);
        selectQuality(level, 'good');
        expect(screen.getByRole('status')).toHaveTextContent('Good');
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
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
        render(<App levels={[level]} />);
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
        render(<App levels={[makeLevel('hard', 80), makeLevel('unscored', -1), easy]} />);
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
        render(<StrictMode><App levels={[level]} /></StrictMode>);
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
        render(<App levels={[hard, easy]} />);
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
        render(<App levels={[level]} rules={rules} />);
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
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
    });

    it('finishes a terminal player move without a reply and completes a draw', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove, decisionsTaken: 1, reason: 'draw', result: 'draw' };
        render(<App levels={[level]} />);
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
        render(<App levels={[level, makeLevel('next', 30)]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('heading', { name: 'Level lost' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next level' }));
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
    });

    it('handles an empty catalog and provides actionable loading warnings', () => {
        render(<App levels={[makeLevel('unscored', -1)]} levelWarnings={['broken.json: invalid level data.']} />);
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New run' })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('No scored, playable levels');
        fireEvent.click(screen.getByText('1 level file(s) could not be loaded'));
        expect(screen.getByText('broken.json: invalid level data.')).toBeVisible();
    });

    it('shows the configured scoring and health rules', () => {
        const rules = { ...DEFAULT_RULES, startingHealth: 5, points: { ...DEFAULT_RULES.points, best: 200 } };
        render(<App levels={[makeLevel()]} rules={rules} />);
        fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
        expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('Start with 5 health.');
        expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('+200 points / 0 health lost');
        expect(screen.getByRole('button', { name: 'How to play' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows extra health on the fourth consecutive Best move and resets it on a new run', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 4 }, (_, index) => makeLevel(`streak-${index}`, index));
        render(<App levels={levels} />);
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
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: '+1 health' })).not.toBeInTheDocument();
        selectQuality(levels[0]!, 'best');
        expect(screen.getByRole('status')).not.toHaveTextContent('+1 HP');
    });

    it('opens the score as a dismissible modal, restores focus, and reopens without changing the position', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        render(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
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
        render(<App levels={[makeLevel()]} />);
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
        render(<App levels={[level]} />);
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
        act(() => { window.knightfall!.payout(); });
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        for (let step = 0; step < 32; step++) act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.queryByRole('status', { name: 'Score payout' })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
    });

    it('saves one upgrade for ten completed levels and does not award another when reopening the score', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`complete-${index}`, index));
        render(<App levels={levels} />);
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
        expect(loadMultiplierProfile()).toEqual(saved);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('renders the installed chessboard with a real FEN', async () => {
        const actual = await vi.importActual<typeof import('react-chessboard')>('react-chessboard');
        const { container } = render(<actual.Chessboard options={{ position: makeLevel().root.fen, allowDragging: false, allowDrawingArrows: false }} />);
        expect(container.querySelectorAll('[data-square]')).toHaveLength(64);
        expect(container.querySelectorAll('[data-piece]')).toHaveLength(32);
    });
});
