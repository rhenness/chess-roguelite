import { StrictMode, type ReactElement } from 'react';
import { Chess } from 'chess.js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import type { GeneratedLevel, MoveQuality } from './types/level';
import { decision, makeLevel } from './test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, nextLevel } from './game/run';
import { BOARD_SQUARES, formatMultiplier, initialMultiplierProfile, loadMultiplierProfile, MULTIPLIER_STORAGE_KEY } from './game/multipliers';
import { PIECE_SET_IDS, PIECE_SETS } from './game/pieceSets';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from './game/progression';
import { PIECE_RENDERERS } from './components/pieces/pieceRenderers';
import App from './App';
import { initialPlayerProfile, loadPlayerProfile, PLAYER_PROFILE_STORAGE_KEY } from './game/playerProfile';
import { loadRunHistory, RUN_HISTORY_STORAGE_KEY, saveRunHistory, type RunRecord } from './game/runHistory';
import { createDailyDungeon, DAILY_STORAGE_KEY, enterDailyDungeon, initialDailyArchive, recordDailyRun, saveDailyArchive, storeDailyDungeon } from './game/daily';

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
    window.history.replaceState(null, '', '#/play');
    window.localStorage.removeItem(DAILY_STORAGE_KEY);
    window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
    window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
    PIECE_SET_IDS.forEach(id => window.localStorage.removeItem(PIECE_SETS[id].storageKey));
    // Existing gameplay scenarios exercise all sets after they have been unlocked.
    saveUserProgression({ ...initialUserProgression(), finishedRuns: 8 });
});

function renderSetup(element: ReactElement) {
    const view = render(element);
    if (screen.queryByRole('heading', { name: 'Knightfall', level: 1 })) {
        const regular = screen.getByRole('button', { name: 'New run' });
        if (!regular.hasAttribute('disabled')) fireEvent.click(regular);
    }
    return view;
}

function openRegular() {
    if (!screen.queryByRole('heading', { name: 'Regular run', level: 1 })) {
        const modes = screen.queryByRole('link', { name: 'Knightfall home' });
        if (modes) fireEvent.click(modes);
        fireEvent.click(screen.getByRole('button', { name: /^(Regular run|New run)$/ }));
    }
}

function startRegular(name = 'Default') {
    openRegular();
    fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: /^Start (new )?run(?: · \d+ coins)?$/ }));
}

function openDaily() {
    if (screen.queryByRole('heading', { name: 'Daily dungeon', level: 1 })) return;
    const modes = screen.queryByRole('link', { name: 'Knightfall home' });
    if (modes) fireEvent.click(modes);
    fireEvent.click(screen.getByRole('button', { name: 'Daily dungeon' }));
}

function renderGame(element: ReactElement) {
    const view = renderSetup(element);
    if (screen.queryByRole('button', { name: 'Default' })) startRegular();
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
    for (let step = 0; step < 32 && !screen.queryByText('Total score') && !screen.queryByText('Final score'); step++) {
        act(() => { vi.runOnlyPendingTimers(); });
    }
    expect(screen.queryByText('Total score') ?? screen.queryByText('Final score')).toBeInTheDocument();
}

function openProfileEditor() {
    if (!screen.queryByRole('dialog', { name: 'Your profile' }) && !screen.queryByRole('heading', { name: 'Your profile', level: 1 })) {
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
}

describe('run supplies', () => {
    it('selects items in setup, charges once at entry, and brings only selected items', () => {
        saveUserProgression({ ...initialUserProgression(), coins: 70 });
        renderSetup(<App levels={[makeLevel('supplies', 10, 3)]} />);
        expect(screen.queryByRole('link', { name: 'Shop' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bring King’s Guard for 20 coins' }));
        expect(loadUserProgression().coins).toBe(70);
        expect(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Remove King’s Guard' }));
        startRegular();
        expect(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'King’s Guard, 1 remaining' })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(40);
    });
    it('enforces three slots and loses unused items without refunds when replacing a run', () => {
        saveUserProgression({ ...initialUserProgression(), coins: 100 });
        renderSetup(<App levels={[makeLevel()]} />);
        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Bring Healing Potion for 20 coins' }));
        expect(screen.getByRole('button', { name: 'Bring King’s Guard for 20 coins' })).toBeDisabled();
        startRegular();
        expect(loadUserProgression().coins).toBe(40);
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        expect(loadUserProgression().coins).toBe(40);
        expect(screen.queryByRole('button', { name: 'Healing Potion, 3 remaining' })).not.toBeInTheDocument();
    });
    it('activates a boost, clears pending move confirmation, and shows actual points and duration', () => {
        vi.useFakeTimers();
        const level = makeLevel('boost-ui', 10, 3);
        saveUserProgression({ ...initialUserProgression(), coins: 30 });
        renderSetup(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        startRegular();
        const choice = decision(level).choices[0]!;
        const option = screen.getByRole('button', { name: name => name.startsWith('Option ') && name.includes(`: ${choice.playerMove.san},`) });
        fireEvent.click(option);
        fireEvent.click(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Triple Crown' }));
        expect(loadUserProgression().coins).toBe(0);
        expect(screen.getByLabelText(/Triple Crown: 3 moves remaining/)).toBeInTheDocument();
        fireEvent.click(option);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        fireEvent.click(option);
        expect(screen.getByLabelText('Score: 300')).toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('+300 points');
        expect(screen.getByLabelText(/Triple Crown: 2 moves remaining/)).toBeInTheDocument();
    });
    it('announces prevented damage without reporting a health loss or ending the run', () => {
        vi.useFakeTimers();
        const level = makeLevel('shield-ui', 10, 3);
        saveUserProgression({ ...initialUserProgression(), coins: 20 });
        renderSetup(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Bring King’s Guard for 20 coins' }));
        startRegular();
        fireEvent.click(screen.getByRole('button', { name: 'King’s Guard, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of King’s Guard' }));
        act(() => { vi.advanceTimersByTime(1200); });
        selectQuality(level, 'bad');
        expect(screen.getByLabelText('Health: 1')).toBeInTheDocument();
        const notice = screen.getByRole('status', { name: 'Prevented 2 damage' });
        expect(notice).toHaveTextContent('Damage blocked');
        expect(screen.queryByRole('status', { name: /Run over|−2 health/ })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(0);
    });
    it('resumes free daily item effects after remount without charging coins or replaying notices', () => {
        const level = makeLevel('daily-supplies', 10, 3);
        saveUserProgression({ ...initialUserProgression(), coins: 80 });
        const view = render(<App levels={[level]} />);
        openDaily();
        expect(screen.getByText('Daily supplies')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        fireEvent.click(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Triple Crown' }));
        view.unmount();
        render(<App levels={[level]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByLabelText(/Triple Crown: 3 moves remaining/)).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: /Triple Crown/ })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(80);
    });
    it('shows square cancel/confirm controls above an item and cancels without spending it', () => {
        const level = makeLevel('confirmation', 10, 3);
        saveUserProgression({ ...initialUserProgression(), coins: 20 });
        renderSetup(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Bring Healing Potion for 20 coins' }));
        startRegular();
        const item = screen.getByRole('button', { name: 'Healing Potion, 1 remaining' });
        const open = () => fireEvent.click(item);
        open();
        const confirm = screen.getByRole('button', { name: 'Confirm use of Healing Potion' });
        expect(confirm).toHaveClass('item-confirm');
        expect(confirm.closest('.item-slot')).toContainElement(item);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel use of Healing Potion' }));
        expect(screen.queryByRole('group', { name: 'Use Healing Potion?' })).not.toBeInTheDocument();
        open();
        fireEvent.pointerDown(screen.getByTestId('board'));
        expect(screen.queryByRole('group', { name: 'Use Healing Potion?' })).not.toBeInTheDocument();
        open();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('group', { name: 'Use Healing Potion?' })).not.toBeInTheDocument();
        expect(item).toHaveAttribute('aria-label', 'Healing Potion, 1 remaining');
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Healing Potion' }));
        expect(screen.getByLabelText('Health: 4')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Healing Potion, 1 remaining' })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(0);
    });
});

describe('main navigation', () => {
    it('offers four destinations, leaves regular setup unhighlighted, and hides navigation during gameplay', () => {
        render(<App levels={[makeLevel()]} />);
        const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
        expect(within(navigation).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Dungeon', 'Leaderboards', 'Profile']);
        expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        expect(navigation.querySelector('[aria-current="page"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Knightfall home' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('pauses a regular move while visiting destinations and resumes the same playback from Home', () => {
        vi.useFakeTimers();
        const level = makeLevel('navigation-pause', 10, 2);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        const position = screen.getByTestId('board').getAttribute('data-position');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        for (const label of ['Profile', 'Leaderboards', 'Dungeon']) {
            fireEvent.click(screen.getByRole('link', { name: label }));
            expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
            act(() => { vi.advanceTimersByTime(5000); });
            expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.next.fen);
    });

    it('edits the routed profile, saves appearance, and discards drafts on Cancel, Escape, or navigation', () => {
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
        expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Nav Knight' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rook avatar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(loadPlayerProfile()).toMatchObject({ displayName: 'Nav Knight', avatarId: 'rook' });
        expect(window.location.hash).toBe('#/profile');
        expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
        for (const exit of ['Cancel', 'Escape', 'Home']) {
            fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
            const input = screen.getByRole('textbox', { name: 'Display name' });
            expect(input).toHaveValue('Nav Knight');
            fireEvent.change(input, { target: { value: 'Draft name' } });
            if (exit === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
            else if (exit === 'Cancel') fireEvent.click(screen.getByRole('button', { name: exit }));
            else {
                fireEvent.click(screen.getByRole('link', { name: 'Home' }));
                fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
            }
            expect(screen.getByRole('heading', { name: 'Your profile', level: 1 })).toBeInTheDocument();
            expect(screen.getByText('Nav Knight')).toBeInTheDocument();
            expect(loadPlayerProfile().displayName).toBe('Nav Knight');
        }
    });

    it.each([['profile', 'Your profile'], ['leaderboards', 'Leaderboards']])('opens #/%s directly and retains the destination after refresh', (page, heading) => {
        window.history.replaceState(null, '', `#/${page}`);
        const view = render(<App levels={[makeLevel()]} />);
        expect(screen.getByRole('heading', { name: heading, level: 1 })).toHaveFocus();
        expect(screen.getByRole('navigation').querySelector('[aria-current="page"]')).toHaveAttribute('href', `#/${page}`);
        view.unmount();
        render(<App levels={[makeLevel()]} />);
        expect(screen.getByRole('heading', { name: heading, level: 1 })).toHaveFocus();
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
    });
});

describe('player profile interface', () => {
    it('opens the profile page from the main menu and returns through Home', () => {
        render(<App levels={[makeLevel()]} />);
        const avatar = screen.getByRole('button', { name: 'View profile' });
        fireEvent.click(avatar);
        const profile = screen.getByRole('region', { name: 'Your profile' });
        expect(window.location.hash).toBe('#/profile');
        expect(screen.getByRole('heading', { name: 'Your profile', level: 1 })).toHaveFocus();
        expect(within(profile).getByText('Massive Pawn')).toBeInTheDocument();
        expect(within(profile).getAllByText('No runs yet')).toHaveLength(2);
        expect(within(profile).getByText('Finish a regular run to start your score history.')).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Display name' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Knightfall', level: 1 })).toHaveFocus();
        expect(window.location.hash).toBe('#/play');
    });

    it('shows personal bests, lifetime stats and selectable score history with mode and period controls', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
        const sample = (id: string, date: string, score: number, mode: 'regular' | 'daily' = 'regular'): RunRecord => ({
            id, mode, finishedAt: Date.parse(`${date}T12:00:00Z`), ...(mode === 'daily' ? { dailyDay: date } : {}),
            score, floorsCompleted: 10, floorsTotal: 10, checkmates: 1, result: 'complete',
        });
        saveRunHistory({ version: 1, runs: [sample('old', '2026-09-01', 1000), sample('low', '2026-10-01', 100),
            sample('high', '2026-10-01', 400), sample('new', '2026-10-04', 300),
            { ...sample('daily', '2026-10-03', 800, 'daily'), floorsCompleted: 7, result: 'defeat' }] });
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        const profile = screen.getByRole('region', { name: 'Your profile' });
        expect(within(profile).getByText('Best regular score').nextElementSibling).toHaveTextContent('1,000');
        expect(within(profile).getByText('Best daily score').nextElementSibling).toHaveTextContent('800');
        expect(within(profile).getByText('Runs completed').nextElementSibling).toHaveTextContent('4');
        expect(within(profile).getByText('Total checkmates').nextElementSibling).toHaveTextContent('5');
        const chart = within(profile).getByRole('group', { name: 'Regular score history chart' });
        expect(within(chart).getAllByRole('button')).toHaveLength(2);
        fireEvent.focus(within(chart).getByRole('button', { name: /400 points$/ }));
        expect(within(profile).getByRole('status', { name: 'Selected run' })).toHaveTextContent('400 points');
        fireEvent.click(within(profile).getByRole('button', { name: 'All time' }));
        expect(within(chart).getAllByRole('button')).toHaveLength(3);
        fireEvent.click(within(chart).getByRole('button', { name: /1,000 points$/ }));
        expect(within(profile).getByRole('status', { name: 'Selected run' })).toHaveTextContent('1,000 points');
        fireEvent.click(within(profile).getByRole('button', { name: 'Daily' }));
        const dailyChart = within(profile).getByRole('group', { name: 'Daily score history chart' });
        expect(within(dailyChart).getAllByRole('button')).toHaveLength(1);
        expect(dailyChart.querySelector('polyline')).toBeNull();
        expect(within(profile).getByRole('status', { name: 'Selected run' })).toHaveTextContent('800 points');
        expect(within(profile).getByRole('status', { name: 'Selected run' })).toHaveTextContent('7 / 10 floors');
        expect(within(profile).getByRole('status', { name: 'Selected run' })).toHaveTextContent('Defeat');
    });

    it('records a regular payout once and keeps its final score after reopening and refreshing the profile', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const view = renderGame(<StrictMode><App levels={[level]} /></StrictMode>);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        finishPayout();
        const score = screen.getByText('Total score').nextElementSibling!.textContent;
        const history = loadRunHistory();
        expect(history.runs).toHaveLength(1);
        expect(history.runs[0]?.score.toLocaleString()).toBe(score);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(screen.getByText('Best regular score').nextElementSibling).toHaveTextContent(score!);
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(loadRunHistory().runs).toHaveLength(1);
        view.unmount();
        render(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(screen.getByText('Best regular score').nextElementSibling).toHaveTextContent(score!);
        expect(loadRunHistory().runs).toHaveLength(1);
    });

    it('recovers a saved daily final score into history without duplicating it on refresh', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
        const level = makeLevel();
        const entered = enterDailyDungeon(createDailyDungeon([level]), 'default', DEFAULT_RULES, initialMultiplierProfile().board);
        const run = chooseMove(entered.run, decision(level).choices[0]!.playerMove.uci);
        const saved = recordDailyRun(entered.dungeon, run, Date.now(), () => 0);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), saved));
        const view = render(<App levels={[level]} />);
        expect(loadRunHistory().runs).toHaveLength(1);
        expect(loadRunHistory().runs[0]).toMatchObject({ mode: 'daily', score: saved.attempt!.payout!.finalScore, dailyDay: saved.day });
        view.unmount();
        render(<App levels={[level]} />);
        expect(loadRunHistory().runs).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(screen.getByText('Best daily score').nextElementSibling).toHaveTextContent(saved.attempt!.payout!.finalScore.toLocaleString());
    });

    it('opens from the header, previews independent choices, and persists only on save', () => {
        const view = renderGame(<App levels={[makeLevel()]} />);
        openProfileEditor();
        const editor = screen.getByRole('dialog', { name: 'Edit profile' });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Castle Keeper' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rook avatar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sapphire avatar background' }));
        fireEvent.click(screen.getByRole('button', { name: 'Crimson court banner' }));
        const preview = screen.getByLabelText('Leaderboard appearance');
        expect(within(preview).getByText('Castle Keeper')).toBeInTheDocument();
        expect(preview).toHaveStyle({ backgroundImage: 'url("/profile/banners/crimson.svg")' });
        expect(preview.querySelector('.player-avatar')).toHaveStyle({ backgroundColor: '#345d85' });
        expect(preview.querySelector('img')).toHaveAttribute('src', '/profile/avatars/rook.svg');
        expect(loadPlayerProfile()).toEqual(initialPlayerProfile());
        fireEvent.click(within(editor).getByRole('button', { name: 'Save changes' }));
        expect(loadPlayerProfile()).toMatchObject({ displayName: 'Castle Keeper', avatarId: 'rook',
            avatarBackgroundColor: '#345d85', bannerId: 'crimson' });
        expect(screen.getByRole('dialog', { name: 'Your profile' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        view.unmount();
        renderGame(<App levels={[makeLevel()]} />);
        openProfileEditor();
        expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Castle Keeper');
        expect(screen.getByRole('button', { name: 'Rook avatar' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Crimson court banner' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('discards drafts on Cancel and Escape, and preserves an active run', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        selectQuality(level, 'good');
        const score = screen.getByLabelText('Score: 75');
        const position = screen.getByTestId('board').getAttribute('data-position');
        openProfileEditor();
        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Unsaved' } });
        act(() => { vi.advanceTimersByTime(10000); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(score).toHaveTextContent('75');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
        expect(screen.getByRole('button', { name: 'Edit profile' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
        expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Massive Pawn');
        fireEvent.click(screen.getByRole('button', { name: 'Queen avatar' }));
        fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
        expect(screen.getByRole('dialog', { name: 'Your profile' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        expect(screen.getByRole('button', { name: 'View profile' })).toHaveFocus();
        expect(loadPlayerProfile()).toEqual(initialPlayerProfile());
    });

    it('validates empty names, offers preset colors, and includes inputs in keyboard navigation', () => {
        renderGame(<App levels={[makeLevel()]} />);
        openProfileEditor();
        const input = screen.getByRole('textbox', { name: 'Display name' });
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a display name.');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(input, { target: { value: '  Keeper  ' } });
        expect(screen.queryByLabelText('Custom avatar background color')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sapphire avatar background' }));
        const close = screen.getByRole('button', { name: 'Close dialog' });
        const save = screen.getByRole('button', { name: 'Save changes' });
        close.focus();
        fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
        expect(save).toHaveFocus();
        fireEvent.keyDown(save, { key: 'Tab' });
        expect(close).toHaveFocus();
        fireEvent.click(save);
        expect(loadPlayerProfile()).toMatchObject({ displayName: 'Keeper', avatarBackgroundColor: '#345d85' });
    });

    it('keeps profile changes in memory when saving is unavailable', () => {
        renderGame(<App levels={[makeLevel()]} />);
        const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        try {
            openProfileEditor();
            fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Keeper' } });
            fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
            expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Keeper');
        } finally { storage.mockRestore(); }
    });
});

describe('page navigation', () => {
    it('starts on the main menu with a wallet and uses the logo as home', () => {
        render(<App levels={[makeLevel()]} />);
        expect(screen.getByRole('heading', { name: 'Knightfall', level: 1 })).toHaveFocus();
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Default' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Coins: 0')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New run' }));
        expect(window.location.hash).toBe('#/regular');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(window.location.hash).toBe('#/play');
        expect(screen.getByRole('heading', { name: 'Knightfall', level: 1 })).toHaveFocus();
    });

    it('pauses browsing, preserves both runs, and requires explicit daily entry', () => {
        vi.useFakeTimers();
        const level = makeLevel('resumable', 10, 2);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Regular run · Floor 1');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days[Object.keys(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days)[0]!].attempt).toBeNull();
        act(() => { vi.advanceTimersByTime(5000); });
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Daily dungeon · Floor 1');
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openRegular();
        fireEvent.click(screen.getByRole('button', { name: 'Resume regular run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Regular run · Floor 1');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        openDaily();
        expect(screen.getByRole('heading', { name: 'Dungeon in progress' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Enter dungeon' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upgrade Obsidian Order' })).not.toBeInTheDocument();
    });

    it('follows browser navigation without resetting a pending move', () => {
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        const option = screen.getAllByRole('button', { name: /^Option / })[0]!;
        fireEvent.click(option);
        const pending = option.getAttribute('aria-label');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        act(() => { window.history.replaceState(null, '', '#/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(screen.getByRole('button', { name: pending! })).toHaveAttribute('aria-pressed', 'true');
        act(() => { window.history.replaceState(null, '', '#/play'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByRole('button', { name: pending! })).toHaveAttribute('aria-pressed', 'true');
    });

    it('restores a daily checkpoint after refresh, including automatic level advancement', () => {
        vi.useFakeTimers();
        const levels = [makeLevel('daily-first', 10), makeLevel('daily-next', 30)];
        const view = render(<App levels={levels} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        selectQuality(levels[0]!, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        act(() => { vi.advanceTimersByTime(1500); });
        view.unmount();
        render(<App levels={levels} />);
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Daily dungeon · Floor 2');
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', levels[1]!.root.fen);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
    });

    it('shows expiration before opening the new daily page and preserves the regular run', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T23:59:57Z'));
        const level = makeLevel('expiration', 10, 2);
        renderGame(<App levels={[level]} />);
        const position = screen.getByTestId('board').getAttribute('data-position');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        fireEvent.click(screen.getByRole('button', { name: 'Daily leaderboard' }));
        act(() => { vi.advanceTimersByTime(3000); });
        expect(screen.getByRole('status', { name: 'Dungeon expired. Your daily attempt has ended.' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(2500); });
        expect(screen.getByRole('heading', { name: 'Daily dungeon', level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(0);
        expect(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days['2026-10-04'].attempt.status).toBe('expired');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Regular run · Floor 1');
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
    });
});

describe('daily leaderboard interface', () => {
    it('offers a daily-only modal that returns to the same game and selection', () => {
        vi.useFakeTimers();
        renderGame(<App levels={[makeLevel('leaderboard', 10, 2)]} />);
        expect(screen.queryByRole('button', { name: 'Daily leaderboard' })).not.toBeInTheDocument();
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        const option = screen.getAllByRole('button', { name: /^Option / })[0]!;
        fireEvent.click(option);
        const label = option.getAttribute('aria-label');
        const position = screen.getByTestId('board').getAttribute('data-position');
        fireEvent.click(screen.getByRole('button', { name: 'Daily leaderboard' }));
        const modal = screen.getByRole('dialog', { name: 'Daily leaderboard' });
        expect(within(modal).queryByRole('button', { name: /dungeon/i })).not.toBeInTheDocument();
        expect(window.location.hash).toBe('#/game');
        act(() => { vi.advanceTimersByTime(5000); });
        fireEvent(modal, new Event('cancel', { bubbles: true, cancelable: true }));
        expect(screen.getByRole('button', { name: 'Daily leaderboard' })).toHaveFocus();
        expect(screen.getByRole('button', { name: label! })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
    });

    it('shows standings on their own page and retains dungeon selection and both scroll positions', () => {
        render(<App levels={[makeLevel()]} />);
        openDaily();
        expect(screen.getByRole('link', { name: 'Knightfall home' }).closest('header')).toHaveClass('topbar');
        expect(screen.queryByRole('list', { name: 'Daily standings' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        const dungeonScroll = screen.getByRole('region', { name: 'Daily dungeon' }).querySelector<HTMLElement>('[data-page-scroll="dungeon"]')!;
        dungeonScroll.scrollTop = 80;
        fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
        expect(window.location.hash).toBe('#/leaderboards');
        const list = screen.getByRole('list', { name: 'Daily standings' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(18);
        expect(screen.queryByRole('button', { name: /Show all|Top 5|Top 10|Regular run/ })).not.toBeInTheDocument();
        expect(screen.queryByText('Demo leaderboard')).not.toBeInTheDocument();
        expect(screen.queryByText('Player', { selector: '.leaderboard-columns span' })).not.toBeInTheDocument();
        list.scrollTop = 300;
        fireEvent.scroll(list);
        act(() => {
            window.history.replaceState(null, '', '#/daily');
            window.dispatchEvent(new PopStateEvent('popstate'));
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('region', { name: 'Daily dungeon' }).querySelector('[data-page-scroll="dungeon"]')!.scrollTop).toBe(80);
        fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
        expect(screen.getByRole('list', { name: 'Daily standings' }).scrollTop).toBe(300);
        expect(screen.queryByRole('button', { name: 'Edit your profile' })).not.toBeInTheDocument();
        openProfileEditor();
        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Royal Player' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(screen.getByRole('heading', { name: 'Your profile', level: 1 })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
        expect(screen.getByRole('list', { name: 'Daily standings' }).scrollTop).toBe(300);
        expect(within(screen.getByLabelText('Your standing')).getByText('Royal Player')).toBeInTheDocument();
    });

    it('uses page links and browser navigation to switch between dungeon and leaderboard', () => {
        render(<App levels={[makeLevel()]} />);
        openDaily();
        const dungeon = screen.getByRole('link', { name: 'Dungeon' });
        dungeon.focus();
        const leaderboard = screen.getByRole('link', { name: 'Leaderboards' });
        expect(leaderboard).toHaveAttribute('href', '#/leaderboards');
        fireEvent.click(leaderboard);
        expect(leaderboard).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('heading', { name: 'Leaderboards', level: 1 })).toHaveFocus();
        act(() => { window.history.replaceState(null, '', '#/daily'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(dungeon).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('heading', { name: 'Daily dungeon', level: 1 })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
    });

    it('shows the full in-game leaderboard without a profile edit button', () => {
        render(<App levels={[makeLevel()]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        fireEvent.click(screen.getByRole('button', { name: 'Daily leaderboard' }));
        const modal = screen.getByRole('dialog', { name: 'Daily leaderboard' });
        const list = within(modal).getByRole('list', { name: 'Daily standings' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(18);
        list.scrollTop = 240;
        fireEvent.scroll(list);
        expect(within(modal).queryByRole('button', { name: /edit.*profile/i })).not.toBeInTheDocument();
        expect(list.scrollTop).toBe(240);
        expect(within(modal).queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
        fireEvent.click(within(modal).getByRole('button', { name: 'Close dialog' }));
        expect(document.documentElement.style.overflow).toBe('');
        const edit = screen.getByRole('button', { name: 'View profile' });
        openProfileEditor();
        expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        expect(edit).toHaveFocus();
    });
});

describe('daily rewards interface', () => {
    it('automatically shows results, rewards, and placement together after payout', () => {
        vi.useFakeTimers();
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const level = makeLevel();
            render(<App levels={[level]} />);
            openDaily();
            expect(screen.getByText('One attempt')).toBeInTheDocument();
            expect(screen.queryByText('5 coins / 25 base points')).not.toBeInTheDocument();
            expect(screen.queryByText('Bonuses on clear')).not.toBeInTheDocument();
            expect(screen.queryByText('Keep coins on defeat · No rewards on expiry')).not.toBeInTheDocument();
            expect(screen.getByLabelText('100 bonus coins for clearing every floor')).toBeVisible();
            expect(screen.getByRole('region', { name: 'Daily dungeon' }).querySelector('details')).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
            selectQuality(level, 'good');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            finishPayout();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Daily dungeon', level: 1 })).toHaveFocus();
            expect(screen.getByText('Final score').nextElementSibling).toHaveTextContent('83');
            expect(screen.getByLabelText('Earned 115 coins')).toHaveTextContent('+115');
            expect(screen.getByText('Normal earnings')).toBeVisible();
            expect(screen.getByLabelText('Daily move counts')).toBeVisible();
            expect(screen.getByRole('region', { name: 'Daily dungeon' }).querySelector('details')).toBeNull();
            expect(screen.queryByText('Coins earned')).not.toBeInTheDocument();
            expect(screen.queryByText('Added to your wallet')).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
            expect(within(screen.getByRole('list', { name: 'Daily standings' })).getAllByRole('listitem')).toHaveLength(19);
            expect(within(screen.getByLabelText('Your standing')).getByText('83')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /View results|View leaderboard|Rewards/ })).not.toBeInTheDocument();
            const wallet = loadUserProgression();
            fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
            const dailyCard = screen.getByRole('button', { name: 'Daily dungeon' });
            expect(within(dailyCard).getByLabelText('Final score: 83')).toBeInTheDocument();
            expect(within(dailyCard).getByLabelText(/Rank \d+/)).toBeInTheDocument();
            expect(within(dailyCard).queryByLabelText('5 times coins')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
            openDaily();
            expect(loadUserProgression()).toEqual(wallet);
        } finally { random.mockRestore(); }
    });

    it('recovers interrupted finished rewards once and retains the completed daily page after refresh', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`reward-${index}`, index));
        const entered = enterDailyDungeon(createDailyDungeon(levels), 'default', DEFAULT_RULES, initialMultiplierProfile().board);
        let run = entered.run;
        for (let index = 0; index < 10; index++) {
            if (run.node.kind !== 'decision') throw new Error('Expected decision.');
            run = advancePlayback(advancePlayback(chooseMove(run, run.node.choices[0]!.playerMove.uci)));
            if (index < 9) run = nextLevel(run);
        }
        const finished = recordDailyRun(entered.dungeon, run, Date.now(), () => 0);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), finished));
        const view = render(<App levels={levels} />);
        openDaily();
        expect(loadUserProgression().coins).toBe(300);
        expect(loadMultiplierProfile().board.a1).toBe(12);
        expect(screen.getByText('+0.1x on A1')).toBeInTheDocument();
        expect(screen.getByText('Final score').nextElementSibling).toHaveTextContent('1,100');
        const wallet = loadUserProgression();
        const multipliers = loadMultiplierProfile();
        view.unmount();
        render(<StrictMode><App levels={levels} /></StrictMode>);
        expect(screen.getByRole('heading', { name: 'Dungeon complete' })).toBeInTheDocument();
        expect(loadUserProgression()).toEqual(wallet);
        expect(loadMultiplierProfile()).toEqual(multipliers);
        expect(screen.queryByRole('button', { name: 'Enter dungeon' })).not.toBeInTheDocument();
        vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(screen.queryByText('Final score')).not.toBeInTheDocument();
    });

    it('retains newer in-memory coins when storage fails after a credited daily run', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        render(<App levels={[level]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        selectQuality(level, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        finishPayout();
        const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        try {
            startRegular();
            selectQuality(level, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            finishPayout();
            fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
            expect(screen.getByLabelText('Coins: 139')).toBeInTheDocument();
            startRegular('Gilded Court');
            openRegular();
            expect(screen.getByLabelText('Coins: 139')).toBeInTheDocument();
        } finally { storage.mockRestore(); }
    });

    it('grants five times earned coins on defeat', () => {
        vi.useFakeTimers();
        const level = makeLevel('daily-reward', 10, 2);
        render(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        const good = selectQuality(level, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        if (good.next.kind !== 'decision') throw new Error('Expected next decision.');
        const bad = good.next.choices.find(choice => choice.quality === 'bad')!;
        const button = screen.getByRole('button', { name: name => name.startsWith('Option ') && name.includes(`: ${bad.playerMove.san},`) });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(loadUserProgression().coins).toBe(15);
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Daily dungeon', level: 1 })).toBeInTheDocument();
        expect(screen.getByLabelText('Earned 15 coins')).toHaveTextContent('+15');
    });
});

describe('gameplay interface', () => {
    it('shows every multiplier before selection, saves purchases, and prevents overspending', () => {
        saveUserProgression({ ...initialUserProgression(), coins: 80 });
        renderSetup(<App levels={[makeLevel()]} />);
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
        expect(screen.getByRole('region', { name: 'Regular run' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        startRegular('Default');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('shares the coin wallet across sets but restores their purchases independently', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 8, coins: 120 });
        const level = makeLevel();
        const view = renderSetup(<App levels={[level]} />);
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
        renderSetup(<App levels={[level]} />);
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
            renderSetup(<StrictMode><App levels={[level]} /></StrictMode>);
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
            fireEvent.click(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` }));
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            startRegular('Default');
            selectQuality(level, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            const saved = loadUserProgression();
            expect(saved.coins).toBe(24);
            finishPayout();
            expect(screen.getByText(`100 ${formatMultiplier(12)}`)).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('120');
            expect(screen.getByLabelText('Earned 24 coins')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
            act(() => { window.history.replaceState(null, '', '#/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
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
            act(() => { vi.advanceTimersByTime(1500); });
            selectQuality(levels[1]!, 'bad');
            expect(loadUserProgression().coins).toBe(63);
            openRegular();
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade Default' }));
            fireEvent.click(screen.getByRole('button', { name: `a1: ${formatMultiplier(11)}` }));
            fireEvent.click(screen.getByRole('button', { name: 'Upgrade a1 for 30 coins' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
            fireEvent.click(screen.getByRole('button', { name: 'Resume regular run' }));
            finishPayout();
            expect(screen.getByText(`75 ${formatMultiplier(11)}`)).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('83');
            expect(loadUserProgression()).toMatchObject({ coins: 33, paidUpgrades: { default: { a1: 1 } } });
        } finally { random.mockRestore(); }
    });

    it('keeps premium sets locked for a new player and gives no credit for abandoning a run', () => {
        window.localStorage.removeItem(PROGRESSION_STORAGE_KEY);
        const level = makeLevel('abandoned', 10, 2);
        renderSetup(<App levels={[level]} />);
        expect(screen.getByRole('button', { name: 'Default' })).toBeEnabled();
        const obsidian = screen.getByRole('button', { name: 'Obsidian Order' });
        expect(obsidian).toBeDisabled();
        expect(obsidian).toHaveTextContent('0/3');
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent('0/8');
        expect(screen.queryByRole('button', { name: 'Upgrade Obsidian Order' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upgrade Gilded Court' })).not.toBeInTheDocument();
        fireEvent.click(obsidian);
        expect(screen.getByRole('region', { name: 'Regular run' })).toBeInTheDocument();
        startRegular('Default');
        selectQuality(level, 'best');
        openRegular();
        startRegular('Default');
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
        expect(screen.getByRole('status', { name: 'Run over. No health remaining.' })).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Obsidian Order unlocked' })).not.toBeInTheDocument();
        view.rerender(element);
        expect(loadUserProgression()).toEqual(saved);
        for (let step = 0; step < 32 && !screen.queryByRole('status', { name: 'Obsidian Order unlocked' }); step++) {
            act(() => { vi.runOnlyPendingTimers(); });
        }
        expect(screen.getByRole('status', { name: 'Obsidian Order unlocked' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(2000); });
        expect(screen.getByRole('region', { name: 'Run over' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        act(() => { window.history.replaceState(null, '', '#/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(loadUserProgression()).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent('3/8');
        startRegular('Obsidian Order');
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
        openRegular();
        expect(screen.getByRole('button', { name: 'Gilded Court' })).toBeEnabled();
        startRegular('Gilded Court');
        act(() => { vi.advanceTimersByTime(10000); });
        expect(screen.queryByRole('status', { name: 'Gilded Court unlocked' })).not.toBeInTheDocument();
        view.unmount();
        renderSetup(<App levels={[level]} />);
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
                openRegular();
                expect(screen.getByRole('button', { name: 'Gilded Court' })).toHaveTextContent(`${count}/8`);
                if (count < 3) startRegular('Default');
            }
            expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeEnabled();
            startRegular('Obsidian Order');
            expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        } finally { read.mockRestore(); write.mockRestore(); }
    });

    it.each(['white', 'black'] as const)('plays only an offered source/destination pair for %s', color => {
        const level = makeLevel('board-taps', 10, 2, color);
        renderGame(<App levels={[level]} />);
        const choice = decision(level).choices.find(candidate => candidate.quality === 'inaccuracy')!;
        const from = choice.playerMove.uci.slice(0, 2);
        const to = choice.playerMove.uci.slice(2, 4);
        const tap = (square: string) => fireEvent.click(screen.getByRole('button', { name: `Square ${square}` }));
        tap(to);
        tap('e2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-square-styles', '{}');
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

    it.each(['obsidian', 'gilded'] as const)('selects %s without starting until Start run is pressed', set => {
        renderSetup(<App levels={[makeLevel()]} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Regular run', level: 1 })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: PIECE_SETS[set].name }));
        expect(screen.getByRole('button', { name: PIECE_SETS[set].name })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByLabelText(`Health: ${PIECE_SETS[set].startingHealth}`)).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', set);
    });

    it('pauses playback while browsing and resumes without changing the run', () => {
        vi.useFakeTimers();
        const level = makeLevel('paused', 10, 2);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        openRegular();
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Resume regular run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.next.fen);
        startRegular('Obsidian Order');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('uses the Obsidian multiplier for a payout and keeps default progress untouched', () => {
        vi.useFakeTimers();
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const levels = [makeLevel('first', 10), makeLevel('second', 20)];
            renderSetup(<App levels={levels} />);
            startRegular('Obsidian Order');
            selectQuality(levels[0]!, 'good');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            act(() => { vi.advanceTimersByTime(1500); });
            selectQuality(levels[1]!, 'bad');
            expect(screen.getByLabelText('Health: 0')).toBeInTheDocument();
            finishPayout();
            expect(screen.getByText('75 1.3x')).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('98');
            expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
            startRegular('Default');
            expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
            expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'default');
        } finally { random.mockRestore(); }
    });

    it.each([
        ['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1],
    ] as const)('cycles colored options with %s without playing a move', (key, direction) => {
        renderGame(<App levels={[makeLevel()]} />);
        const buttons = within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button');
        let index = direction > 0 ? 0 : buttons.length - 1;
        const first = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        fireEvent(document.body, first);
        expect(first.defaultPrevented).toBe(true);
        expect(buttons[index]).toHaveFocus();
        for (let step = 0; step < buttons.length; step++) {
            fireEvent.keyDown(document.activeElement!, { key });
            index = (index + direction + buttons.length) % buttons.length;
            expect(buttons[index]).toHaveFocus();
        }
        expect(buttons.every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
    });

    it.each(['Enter', ' '])('selects and confirms a colored option with two separate %j presses', key => {
        const level = makeLevel();
        renderGame(<App levels={[level]} />);
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        const button = document.activeElement as HTMLButtonElement;
        const choice = decision(level).choices.find(candidate => button.getAttribute('aria-label')!.includes(`: ${candidate.playerMove.san},`))!;
        fireEvent.keyDown(button, { key });
        fireEvent.keyUp(button, { key });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        fireEvent.keyDown(button, { key, repeat: true });
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
        fireEvent.keyDown(button, { key });
        fireEvent.keyUp(button, { key });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.queryByRole('group', { name: 'Available moves' })).not.toBeInTheDocument();
        fireEvent.keyDown(document.body, { key });
        expect(screen.getByLabelText('Move history').querySelectorAll('.history-row')).toHaveLength(1);
    });

    it('clears confirmation when navigating to another colored option', () => {
        renderGame(<App levels={[makeLevel()]} />);
        const buttons = within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button');
        fireEvent.keyDown(document.body, { key: 'Enter' });
        expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
        fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' });
        expect(buttons[1]).toHaveFocus();
        expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
        fireEvent.keyDown(buttons[1]!, { key: ' ' });
        expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        fireEvent.keyDown(buttons[1]!, { key: 'ArrowLeft' });
        fireEvent.keyDown(buttons[0]!, { key: 'Enter' });
        expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
    });

    it.each([
        ['branch', 4, 2], ['branch', 2, 3], ['floor', 4, 2], ['floor', 2, 3],
    ] as const)('restores arrow focus after a %s switch to %i options from position %i', (transition, count, index) => {
        vi.useFakeTimers();
        const first = makeLevel('first', 10, transition === 'branch' ? 2 : 1);
        const second = makeLevel('second', 20);
        if (transition === 'branch') {
            for (const choice of decision(first).choices) {
                if (choice.next.kind !== 'decision') throw new Error('Expected branch decision.');
                choice.next.choices = choice.next.choices.slice(0, count);
            }
        } else decision(second).choices = decision(second).choices.slice(0, count);
        renderGame(<App levels={[first, second]} rules={{ ...DEFAULT_RULES, startingHealth: 100 }} />);
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        for (let step = 0; step < index; step++) fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
        const button = document.activeElement!;
        fireEvent.keyDown(button, { key: 'Enter' });
        fireEvent.keyDown(button, { key: 'Enter' });
        expect(screen.queryByRole('group', { name: 'Available moves' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        if (transition === 'floor') act(() => { vi.advanceTimersByTime(1500); });
        const buttons = within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button');
        const restored = buttons[index < count ? index : 0]!;
        expect(buttons).toHaveLength(count);
        expect(restored).toHaveFocus();
        expect(restored).toHaveAttribute('aria-pressed', 'false');
        fireEvent.keyDown(restored, { key: ' ' });
        expect(restored).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('group', { name: 'Available moves' })).toBeInTheDocument();
    });

    it('stops restoring arrow focus after the player switches to pointer controls', () => {
        vi.useFakeTimers();
        renderGame(<App levels={[makeLevel('pointer', 10, 2)]} />);
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
        const button = document.activeElement!;
        fireEvent.pointerDown(button);
        fireEvent.click(button);
        fireEvent.click(button);
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        const buttons = within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button');
        expect(buttons).not.toContain(document.activeElement);
    });

    it('keeps focus on another control while new keyboard options appear', () => {
        vi.useFakeTimers();
        renderGame(<App levels={[makeLevel('focus', 10, 2)]} />);
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        const button = document.activeElement!;
        fireEvent.keyDown(button, { key: 'Enter' });
        fireEvent.keyDown(button, { key: 'Enter' });
        const profileButton = screen.getByRole('button', { name: 'View profile' });
        act(() => profileButton.focus());
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('group', { name: 'Available moves' })).toBeInTheDocument();
        expect(profileButton).toHaveFocus();
    });

    it('leaves keyboard controls alone while a gameplay dialog is open', () => {
        renderGame(<App levels={[makeLevel()]} />);
        const profileButton = screen.getByRole('button', { name: 'View profile' });
        act(() => profileButton.focus());
        const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        fireEvent(profileButton, arrow);
        expect(arrow.defaultPrevented).toBe(false);
        expect(profileButton).toHaveFocus();
        fireEvent.click(profileButton);
        const dialog = screen.getByRole('dialog', { name: 'Your profile' });
        for (const key of ['ArrowRight', 'Enter', ' ']) fireEvent.keyDown(dialog, { key });
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Move history')).toBeEmptyDOMElement();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
        expect(within(screen.getByRole('group', { name: 'Available moves' })).getAllByRole('button')
            .every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
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

    it('keeps the board oriented to the player’s side across runs', () => {
        const level = makeLevel('black', 10, 1, 'black');
        renderGame(<App levels={[level, makeLevel('next', 30)]} />);
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', level.root.fen);
        selectQuality(level, 'good');
        expect(screen.getByRole('status')).toHaveTextContent('Good');
        openRegular();
        startRegular('Default');
        expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
        expect(screen.queryByText('White', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText('Black', { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText(/Floor \d+ \/ \d+/)).not.toBeInTheDocument();
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
        expect(screen.getByRole('heading', { name: 'Floor completed' })).toBeInTheDocument();
        const levelNotice = screen.getByRole('status', { name: 'Floor 2' });
        expect(levelNotice).toHaveTextContent('Floor 2');
        expect(levelNotice.querySelector('svg')).toHaveClass('lucide-arrow-up');
        expect(levelNotice.parentElement).toContainElement(screen.getByTestId('board'));
        expect(screen.queryByRole('button', { name: 'Next level' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1499); });
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '1');
        act(() => { vi.advanceTimersByTime(1); });
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
        expect(screen.queryByRole('status', { name: 'Floor 2' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        selectQuality(hard, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Run complete' })).toBeInTheDocument();
        expect([100, 110]).toContain(Number(screen.getByText('Total score').nextElementSibling!.textContent));
        expect(screen.getByText(/^100 1\.[01]x$/)).toBeInTheDocument();
        expect(summaryValue('Floors completed')).toBe('2 / 2');
        expect(summaryValue('Total decisions')).toBe('2');
        expect(screen.getByRole('region', { name: 'Run complete' })).toBeInTheDocument();
        expect(document.body).not.toHaveTextContent(/difficulty/i);
        expect(screen.getByLabelText('Move counts')).toHaveTextContent('0Best1Good1Inaccuracy0Bad');
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        startRegular('Default');
        const restartedProgress = screen.getByRole('progressbar', { name: 'Run progress' });
        expect(restartedProgress).toHaveAttribute('aria-valuenow', '1');
        expect(restartedProgress.children[0]).toHaveClass('current');
        expect(restartedProgress.children[1]).toHaveClass('future');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
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
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show opponent reply' })).not.toBeInTheDocument();
        expect(summaryValue('Floors completed')).toBe('0 / 1');
        expect(summaryValue('Total decisions')).toBe('1');
        expect(screen.getByRole('region', { name: 'Run over' })).toBeInTheDocument();
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        expect(document.body).not.toHaveTextContent(/difficulty/i);
        expect(screen.getByLabelText('Move counts')).toHaveTextContent('0Best0Good0Inaccuracy1Bad');
        act(() => { vi.runOnlyPendingTimers(); });
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        startRegular('Default');
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
        expect(screen.queryByRole('status', { name: 'Checkmate' })).not.toBeInTheDocument();
        finishPayout();
        expect(screen.getByRole('heading', { name: 'Run complete' })).toBeInTheDocument();
        expect(summaryValue('Floors completed')).toBe('1 / 1');
    });

    it.each(['white', 'black'] as const)('shows the %s player a Checkmate notice and preserves points when advancing floors', playerColor => {
        vi.useFakeTimers();
        const level = makeLevel('early-mate', 10, 4, playerColor);
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove,
            decisionsTaken: 1, reason: 'checkmate', result: playerColor };
        const next = makeLevel('next', 30);
        renderGame(<App levels={[level, next]} />);
        selectQuality(level, 'best');
        expect(screen.getByLabelText('Score: 100')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByRole('heading', { name: 'Floor completed' })).toBeInTheDocument();
        const notice = screen.getByRole('status', { name: 'Checkmate' });
        expect(notice).toHaveTextContent('Checkmate');
        expect(notice.parentElement).toContainElement(screen.getByTestId('board'));
        expect(screen.queryByRole('status', { name: 'Floor 2' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Score: 400')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.getByLabelText('Best streak: 1')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1500); });
        expect(screen.queryByRole('status', { name: 'Checkmate' })).not.toBeInTheDocument();
        const floorNotice = screen.getByRole('status', { name: 'Floor 2' });
        expect(floorNotice.parentElement).toContainElement(screen.getByTestId('board'));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '1');
        act(() => { vi.advanceTimersByTime(1499); });
        expect(screen.getByRole('status', { name: 'Floor 2' })).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '1');
        act(() => { vi.advanceTimersByTime(1); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', next.root.fen);
        expect(screen.getByLabelText('Score: 400')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Checkmate' })).not.toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Floor 2' })).not.toBeInTheDocument();
    });

    it('keeps the final mating position visible for the Checkmate notice before starting payout', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove,
            decisionsTaken: 1, reason: 'checkmate', result: 'white' };
        renderGame(<App levels={[level]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        expect(screen.getByRole('status', { name: 'Checkmate' })).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.queryByRole('status', { name: 'Floor 2' })).not.toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Score payout' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1499); });
        expect(screen.getByRole('status', { name: 'Checkmate' })).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1); });
        expect(screen.queryByRole('status', { name: 'Checkmate' })).not.toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Score payout' })).toBeInTheDocument();
    });

    it('shows an opponent win and automatically advances a surviving player to the next level', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.next = { kind: 'terminal', fen: choice.next.fen, decisionsTaken: 1, reason: 'checkmate', result: 'black' };
        renderGame(<App levels={[level, makeLevel('next', 30)]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByRole('heading', { name: 'Floor lost' })).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Checkmate' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next level' })).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1500); });
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
    });

    it('pauses automatic level advancement while the profile editor is open', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        const next = makeLevel('next', 30);
        renderGame(<App levels={[level, next]} />);
        selectQuality(level, 'best');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        openProfileEditor();
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '1');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        act(() => { vi.advanceTimersByTime(1500); });
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', next.root.fen);
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
    });

    it('handles an empty catalog and provides actionable loading warnings', () => {
        renderGame(<App levels={[makeLevel('unscored', -1)]} levelWarnings={['broken.json: invalid floor data.']} />);
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New run' })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('No scored, playable floors');
        fireEvent.click(screen.getByText('1 floor file(s) could not be loaded'));
        expect(screen.getByText('broken.json: invalid floor data.')).toBeVisible();
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
            if (index < 3) act(() => { vi.advanceTimersByTime(1500); });
        });
        finishPayout();
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        startRegular('Default');
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: '+1 health' })).not.toBeInTheDocument();
        selectQuality(levels[0]!, 'best');
        expect(screen.getByRole('status')).not.toHaveTextContent('+1 HP');
    });

    it('shows a persistent result and returns to supplies before replaying with the same set', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        renderSetup(<App levels={[level]} />);
        startRegular('Obsidian Order');
        selectQuality(level, 'bad');
        finishPayout();
        const result = screen.getByRole('region', { name: 'Run over' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(result).getByRole('heading', { name: 'Run over' })).toHaveFocus();
        const wallet = loadUserProgression();
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
        expect(screen.getByRole('heading', { name: 'Regular run' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Run supplies' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'obsidian');
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(loadUserProgression()).toEqual(wallet);
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
        openRegular();
        startRegular('Default');
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
            if (index < 9) act(() => { vi.advanceTimersByTime(1500); });
        }
        finishPayout();
        const saved = loadMultiplierProfile();
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(673);
        expect(saved.board).not.toEqual(initialMultiplierProfile().board);
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        act(() => { window.history.replaceState(null, '', '#/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(loadMultiplierProfile()).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        startRegular('Default');
        expect(loadMultiplierProfile()).toEqual(saved);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('awards Obsidian upgrades to its own profile and retains them across set changes', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`obsidian-${index}`, index));
        renderSetup(<App levels={levels} />);
        startRegular('Obsidian Order');
        for (let index = 0; index < 10; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 9) act(() => { vi.advanceTimersByTime(1500); });
        }
        finishPayout();
        const saved = loadMultiplierProfile('obsidian');
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(737);
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Change loadout' }));
        startRegular('Default');
        expect(loadMultiplierProfile()).toEqual(initialMultiplierProfile());
        expect(loadMultiplierProfile('obsidian')).toEqual(saved);
        openRegular();
        startRegular('Obsidian Order');
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(loadMultiplierProfile('obsidian')).toEqual(saved);
    });

    it('renders the installed chessboard with a real FEN', async () => {
        const actual = await vi.importActual<typeof import('react-chessboard')>('react-chessboard');
        const onSquareClick = vi.fn();
        const { container } = renderSetup(<actual.Chessboard options={{ position: makeLevel().root.fen, allowDragging: false, allowDrawingArrows: false, onSquareClick }} />);
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
