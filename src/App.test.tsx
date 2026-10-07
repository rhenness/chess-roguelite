import { StrictMode, type ReactElement } from 'react';
import { Chess } from 'chess.js';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import type { GeneratedLevel, MoveQuality } from './types/level';
import { continueToNextRound, decision, makeLevel, makeSkillLevel } from './test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES } from './game/run';
import { ITEMS } from './game/items';
import { BOARD_SQUARES, formatMultiplier, initialMultiplierProfile, loadMultiplierProfile, MULTIPLIER_STORAGE_KEY } from './game/multipliers';
import { PIECE_SET_IDS, PIECE_SETS } from './game/pieceSets';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from './game/progression';
import { PIECE_RENDERERS } from './components/pieces/pieceRenderers';
import App from './App';
import { HELP_WELCOME_STORAGE_KEY } from './components/HelpWelcome';
import { finishPlayTutorial, initialPlayTutorial, PLAY_TUTORIAL_STORAGE_KEY, savePlayTutorial } from './game/playTutorial';
import { initialPlayerProfile, loadPlayerProfile, PLAYER_PROFILE_STORAGE_KEY, savePlayerProfile } from './game/playerProfile';
import { loadRunHistory, RUN_HISTORY_STORAGE_KEY, saveRunHistory, type RunRecord } from './game/runHistory';
import { ENDLESS_STORAGE_KEY, saveState } from './features/endless/storage';
import { REGULAR_STORAGE_KEY } from './game/regular';
import { loadPlayerLeveling, PLAYER_LEVELING_STORAGE_KEY, totalPlayerXp } from './game/playerLeveling';
import { createDailyDungeon, DAILY_STORAGE_KEY, enterDailyDungeon, initialDailyArchive, loadDailyArchive, recordDailyRun, saveDailyArchive, storeDailyDungeon } from './game/daily';

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
    savePlayTutorial(finishPlayTutorial(initialPlayTutorial()));
    window.history.replaceState(null, '', '#/play');
    window.localStorage.removeItem(HELP_WELCOME_STORAGE_KEY);
    window.localStorage.removeItem(DAILY_STORAGE_KEY);
    window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
    savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'intermediate' });
    window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
    window.localStorage.removeItem(ENDLESS_STORAGE_KEY);
    window.localStorage.removeItem(REGULAR_STORAGE_KEY);
    window.localStorage.removeItem(PLAYER_LEVELING_STORAGE_KEY);
    PIECE_SET_IDS.forEach(id => window.localStorage.removeItem(PIECE_SETS[id].storageKey));
    // Existing gameplay scenarios exercise all sets after they have been unlocked.
    saveUserProgression({ ...initialUserProgression(), finishedRuns: 8 });
});

function renderSetup(element: ReactElement) {
    const view = render(element);
    if (screen.queryByRole('heading', { name: /^(Knightfall|Home)$/, level: 1 })) {
        const regular = screen.getByRole('button', { name: 'Regular run' });
        if (!regular.hasAttribute('disabled')) fireEvent.click(regular);
    }
    return view;
}

function openRegular() {
    if (screen.queryByRole('button', { name: 'Back to sets' })) {
        fireEvent.click(screen.getByRole('button', { name: 'Back to sets' }));
    }
    if (!screen.queryByRole('heading', { name: 'Regular run', level: 1 })) {
        const modes = screen.queryByRole('link', { name: 'Knightfall home' });
        if (modes) fireEvent.click(modes);
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
    }
}

function startRegular(name = 'Default') {
    openRegular();
    fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: /^(Next: items|Start new run)$/ }));
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

function claimCheckpointReward() {
    const offers = screen.queryByRole('group', { name: 'Checkpoint items' });
    if (!offers) return;
    fireEvent.click(within(offers).getAllByRole('button')[0]!);
}

function resumeRegularFromHome() {
    openRegular();
    const resume = screen.queryByRole('button', { name: 'Resume regular run' });
    if (resume) fireEvent.click(resume);
}

function openRegularItems() {
    openRegular();
    fireEvent.click(screen.getByRole('button', { name: /^(Next: items|Start new run)$/ }));
}

function openProfileEditor() {
    if (!screen.queryByRole('dialog', { name: 'Your profile' }) && !screen.queryByRole('heading', { name: 'Your profile', level: 1 })) {
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
}

describe('skill selection', () => {
    const tierPool = () => [makeSkillLevel('beginner'), makeSkillLevel('intermediate'), makeSkillLevel('expert')];

    it.each(['regular', 'daily'] as const)('changes %s difficulty without walking catalog move trees again', page => {
        const pool = tierPool();
        const readFen = vi.fn();
        for (const level of pool) {
            const node = decision(level).choices[0]!.next;
            const fen = node.fen;
            Object.defineProperty(node, 'fen', { enumerable: true, get: () => { readFen(); return fen; } });
        }
        window.history.replaceState(null, '', `#/${page}`);
        render(<App levels={pool} />);
        readFen.mockClear();

        for (const tier of ['Beginner', 'Expert', 'Intermediate', 'Beginner']) {
            fireEvent.click(screen.getByRole('button', { name: tier }));
            expect(screen.getByRole('button', { name: tier })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByRole('button', { name: page === 'daily' ? 'Enter dungeon' : 'Next: items' })).toBeEnabled();
        }
        expect(readFen).not.toHaveBeenCalled();
    });

    it('requires a first choice before play, remembers it, and uses it for the guided first run', () => {
        window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
        window.localStorage.removeItem(PLAY_TUTORIAL_STORAGE_KEY);
        saveUserProgression(initialUserProgression());
        const pool = tierPool();
        const view = render(<App levels={pool} />);
        const home = screen.getByRole('region', { name: 'Knightfall' });
        const choices = within(home).getByRole('group', { name: 'How well do you know chess?' });
        expect(within(home).getByText('How well do you know chess?')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(home).getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Regular run' })).not.toBeInTheDocument();
        fireEvent.keyDown(choices, { key: 'Escape' });
        expect(choices).toBeInTheDocument();
        fireEvent.click(within(choices).getByRole('button', { name: 'Beginner' }));
        expect(within(choices).getByRole('button', { name: 'Beginner' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(home).getByRole('button', { name: 'Continue' }));
        expect(loadPlayerProfile().preferredSkillTier).toBe('beginner');
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(screen.getByRole('heading', { name: 'Your first run' })).toBeInTheDocument();
        const saved = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        expect(saved).toMatchObject({ skillTier: 'beginner', rules: { points: { best: 50, bad: 0 } } });
        expect(saved.levelIds).toEqual(['beginner']);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getAllByRole('button', { name: /^Option / })).toHaveLength(2);
        view.unmount();
        window.history.replaceState(null, '', '#/play');
        render(<App levels={pool} />);
        expect(screen.queryByRole('group', { name: 'How well do you know chess?' })).not.toBeInTheDocument();
    });

    it('opens first-time selection on Home even when arriving through a direct link', () => {
        window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
        window.history.replaceState(null, '', '#/daily');
        render(<App levels={tierPool()} />);
        expect(window.location.hash).toBe('#/play');
        expect(screen.getByRole('region', { name: 'Knightfall' })).toContainElement(screen.getByRole('group', { name: 'How well do you know chess?' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(screen.getByRole('button', { name: 'Regular run' })).toBeInTheDocument();
        expect(loadPlayerProfile().preferredSkillTier).toBe('expert');
    });

    it('remembers menu changes across refresh, while resumed runs retain their original tier and rules', () => {
        const pool = tierPool();
        const view = renderSetup(<App levels={pool} />);
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        expect(loadPlayerProfile().preferredSkillTier).toBe('expert');
        startRegular();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!)).toMatchObject({ skillTier: 'expert', rules: { points: { best: 150, inaccuracy: -25 } } });
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openRegular();
        fireEvent.click(screen.getByRole('button', { name: 'Beginner' }));
        view.unmount();
        window.history.replaceState(null, '', '#/play');
        renderSetup(<App levels={pool} />);
        expect(screen.getByRole('button', { name: 'Beginner' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Resume regular run' }));
        expect(screen.getByLabelText('Expert skill level')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!)).toMatchObject({ skillTier: 'expert', rules: { points: { best: 150 } } });
    });

    it('shows signed penalties and clamps the score without presenting a score boost for a penalty', () => {
        const pool = [makeSkillLevel('expert', 'expert-feedback', 60, 2)];
        savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'expert' });
        renderGame(<App levels={pool} />);
        selectQuality(pool[0]!, 'inaccuracy');
        expect(screen.getByRole('status', { name: 'Move quality' })).toHaveTextContent('-25 points');
        expect(screen.getByRole('status', { name: 'Move quality' })).not.toHaveTextContent('+-25');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
    });

    it('defaults Daily to the last selection, locks its tier, and keeps its attempt consumed after changing preferences', () => {
        const pool = [makeSkillLevel('beginner', 'daily-beginner', 10, 2), makeSkillLevel('expert', 'daily-expert', 60, 2), makeLevel('daily-legacy')];
        savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'expert' });
        const view = render(<App levels={pool} />);
        openDaily();
        expect(screen.getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Beginner' }));
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        const day = Object.values(loadDailyArchive(pool).days)[0]!;
        expect(day).toMatchObject({ skillTier: 'beginner', attempt: { skillTier: 'beginner', rules: { points: { best: 50 } } } });
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openRegular();
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        view.unmount();
        window.history.replaceState(null, '', '#/play');
        render(<App levels={pool} />);
        openDaily();
        expect(screen.getByRole('button', { name: 'Resume dungeon' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Enter dungeon' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Expert' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByLabelText('Beginner skill level')).toBeInTheDocument();
        expect(loadPlayerProfile().preferredSkillTier).toBe('expert');
    });

    it('keeps an unavailable tier explicit and lets the player choose another tier', () => {
        renderSetup(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        expect(screen.getByText(/No floors are available for this skill level/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next: items' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Intermediate' }));
        expect(screen.getByRole('button', { name: 'Next: items' })).toBeEnabled();
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Beginner' }));
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Intermediate' }));
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeEnabled();
    });

    it('preserves an attempt started in another tab when this tab changes its daily tier preview', () => {
        const pool = tierPool();
        render(<App levels={pool} />);
        openDaily();
        const entered = enterDailyDungeon(createDailyDungeon(pool, Date.now(), 'beginner'), 'default',
            { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, best: 50 } }, initialMultiplierProfile().board);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), entered.dungeon));
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        expect(screen.queryByRole('button', { name: 'Enter dungeon' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Resume dungeon' })).toBeInTheDocument();
        expect(loadDailyArchive(pool).days[entered.dungeon.day]?.attempt?.id).toBe(entered.run.id);
    });

    it('shows the daily attempt tier on the shared leaderboard even after the preference changes', () => {
        vi.useFakeTimers();
        const pool = [makeSkillLevel('beginner'), makeSkillLevel('expert'), makeLevel()];
        savePlayerProfile({ ...initialPlayerProfile(), preferredSkillTier: 'beginner' });
        render(<App levels={pool} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        selectQuality(pool[0]!, 'best');
        finishPayout();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openRegular();
        fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
        fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
        const own = within(screen.getByRole('list', { name: 'Daily standings' })).getByRole('listitem', { name: /, you,/ });
        expect(within(own).getByLabelText('Beginner skill level')).toBeInTheDocument();
    });
});

describe('first play tutorial', () => {
    function newPlayer() {
        window.localStorage.removeItem(PLAY_TUTORIAL_STORAGE_KEY);
        saveUserProgression(initialUserProgression());
    }
    function beginMoveLesson() {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    function continueLessons(keepItem = true) {
        for (const title of ['Read your move', 'Keep an eye on your hearts', 'Build a Best streak']) {
            expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        }
        expect(screen.getByRole('heading', { name: 'Keep going between rounds' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        if (keepItem) {
            finishPlayback();
            if (screen.queryByRole('heading', { name: 'Try your item' })) {
                fireEvent.click(screen.getByRole('button', { name: 'Keep for later' }));
            }
        }
    }
    function finishPlayback() {
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        act(() => { vi.advanceTimersByTime(1500); });
    }

    it('locks other modes and non-Home navigation until the first run ends, including after a refresh', () => {
        newPlayer();
        const level = makeLevel('locked-first-play', 50, 2);
        let view = render(<App levels={[level]} />);
        function expectLockedHome() {
            expect(screen.getByRole('button', { name: 'Regular run' })).toBeEnabled();
            for (const name of ['Daily dungeon', 'Endless']) {
                const button = screen.getByRole('button', { name });
                expect(button).toBeDisabled();
                expect(button).not.toHaveAttribute('aria-describedby', 'menu-unlock-hint');
                fireEvent.click(button);
            }
            expect(screen.queryByText(/Finish your first regular run/)).not.toBeInTheDocument();
            const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
            expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#/play');
            for (const name of ['Dungeon', 'Leaderboards', 'Profile']) {
                const link = within(navigation).getByRole('link', { name });
                expect(link).toHaveAttribute('aria-disabled', 'true');
                expect(link).not.toHaveAttribute('href');
                expect(link).toHaveAttribute('tabindex', '-1');
                fireEvent.click(link);
                fireEvent.click(link, { ctrlKey: true });
            }
            expect(window.location.hash).toBe('#/play');
        }
        expectLockedHome();
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
        const savedId = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id;
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expectLockedHome();
        view.unmount();
        view = render(<App levels={[level]} />);
        expectLockedHome();
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id).toBe(savedId);
        expect(screen.getByTestId('board')).toBeInTheDocument();
    });

    it.each(['best', 'bad'] as const)('unlocks modes and navigation after the first run ends with a %s move and preserves it on refresh', quality => {
        vi.useFakeTimers();
        newPlayer();
        const level = makeLevel('unlock-first-play');
        const view = renderGame(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
        selectQuality(level, quality);
        finishPlayback();
        finishPayout();
        expect(loadUserProgression().finishedRuns).toBe(1);
        const earnedXp = 100;
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(earnedXp);
        expect(screen.getByLabelText(`Earned ${earnedXp} XP`)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        function expectUnlockedHome() {
            expect(screen.getByRole('button', { name: 'Daily dungeon' })).toBeEnabled();
            expect(screen.getByRole('button', { name: 'Endless' })).toBeEnabled();
            const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
            for (const name of ['Dungeon', 'Leaderboards', 'Profile']) {
                const link = within(navigation).getByRole('link', { name });
                expect(link).not.toHaveAttribute('aria-disabled');
                expect(link).toHaveAttribute('href');
            }
            expect(screen.queryByText(/Finish your first regular run/)).not.toBeInTheDocument();
        }
        expectUnlockedHome();
        view.unmount();
        render(<App levels={[level]} />);
        expectUnlockedHome();
        fireEvent.click(screen.getByRole('button', { name: 'Endless' }));
        expect(window.location.hash).toBe('#/endless');
    });

    it('teaches a real piece/destination move, holds its feedback, and keeps the damage example separate from health', () => {
        vi.useFakeTimers();
        newPlayer();
        const level = makeLevel('tutorial-opening', 50, 2);
        renderGame(<App levels={[level]} />);
        expect(screen.getByRole('heading', { name: 'Your first run' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.queryByText(/multiplier/i)).not.toBeInTheDocument();
        beginMoveLesson();
        expect(screen.getByRole('heading', { name: 'Choose a move' })).toBeInTheDocument();
        expect(screen.getByText(/You can also use the board:/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Available moves' }).querySelector('.tutorial-target')).toHaveAttribute('data-move', decision(level).choices.find(choice => choice.quality === 'best')!.playerMove.uci);
        const move = decision(level).choices[0]!;
        const from = move.playerMove.uci.slice(0, 2);
        const to = move.playerMove.uci.slice(2, 4);
        fireEvent.click(screen.getByRole('button', { name: `Square ${from}` }));
        expect(screen.getByRole('heading', { name: 'Choose a destination' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `Square ${to}` }));
        expect(screen.getByRole('heading', { name: 'Read your move' })).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 100')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(10000); });
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', move.fenAfterPlayerMove);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByRole('img', { name: /Example only:/ })).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 100')).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', move.fenAfterPlayerMove);
    });

    it.each([0, 1])('keeps checkpoint choices free of tutorial prompts with %i prior finished runs', finishedRuns => {
        vi.useFakeTimers();
        newPlayer();
        if (finishedRuns) {
            saveUserProgression({ ...initialUserProgression(), finishedRuns });
            savePlayTutorial(finishPlayTutorial(initialPlayTutorial()));
        }
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`tutorial-${index}`, 45 + index));
        renderGame(<App levels={levels} />);
        if (!finishedRuns) beginMoveLesson();
        selectQuality(levels[0]!, 'best');
        if (!finishedRuns) continueLessons();
        finishPlayback();
        for (let index = 1; index < 3; index++) { selectQuality(levels[index]!, 'best'); finishPlayback(); }
        expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument();
        const offers = screen.getByRole('group', { name: 'Checkpoint items' });
        fireEvent.click(within(offers).getAllByRole('button')[0]!);
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Try your item' })).not.toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(PLAY_TUTORIAL_STORAGE_KEY)!).status).toBe('done');
    });

    it('resumes guidance after refresh, permits skipping, and leaves the multiplier presentation unchanged', () => {
        vi.useFakeTimers();
        newPlayer();
        const level = makeLevel('tutorial-resume', 50, 1);
        let view = renderGame(<App levels={[level]} />);
        beginMoveLesson();
        const move = selectQuality(level, 'good');
        view.unmount();
        view = render(<App levels={[level]} />);
        resumeRegularFromHome();
        expect(screen.getByRole('heading', { name: 'Read your move' })).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', move.fenAfterPlayerMove);
        fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
        finishPlayback();
        finishPayout();
        expect(screen.queryByText(/how to upgrade|selected square/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
        startRegular();
        expect(screen.queryByRole('heading', { name: 'Your first run' })).not.toBeInTheDocument();
    });

    it('teaches the free potion after explaining rounds, then resumes without giving or using it twice', () => {
        vi.useFakeTimers();
        newPlayer();
        const level = makeLevel('starting-tutorial-item', 50, 2);
        let view = renderGame(<App levels={[level]} />);
        const saved = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        expect(saved.initialItems).toEqual({ 'healing-potion': 1 });
        expect(loadUserProgression().coins).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByRole('heading', { name: 'Choose a move' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Try your item' })).not.toBeInTheDocument();
        selectQuality(level, 'best');
        expect(screen.getByRole('heading', { name: 'Read your move' })).toBeInTheDocument();
        continueLessons(false);
        finishPlayback();
        expect(screen.getByRole('heading', { name: 'Try your item' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        const best = decision(level).choices.find(choice => choice.quality === 'best')!;
        for (const square of [best.playerMove.uci.slice(0, 2), best.playerMove.uci.slice(2, 4)]) {
            fireEvent.click(screen.getByRole('button', { name: `Square ${square}` }));
        }
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).checkpoint.moves).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Healing Potion, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel use of Healing Potion' }));
        expect(screen.getByRole('button', { name: 'Healing Potion, 1 remaining' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Healing Potion, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Healing Potion' }));
        expect(screen.getByRole('heading', { name: 'You’re ready' })).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 4')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 100')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).checkpoint.itemUses).toHaveLength(1);
        view.unmount();
        view = render(<App levels={[level]} />);
        resumeRegularFromHome();
        expect(screen.getByRole('heading', { name: 'You’re ready' })).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 4')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Healing Potion, 1 remaining' })).not.toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id).toBe(saved.id);
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).checkpoint.itemUses).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Continue playing' }));
        expect(screen.getByLabelText('Available moves')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(PLAY_TUTORIAL_STORAGE_KEY)!).status).toBe('done');
        expect(loadUserProgression().coins).toBe(0);
    });

    it('leaves normal purchased loadouts unchanged and does not show a separate item guide', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 70 });
        renderSetup(<App levels={[makeLevel('normal-items', 50, 2)]} />);
        openRegularItems();
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        startRegular();
        expect(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Healing Potion, 1 remaining' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(40);
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).initialItems).toEqual({ 'triple-crown': 1 });
    });

    it('replays from Help on the current run without spending coins, replacing the run, or making a move', () => {
        const level = makeLevel('replay-guide', 50, 2);
        renderGame(<App levels={[level]} />);
        const saved = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        fireEvent.click(screen.getByRole('button', { name: 'Replay play tutorial' }));
        expect(screen.getByRole('heading', { name: 'Your first run' })).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id).toBe(saved.id);
        expect(loadUserProgression().coins).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        selectQuality(level, 'best');
        expect(screen.getByRole('heading', { name: 'Read your move' })).toBeInTheDocument();
    });

    it('keeps the regular guide paused during dungeon play', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const level = makeLevel('tutorial-daily', 50, 2);
        renderGame(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        fireEvent.click(screen.getByRole('button', { name: 'Replay play tutorial' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(screen.queryByRole('heading', { name: 'Choose a move' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument();
        selectQuality(level, 'best');
        expect(JSON.parse(window.localStorage.getItem(PLAY_TUTORIAL_STORAGE_KEY)!).step).toBe('piece');
        resumeRegularFromHome();
        expect(screen.getByRole('heading', { name: 'Choose a move' })).toBeInTheDocument();
    });

    it('starts a new player directly from the menu and resumes that same run on their return', () => {
        newPlayer();
        render(<App levels={[makeLevel('first-menu', 50, 2)]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(window.location.hash).toBe('#/game');
        expect(screen.getByRole('heading', { name: 'Your first run' })).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'default');
        expect(screen.queryByRole('region', { name: 'Run supplies' })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(0);
        const saved = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        expect(saved.initialItems).toEqual({ 'healing-potion': 1 });
        const id = saved.id;
        fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(window.location.hash).toBe('#/game');
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id).toBe(id);
        expect(screen.queryByRole('heading', { name: 'Your first run' })).not.toBeInTheDocument();
    });

    it('guides two taps on a colored move square without automatically playing a move', () => {
        newPlayer();
        const level = makeLevel('option-guide', 50, 2);
        renderGame(<App levels={[level]} />);
        beginMoveLesson();
        const bestMove = decision(level).choices.find(choice => choice.quality === 'best')!;
        const option = screen.getByRole('button', { name: name => name.startsWith('Option ') && name.includes(`: ${bestMove.playerMove.san},`) });
        expect(option).toHaveClass('tutorial-target');
        fireEvent.click(option);
        expect(screen.getByRole('heading', { name: 'Confirm your move' })).toBeInTheDocument();
        expect(option).toHaveClass('tutorial-target');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        fireEvent.click(option);
        expect(screen.getByRole('heading', { name: 'Read your move' })).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 100')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).checkpoint.moves).toHaveLength(1);
    });
});

describe('regular run persistence', () => {
    it('resumes after refreshing during a move and continues playback without scoring it again', () => {
        vi.useFakeTimers();
        const level = makeLevel('regular-refresh', 50, 2);
        const view = renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        expect(window.localStorage.getItem(REGULAR_STORAGE_KEY)).not.toBeNull();
        view.unmount();
        render(<App levels={[level]} />);
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        resumeRegularFromHome();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getAllByRole('button', { name: /^Option / })).toHaveLength(4);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
    });

    it('restores the current floor after advancement and replaces the save when starting a new run', () => {
        vi.useFakeTimers();
        const levels = [makeLevel('regular-first', 50), makeLevel('regular-second', 60)];
        const view = renderGame(<App levels={levels} />);
        selectQuality(levels[0]!, 'good');
        act(() => { vi.advanceTimersByTime(1400); });
        act(() => { vi.advanceTimersByTime(1000); });
        act(() => { vi.advanceTimersByTime(1500); });
        const oldId = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id;
        view.unmount();
        render(<App levels={levels} />);
        resumeRegularFromHome();
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', levels[1]!.root.fen);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        startRegular();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).id).not.toBe(oldId);
    });

    it('keeps a paused regular run saved when a daily dungeon is entered and refreshed', () => {
        vi.useFakeTimers();
        const level = makeLevel('regular-and-daily', 50, 2);
        const view = renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        view.unmount();
        render(<App levels={[level]} />);
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        expect(screen.getByRole('button', { name: 'Daily dungeon' })).toHaveAccessibleDescription(/In progress · Floor 1/);
        resumeRegularFromHome();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('restores the chosen set and purchased supplies without charging again or replaying item notices', () => {
        vi.useFakeTimers();
        const level = makeLevel('regular-supplies', 50, 3);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 8, coins: 70 });
        const view = renderSetup(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        openRegularItems();
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bring Healing Potion for 20 coins' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Triple Crown' }));
        view.unmount();
        render(<App levels={[level]} />);
        resumeRegularFromHome();
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'obsidian');
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText(/Triple Crown: 3 moves remaining/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Healing Potion, 1 remaining' })).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: /Triple Crown/ })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(20);
    });

    it('clears the save once a finished run is recorded so refresh cannot resume or reward it again', () => {
        vi.useFakeTimers();
        const level = makeLevel('regular-finished');
        const view = renderGame(<App levels={[level]} />);
        selectQuality(level, 'good');
        finishPayout();
        expect(window.localStorage.getItem(REGULAR_STORAGE_KEY)).toBeNull();
        const coins = loadUserProgression().coins;
        const history = loadRunHistory();
        view.unmount();
        render(<App levels={[level]} />);
        openRegular();
        expect(screen.queryByRole('button', { name: 'Resume regular run' })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(coins);
        expect(loadRunHistory()).toEqual(history);
    });
});

describe('run reward checkpoints', () => {
    it.each(['regular', 'daily'] as const)('shows %s rewards over a cleared board after rounds 3 and 6 and takes an item with one tap', mode => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`checkpoint-${index}`, 45 + index));
        renderSetup(<App levels={levels} />);
        if (mode === 'regular') startRegular();
        else {
            openDaily();
            fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        }
        const coins = loadUserProgression().coins;
        const checkpointDots = [screen.getByTitle('Checkpoint after floor 3'), screen.getByTitle('Checkpoint after floor 6')];
        expect(checkpointDots[0]).toHaveClass('checkpoint-dot', 'future');
        expect(checkpointDots[1]).toHaveClass('checkpoint-dot', 'future');
        expect(screen.getByRole('progressbar', { name: 'Run progress' }).children).toHaveLength(12);
        for (let round = 1; round <= 9; round++) {
            selectQuality(levels[round - 1]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            act(() => { vi.advanceTimersByTime(1500); });
            if (round !== 3 && round !== 6) {
                expect(screen.queryByRole('group', { name: 'Checkpoint items' })).not.toBeInTheDocument();
                continue;
            }
            const heading = screen.getByRole('heading', { name: 'Choose your reward' });
            expect(heading).toHaveFocus();
            expect(heading.closest('.board-wrap')).toContainElement(screen.getByTestId('board'));
            expect(screen.getByText(`Round ${round} cleared`)).toBeInTheDocument();
            expect(screen.getByTitle(`Checkpoint after floor ${round}`)).toHaveClass('current');
            expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuetext', `Checkpoint after floor ${round} of 10`);
            expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
            expect(screen.getByTestId('board')).toHaveAttribute('data-arrows', '[]');
            expect(screen.getByTestId('board')).toHaveAttribute('data-square-styles', '{}');
            expect(screen.queryByLabelText('Available moves')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Take item & continue' })).not.toBeInTheDocument();
            expect(screen.queryByText(/In your inventory:/)).not.toBeInTheDocument();
            const offers = within(screen.getByRole('group', { name: 'Checkpoint items' })).getAllByRole('button');
            expect(offers).toHaveLength(2);
            const health = screen.getByLabelText(/^Health:/).textContent;
            act(() => { vi.advanceTimersByTime(10000); });
            expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
            fireEvent.click(offers[0]!);
            expect(screen.getByTitle(`Checkpoint after floor ${round}`)).toHaveClass('past');
            expect(screen.queryByRole('heading', { name: 'Choose your reward' })).not.toBeInTheDocument();
            expect(screen.getByTestId('board')).toHaveAttribute('data-position', levels[round]!.root.fen);
            expect(screen.getByLabelText(/^Health:/)).toHaveTextContent(health!);
            expect(loadUserProgression().coins).toBe(coins);
        }
    });

    it.each(['regular', 'daily'] as const)('preserves %s offers on refresh and grants the chosen item once', mode => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const levels = Array.from({ length: 7 }, (_, index) => makeLevel(`resume-checkpoint-${index}`, 45 + index));
        let view = renderSetup(<App levels={levels} />);
        if (mode === 'regular') startRegular();
        else { openDaily(); fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' })); }
        for (let index = 0; index < 3; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            act(() => { vi.advanceTimersByTime(1500); });
        }
        const offerText = screen.getByRole('group', { name: 'Checkpoint items' }).textContent;
        view.unmount();
        view = render(<App levels={levels} />);
        if (mode === 'regular') resumeRegularFromHome();
        else { openDaily(); fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' })); }
        expect(screen.getByRole('group', { name: 'Checkpoint items' })).toHaveTextContent(offerText!);
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', '{}');
        const saved = mode === 'regular' ? JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!).checkpoint
            : loadDailyArchive(levels).days['2026-10-05']!.attempt!.checkpoint;
        const id = saved.checkpointRewards[0].offers[0] as keyof typeof ITEMS;
        claimCheckpointReward();
        expect(screen.getByRole('button', { name: `${ITEMS[id].name}, ${mode === 'regular' ? 1 : 2} remaining` })).toBeInTheDocument();
        view.unmount();
        render(<App levels={levels} />);
        if (mode === 'regular') resumeRegularFromHome();
        else { openDaily(); fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' })); }
        expect(screen.queryByRole('group', { name: 'Checkpoint items' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: `${ITEMS[id].name}, ${mode === 'regular' ? 1 : 2} remaining` })).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', levels[3]!.root.fen);
    });
});

describe('regular setup steps', () => {
    it('requires the items step before starting and preserves selections when returning to sets', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 8, coins: 70 });
        renderSetup(<App levels={[makeLevel()]} />);
        expect(screen.queryByRole('region', { name: 'Run supplies' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(window.location.hash).toBe('#/regular-items');
        expect(screen.getByRole('heading', { name: 'Choose your items' })).toHaveFocus();
        expect(screen.queryByRole('button', { name: 'Default' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Bring Triple Crown for 30 coins' }));
        expect(loadUserProgression().coins).toBe(70);
        fireEvent.click(screen.getByRole('button', { name: 'Back to sets' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { name: 'Regular run' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Gilded Court' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(screen.getByRole('region', { name: 'Run supplies' })).toHaveTextContent('Total 30');
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'gilded');
        expect(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' })).toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(40);
    });

    it('restores each setup step and its scroll position through browser navigation', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 20 });
        renderSetup(<App levels={[makeLevel()]} />);
        const content = screen.getByRole('region', { name: 'Regular run' }).querySelector<HTMLElement>('[data-page-scroll="regular-setup"]')!;
        content.scrollTop = 210;
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(content.scrollTop).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: 'Bring Healing Potion for 20 coins' }));
        content.scrollTop = 90;
        act(() => {
            window.history.replaceState(null, '', '#/regular');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(screen.getByRole('heading', { name: 'Regular run' })).toHaveFocus();
        expect(content.scrollTop).toBe(210);
        act(() => {
            window.history.replaceState(null, '', '#/regular-items');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(screen.getByRole('heading', { name: 'Choose your items' })).toHaveFocus();
        expect(content.scrollTop).toBe(90);
        expect(screen.getByRole('region', { name: 'Run supplies' })).toHaveTextContent('Total 20');
        expect(loadUserProgression().coins).toBe(20);
    });
});

describe('welcome help tip', () => {
    it('opens automatically from the help icon on Home without taking keyboard focus', () => {
        render(<App levels={[makeLevel()]} />);
        const tip = screen.getByRole('complementary', { name: 'Need help?' });
        expect(tip).toHaveTextContent('This Help menu explains whatever page you’re viewing.');
        expect(tip.parentElement).toBe(document.body);
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
        expect(within(tip).getByRole('button', { name: 'OK' })).toBeVisible();
        expect(within(tip).getAllByRole('button')).toHaveLength(1);
    });

    it('waits for the first Home entry and stays dismissed when returning during the same visit', () => {
        window.history.replaceState(null, '', '#/regular');
        render(<App levels={[makeLevel()]} />);
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        expect(screen.getByRole('complementary', { name: 'Need help?' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
    });

    it('remembers OK across visits and restores focus to help', () => {
        const view = render(<App levels={[makeLevel()]} />);
        const okay = screen.getByRole('button', { name: 'OK' });
        okay.focus();
        fireEvent.click(okay);
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Help for this page' })).toHaveFocus();
        expect(window.localStorage.getItem(HELP_WELCOME_STORAGE_KEY)).toBe('true');
        view.unmount();
        render(<App levels={[makeLevel()]} />);
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
    });

    it('keeps page help available after dismissing the welcome tip', () => {
        const view = render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        view.unmount();
        render(<App levels={[makeLevel()]} />);
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        expect(screen.getByRole('dialog', { name: 'Choose your game' })).toBeVisible();
    });

    it('dismisses with Escape or outside taps without changing the permanent preference', () => {
        const view = render(<App levels={[makeLevel()]} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        view.unmount();
        render(<App levels={[makeLevel()]} />);
        fireEvent.pointerDown(screen.getByRole('heading', { name: 'Home', level: 1 }));
        expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        expect(window.localStorage.getItem(HELP_WELCOME_STORAGE_KEY)).toBeNull();
    });

    it('still dismisses when saving the preference is unavailable', () => {
        render(<App levels={[makeLevel()]} />);
        const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
        try {
            fireEvent.click(screen.getByRole('button', { name: 'OK' }));
            expect(screen.queryByRole('complementary', { name: 'Need help?' })).not.toBeInTheDocument();
        } finally { save.mockRestore(); }
    });
});

describe('page help', () => {
    it.each([
        ['play', 'Choose your game', 'Regular: tackle'],
        ['regular', 'Choosing your set', 'Your set determines starting health'],
        ['regular-items', 'Choosing items', 'Coins are spent when you start the run.'],
        ['daily', 'Daily dungeon help', 'one attempt at today’s dungeon'],
        ['endless', 'Choosing Endless difficulty', 'Standard: use health'],
        ['endless-items', 'Choosing items', 'Coins are spent when you start the attempt.'],
        ['leaderboards', 'Daily leaderboard help', 'Equal scores share a rank.'],
        ['profile', 'Your profile', 'Your card shows personal bests for Regular, Dungeon, Endless, and Hardcore.'],
    ])('shows concise help for %s without gameplay rules', (page, title, content) => {
        window.history.replaceState(null, '', `#/${page}`);
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        const help = screen.getByRole('dialog', { name: title });
        expect(help).toHaveTextContent(content);
        expect(within(help).getByText('Help changes based on the page you’re viewing.')).toBeVisible();
        expect(help.querySelector('details')).toBeNull();
        if (page === 'regular-items' || page === 'endless-items') {
            expect(within(help).getByText(/Timed effects spend a charge/)).toBeVisible();
        }
        expect(help.querySelectorAll(':scope > p:not(.help-page-note)')).toHaveLength(3);
        expect(help).not.toHaveTextContent('health lost');
        expect(within(help).queryByText(/Use arrow keys/)).not.toBeInTheDocument();
    });

    it('dismisses help on browser navigation and shows the new page’s content when reopened', () => {
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        expect(screen.getByRole('dialog', { name: 'Choose your game' })).toBeInTheDocument();
        act(() => {
            window.history.replaceState(null, '', '#/regular-items');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        const help = screen.getByRole('dialog', { name: 'Choosing items' });
        expect(help).toHaveTextContent('Unused items expire when it ends.');
        expect(help).not.toHaveTextContent('Daily: one attempt');
    });
});

describe('run supplies', () => {
    it('selects items in setup, charges once at entry, and brings only selected items', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 70 });
        renderSetup(<App levels={[makeLevel('supplies', 50, 3)]} />);
        expect(screen.queryByRole('link', { name: 'Shop' })).not.toBeInTheDocument();
        openRegularItems();
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
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 100 });
        renderSetup(<App levels={[makeLevel()]} />);
        openRegularItems();
        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Bring Healing Potion for 20 coins' }));
        expect(screen.getByRole('button', { name: 'Bring King’s Guard for 20 coins' })).toBeDisabled();
        startRegular();
        expect(loadUserProgression().coins).toBe(40);
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start new run' }));
        expect(loadUserProgression().coins).toBe(40);
        expect(screen.queryByRole('button', { name: 'Healing Potion, 3 remaining' })).not.toBeInTheDocument();
    });
    it('activates a boost, clears pending move confirmation, and shows actual points and duration', () => {
        vi.useFakeTimers();
        const level = makeLevel('boost-ui', 50, 3);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 30 });
        renderSetup(<App levels={[level]} />);
        openRegularItems();
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
        const level = makeLevel('shield-ui', 50, 3);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 20 });
        renderSetup(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
        openRegularItems();
        fireEvent.click(screen.getByRole('button', { name: 'Bring King’s Guard for 20 coins' }));
        startRegular();
        fireEvent.click(screen.getByRole('button', { name: 'King’s Guard, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of King’s Guard' }));
        expect(screen.getByLabelText(/King’s Guard: 3 moves remaining/)).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(1200); });
        selectQuality(level, 'bad');
        expect(screen.getByLabelText('Health: 1')).toBeInTheDocument();
        expect(screen.getByLabelText(/King’s Guard: 2 moves remaining/)).toBeInTheDocument();
        const notice = screen.getByRole('status', { name: 'Prevented 2 damage' });
        expect(notice).toHaveTextContent('Damage blocked');
        expect(screen.queryByRole('status', { name: /Run over|−2 health/ })).not.toBeInTheDocument();
        expect(loadUserProgression().coins).toBe(0);
    });
    it('resumes free daily item effects after remount without charging coins or replaying notices', () => {
        const level = makeLevel('daily-supplies', 50, 3);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 80 });
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
        const level = makeLevel('confirmation', 50, 3);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 20 });
        renderSetup(<App levels={[level]} />);
        openRegularItems();
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

describe('daily dungeon console reset', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    });

    it('clears an active attempt immediately, preserves the draw and other days, and starts fresh', () => {
        const level = makeLevel('reset-active', 50, 3);
        const yesterday = createDailyDungeon([level], Date.parse('2026-10-03T12:00:00Z'));
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), yesterday));
        render(<StrictMode><App levels={[level]} /></StrictMode>);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        fireEvent.click(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm use of Triple Crown' }));
        selectQuality(level, 'good');
        const before = loadDailyArchive([level]);
        expect(before.days['2026-10-04']!.attempt!.checkpoint.moves).toHaveLength(1);
        act(() => { expect(window.knightfall!.resetDailyDungeon()).toBe('2026-10-04'); });
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeEnabled();
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(3000); });
        const reset = loadDailyArchive([level]);
        expect(reset.days['2026-10-04']).toEqual({ ...before.days['2026-10-04'], attempt: null });
        expect(reset.days['2026-10-03']).toEqual(before.days['2026-10-03']);
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(loadDailyArchive([level]).days['2026-10-04']!.attempt!.id).not.toBe(before.days['2026-10-04']!.attempt!.id);
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Triple Crown, 1 remaining' })).toBeInTheDocument();
    });

    it('resets a finished attempt persistently without erasing rewards or awarding them again', () => {
        const level = makeLevel('reset-finished');
        const props = { levels: [level], rules: { ...DEFAULT_RULES, startingHealth: 1 } };
        const view = render(<App {...props} />);
        const initialCoins = loadUserProgression().coins;
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        selectQuality(level, 'best');
        finishPayout();
        const profile = loadUserProgression();
        expect(profile.coins).toBeGreaterThan(initialCoins);
        const history = loadRunHistory();
        expect(loadDailyArchive([level]).days['2026-10-04']!.attempt!.status).toBe('finished');
        act(() => { window.knightfall!.resetDailyDungeon(); });
        expect(loadUserProgression()).toEqual(profile);
        expect(loadRunHistory()).toEqual(history);
        view.unmount();
        expect(window.knightfall).toBeUndefined();
        render(<App {...props} />);
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        selectQuality(level, 'best');
        finishPayout();
        expect(loadUserProgression()).toEqual(profile);
    });

    it('preserves a paused regular run while clearing the active daily run', () => {
        const level = makeLevel('reset-regular', 50, 3);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        act(() => { window.knightfall!.resetDailyDungeon(); });
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        resumeRegularFromHome();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        openDaily();
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeEnabled();
    });

    it('keeps the current attempt intact if the reset cannot be saved', () => {
        const level = makeLevel('reset-storage');
        render(<App levels={[level]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        const before = loadDailyArchive([level]);
        const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        try {
            act(() => { expect(() => window.knightfall!.resetDailyDungeon()).toThrow('Could not save the daily dungeon reset'); });
            expect(screen.getByRole('region', { name: 'Daily game' })).toBeInTheDocument();
            expect(loadDailyArchive([level])).toEqual(before);
        } finally { write.mockRestore(); }
    });
});

describe('main navigation', () => {
    it('offers four destinations, leaves regular setup unhighlighted, and hides navigation during gameplay', () => {
        render(<App levels={[makeLevel()]} />);
        const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
        expect(within(navigation).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Dungeon', 'Leaderboards', 'Profile']);
        expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(navigation.querySelector('[aria-current="page"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Knightfall home' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Regular run' })).toBeInTheDocument();
    });

    it('pauses a regular move while visiting destinations and resumes the same playback from Home', () => {
        vi.useFakeTimers();
        const level = makeLevel('navigation-pause', 50, 2);
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
        resumeRegularFromHome();
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
        expect(screen.getByRole('textbox', { name: 'Display name' })).not.toHaveFocus();
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
    it.each([false, true])('shares the profile from the page or an in-game overlay (in-game: %s) and restores focus on close', async inGame => {
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        const view = inGame ? renderGame(<App levels={[makeLevel()]} />) : render(<App levels={[makeLevel()]} />);
        try {
            fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
            const trigger = screen.getByRole('button', { name: 'Share profile' });
            fireEvent.click(trigger);
            const dialog = screen.getByRole('dialog', { name: 'Share your profile' });
            expect(within(dialog).getByText('Massive Pawn')).toBeInTheDocument();
            expect(within(dialog).getByLabelText('High scores').children).toHaveLength(4);
            expect(within(dialog).queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
            await act(async () => {});
            fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
            expect(screen.queryByRole('dialog', { name: 'Share your profile' })).not.toBeInTheDocument();
            expect(trigger).toHaveFocus();
            if (inGame) {
                const profile = screen.getByRole('dialog', { name: 'Your profile' });
                fireEvent.click(within(profile).getByRole('button', { name: 'Close dialog' }));
                expect(screen.getByTestId('board')).toBeInTheDocument();
            } else {
                expect(window.location.hash).toBe('#/profile');
            }
        } finally { view.unmount(); vi.unstubAllGlobals(); }
    });

    it('opens the profile page from the main menu and returns through Home', () => {
        render(<App levels={[makeLevel()]} />);
        const avatar = screen.getByRole('button', { name: 'View profile' });
        fireEvent.click(avatar);
        const profile = screen.getByRole('region', { name: 'Your profile' });
        expect(window.location.hash).toBe('#/profile');
        expect(screen.getByRole('heading', { name: 'Your profile', level: 1 })).toHaveFocus();
        expect(within(profile).getByText('Massive Pawn')).toBeInTheDocument();
        expect(within(profile).queryByText('No runs yet')).not.toBeInTheDocument();
        const highScores = within(profile).getByLabelText('High scores');
        expect(highScores.children).toHaveLength(4);
        expect(within(highScores).getAllByRole('definition')).toHaveLength(4);
        within(highScores).getAllByRole('definition').forEach(score => expect(score).toHaveTextContent('—'));
        expect(within(profile).queryByText('Score history')).not.toBeInTheDocument();
        expect(within(profile).getByRole('button', { name: 'Play' })).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Display name' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
        expect(window.location.hash).toBe('#/play');
    });

    it('takes a new player from the card to the play menu', () => {
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        expect(window.location.hash).toBe('#/play');
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
    });

    it.each([0, 3, 8])('keeps the player card free of unlock explanations after %i finished runs', finishedRuns => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns });
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        const card = screen.getByRole('region', { name: 'Player card' });
        expect(card.querySelector('.profile-row-preview')).toHaveClass('banner-checkered');
        expect(card.querySelector('.profile-row-preview')).toHaveStyle({ backgroundImage: 'url("/profile/banners/checkered.svg")' });
        expect(card.querySelector('.profile-preview-rank')).toBeNull();
        expect(within(card).getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
        expect(within(card).getByRole('button', { name: 'Edit profile' }).closest('.profile-row-preview')).not.toBeNull();
        expect(within(card).getByRole('link', { name: 'Knightfall home' })).toBeInTheDocument();
        expect(within(card).queryByRole('heading', { name: 'Your profile' })).not.toBeInTheDocument();
        expect(screen.queryByText(/unlocked|Collection complete|Last adventure/)).not.toBeInTheDocument();
        expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
        expect(loadUserProgression().finishedRuns).toBe(finishedRuns);
    });

    it('shows all four high scores and footer branding in one card without a graph', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
        const sample = (id: string, date: string, score: number, mode: 'regular' | 'daily' = 'regular'): RunRecord => ({
            id, mode, finishedAt: Date.parse(`${date}T12:00:00Z`), ...(mode === 'daily' ? { dailyDay: date } : {}),
            score, floorsCompleted: 10, floorsTotal: 10, checkmates: 1, result: 'complete',
        });
        saveRunHistory({ version: 1, runs: [sample('old', '2026-09-01', 1000), sample('low', '2026-10-01', 100),
            sample('high', '2026-10-01', 400), sample('new', '2026-10-04', 300),
            { ...sample('daily', '2026-10-03', 800, 'daily'), floorsCompleted: 7, result: 'defeat' }] });
        saveState({ version: 1, session: null, records: [
            { id: 'standard-best', mode: 'standard', score: 1800, longestStreak: 7, moves: 30, gamesCompleted: 1, coins: 10, finishedAt: Date.now() - 1000 },
            { id: 'standard-longest', mode: 'standard', score: 500, longestStreak: 50, moves: 60, gamesCompleted: 1, coins: 5, finishedAt: Date.now() },
            { id: 'hardcore-best', mode: 'hardcore', score: 28, longestStreak: 28, moves: 29, gamesCompleted: 0, coins: 8, finishedAt: Date.now() - 1000 },
            { id: 'hardcore-newest', mode: 'hardcore', score: 12, longestStreak: 12, moves: 13, gamesCompleted: 0, coins: 3, finishedAt: Date.now() },
        ] });
        render(<App levels={[makeLevel()]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        const profile = screen.getByRole('region', { name: 'Your profile' });
        const highScores = within(profile).getByLabelText('High scores');
        expect(highScores.children).toHaveLength(4);
        expect(within(highScores).getByText('Best regular score').closest('dt')!.nextElementSibling).toHaveTextContent('1,000');
        expect(within(highScores).getByText('Best Dungeon score').closest('dt')!.nextElementSibling).toHaveTextContent('800');
        expect(within(highScores).getByText('Best Endless score').closest('dt')!.nextElementSibling).toHaveTextContent('1,800');
        const hardcore = within(highScores).getByText('Best Hardcore streak').closest('dt')!.nextElementSibling;
        expect(hardcore).toHaveTextContent('28');
        expect(hardcore).toHaveAttribute('aria-label', '28 moves');
        expect(within(profile).queryByText('Checkmates')).not.toBeInTheDocument();
        expect(within(profile).queryByText('Clears')).not.toBeInTheDocument();
        expect(profile.querySelector('details')).toBeNull();
        expect(within(profile).queryByText('Daily')).not.toBeInTheDocument();
        expect(within(profile).queryByText('Score history')).not.toBeInTheDocument();
        expect(profile.querySelector('.profile-score-chart')).toBeNull();
        expect(within(profile).queryByRole('group', { name: 'History period' })).not.toBeInTheDocument();
        expect(profile.closest('.app-shell')).not.toHaveClass('main-menu-shell');
        const card = within(profile).getByRole('region', { name: 'Player card' });
        expect(card).toContainElement(highScores);
        expect(within(highScores).getByText('Endless')).toBeVisible();
        expect(within(highScores).getByText('Hardcore')).toBeVisible();
        const brand = within(card).getByRole('link', { name: 'Knightfall home' });
        expect(highScores.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(loadRunHistory().runs).toHaveLength(5);
        expect(loadRunHistory().runs.find(run => run.id === 'daily')).toMatchObject({ score: 800, floorsCompleted: 7, result: 'defeat' });
        fireEvent.click(brand);
        expect(window.location.hash).toBe('#/play');
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
        expect(within(screen.getByLabelText('High scores')).getByText('Best regular score').closest('dt')!.nextElementSibling).toHaveTextContent(score!);
        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(loadRunHistory().runs).toHaveLength(1);
        view.unmount();
        render(<App levels={[level]} />);
        fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
        expect(within(screen.getByLabelText('High scores')).getByText('Best regular score').closest('dt')!.nextElementSibling).toHaveTextContent(score!);
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
        expect(within(screen.getByLabelText('High scores')).getByText('Best Dungeon score').closest('dt')!.nextElementSibling).toHaveTextContent(saved.attempt!.payout!.finalScore.toLocaleString());
        expect(screen.queryByRole('group', { name: 'Dungeon score history chart' })).not.toBeInTheDocument();
    });

    it('opens from the header, previews independent choices, and persists only on save', () => {
        const view = renderGame(<App levels={[makeLevel()]} />);
        openProfileEditor();
        const editor = screen.getByRole('dialog', { name: 'Edit profile' });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByRole('textbox', { name: 'Display name' })).not.toHaveFocus();
        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Castle Keeper' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rook avatar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sapphire avatar background' }));
        fireEvent.click(screen.getByRole('button', { name: 'Crimson court banner' }));
        const preview = screen.getByLabelText('Leaderboard appearance');
        expect(within(preview).getByText('Castle Keeper')).toBeInTheDocument();
        expect(preview).toHaveStyle({ backgroundImage: 'url("/profile/banners/crimson.svg")' });
        expect(preview.querySelector('.player-avatar')).toHaveStyle({ backgroundColor: '#345d85' });
        expect(preview.querySelector('img')).toHaveAttribute('src', '/profile/avatars/rook.svg');
        expect(loadPlayerProfile()).toEqual({ ...initialPlayerProfile(), preferredSkillTier: 'intermediate' });
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
        expect(loadPlayerProfile()).toEqual({ ...initialPlayerProfile(), preferredSkillTier: 'intermediate' });
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
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Default' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Coins: 0')).toBeInTheDocument();
        const home = screen.getByRole('region', { name: 'Overall player progression' });
        expect(within(home).getByText('Lv. 9')).toHaveTextContent('Silver · Lv. 9');
        expect(within(home).getByText('100 / 200 XP')).toBeInTheDocument();
        expect(within(home).getByRole('progressbar')).toHaveAttribute('aria-valuetext', expect.stringContaining('XP toward level'));
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveClass('visually-hidden');
        expect(document.querySelector('.header-player-level, .journey-controls, .journey-return')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
        expect(window.location.hash).toBe('#/regular');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(window.location.hash).toBe('#/play');
        expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
    });

    it('pauses browsing, preserves both runs, and requires explicit daily entry', () => {
        vi.useFakeTimers();
        const level = makeLevel('resumable', 50, 2);
        renderGame(<App levels={[level]} />);
        const choice = selectQuality(level, 'good');
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Obsidian Order' }));
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        expect(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days[Object.keys(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days)[0]!].attempt).toBeNull();
        act(() => { vi.advanceTimersByTime(5000); });
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Daily dungeon' })).toHaveAccessibleDescription(/In progress · Floor 1/);
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        openRegular();
        fireEvent.click(screen.getByRole('button', { name: 'Resume regular run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', choice.fenAfterPlayerMove);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
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
        expect(screen.getByRole('button', { name: 'Regular run' })).toBeInTheDocument();
        resumeRegularFromHome();
        expect(screen.getByRole('button', { name: pending! })).toHaveAttribute('aria-pressed', 'true');
    });

    it('restores a daily checkpoint after refresh, including automatic level advancement', () => {
        vi.useFakeTimers();
        const levels = [makeLevel('daily-first', 50), makeLevel('daily-next', 60)];
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
        expect(screen.getByRole('button', { name: 'Daily dungeon' })).toHaveAccessibleDescription(/In progress · Floor 2/);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Resume dungeon' }));
        expect(screen.getByRole('progressbar', { name: 'Run progress' })).toHaveAttribute('aria-valuenow', '2');
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', levels[1]!.root.fen);
        expect(screen.getByLabelText('Score: 75')).toBeInTheDocument();
    });

    it('silently opens today\'s unstarted dungeon at midnight and preserves the regular run', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T23:59:57Z'));
        const level = makeLevel('expiration', 50, 2);
        renderGame(<App levels={[level]} />);
        const position = screen.getByTestId('board').getAttribute('data-position');
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        fireEvent.click(screen.getByRole('button', { name: 'Daily leaderboard' }));
        act(() => { vi.advanceTimersByTime(3000); });
        expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Daily dungeon', level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(window.location.hash).toBe('#/daily');
        expect(loadUserProgression().coins).toBe(0);
        expect(JSON.parse(window.localStorage.getItem(DAILY_STORAGE_KEY)!).days['2026-10-04'].attempt.status).toBe('expired');
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt).toBeNull();
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        expect(screen.getByRole('button', { name: 'Regular run' })).toHaveAccessibleDescription('In progress · Floor 1');
        resumeRegularFromHome();
        expect(screen.getByTestId('board')).toHaveAttribute('data-position', position);
    });

    it('replaces yesterday\'s unfinished dated dungeon page at midnight', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-04T23:59:57Z'));
        const level = makeLevel('browsing-rollover', 50, 2);
        render(<App levels={[level]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        act(() => {
            window.history.replaceState(null, '', '#/daily/2026-10-04');
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        expect(screen.getByRole('button', { name: 'Resume dungeon' })).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(3000); });
        expect(window.location.hash).toBe('#/daily');
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Resume dungeon' })).not.toBeInTheDocument();
        expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt?.status).toBe('active');
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it.each(['active', 'expired'] as const)('resets a saved %s attempt from yesterday when reopening its page', status => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const level = makeLevel('reopened-rollover', 50, 2);
        const previousTime = Date.parse('2026-10-04T12:00:00Z');
        const entered = enterDailyDungeon(createDailyDungeon([level], previousTime), 'default', DEFAULT_RULES,
            initialMultiplierProfile().board, previousTime);
        entered.dungeon.attempt!.status = status;
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), entered.dungeon));
        window.history.replaceState(null, '', '#/daily/2026-10-04');
        render(<App levels={[level]} />);
        expect(window.location.hash).toBe('#/daily');
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Resume dungeon' })).not.toBeInTheDocument();
        expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt).toBeNull();
    });

    it.each(['expired', 'invalid checkpoint', 'missing floors'] as const)('reopens today\'s dungeon when its saved attempt has %s', reason => {
        vi.useFakeTimers();
        const now = Date.parse('2026-10-05T12:00:00Z');
        vi.setSystemTime(now);
        const level = makeLevel('current-dungeon', 50, 2);
        const savedLevel = reason === 'missing floors' ? makeLevel('retired-dungeon', 50, 2) : level;
        const entered = enterDailyDungeon(createDailyDungeon([savedLevel], now), 'default', DEFAULT_RULES,
            initialMultiplierProfile().board, now);
        if (reason === 'expired') entered.dungeon.attempt!.status = 'expired';
        if (reason === 'invalid checkpoint') {
            entered.dungeon.attempt!.checkpoint.moves.push({ levelId: savedLevel.id, uci: 'a1a8' });
        }
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), entered.dungeon));
        render(<App levels={[level]} />);
        expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText('Time until daily dungeon resets')).toHaveTextContent('12:00:00');
        openDaily();
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt).toMatchObject({ status: 'active' });
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt!.id).not.toBe(entered.run.id);
    });

    it('returns to a fresh dungeon when an unavailable attempt synchronizes from storage', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const level = makeLevel('synced-dungeon', 50, 2);
        render(<App levels={[level]} />);
        openDaily();
        fireEvent.click(screen.getByRole('button', { name: 'Enter dungeon' }));
        const archive = loadDailyArchive([level]);
        archive.days['2026-10-05']!.attempt!.status = 'expired';
        saveDailyArchive(archive);
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: DAILY_STORAGE_KEY })); });
        expect(screen.getByRole('button', { name: 'Enter dungeon' })).toBeInTheDocument();
        expect(screen.queryByText(/expired|No rewards earned/i)).not.toBeInTheDocument();
        expect(loadDailyArchive([level]).days['2026-10-05']!.attempt).toBeNull();
    });

    it('keeps yesterday\'s finished result available on its dated page', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        const level = makeLevel('finished-rollover', 50, 2);
        const previousTime = Date.parse('2026-10-04T12:00:00Z');
        const entered = enterDailyDungeon(createDailyDungeon([level], previousTime), 'default',
            { ...DEFAULT_RULES, startingHealth: 1 }, initialMultiplierProfile().board, previousTime);
        const run = chooseMove(entered.run, decision(level).choices.find(choice => choice.quality === 'bad')!.playerMove.uci);
        const finished = recordDailyRun(entered.dungeon, run, previousTime, () => 0);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), finished));
        window.history.replaceState(null, '', '#/daily/2026-10-04');
        render(<App levels={[level]} />);
        expect(window.location.hash).toBe('#/daily/2026-10-04');
        expect(screen.getByText('Final score')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: "Today's dungeon" })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Enter dungeon' })).not.toBeInTheDocument();
        expect(loadDailyArchive([level]).days['2026-10-04']!.attempt?.payout).toEqual(finished.attempt!.payout);
    });
});

describe('daily leaderboard interface', () => {
    it('offers a daily-only modal that returns to the same game and selection', () => {
        vi.useFakeTimers();
        renderGame(<App levels={[makeLevel('leaderboard', 50, 2)]} />);
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
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`reward-${index}`, 45 + index));
        const entered = enterDailyDungeon(createDailyDungeon(levels), 'default', DEFAULT_RULES, initialMultiplierProfile().board);
        let run = entered.run;
        for (let index = 0; index < 10; index++) {
            if (run.node.kind !== 'decision') throw new Error('Expected decision.');
            run = advancePlayback(advancePlayback(chooseMove(run, run.node.choices[0]!.playerMove.uci)));
            if (index < 9) run = continueToNextRound(run);
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
            fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
            expect(screen.getByLabelText('Coins: 139')).toBeInTheDocument();
            startRegular('Gilded Court');
            openRegular();
            expect(screen.getByLabelText('Coins: 139')).toBeInTheDocument();
        } finally { storage.mockRestore(); }
    });

    it('grants five times earned coins on defeat', () => {
        vi.useFakeTimers();
        const level = makeLevel('daily-reward', 50, 2);
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
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 80 });
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
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 30 });
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
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 1, coins: 60 });
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        try {
            const levels = [makeLevel('first', 50), makeLevel('second', 55)];
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
        const level = makeLevel('abandoned', 50, 2);
        window.history.replaceState(null, '', '#/regular');
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
        act(() => {
            window.history.replaceState(null, '', '#/regular');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
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
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
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
            render(<App levels={[level]} rules={{ ...DEFAULT_RULES, startingHealth: 1 }} />);
            fireEvent.click(screen.getByRole('button', { name: 'Intermediate' }));
            fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
            fireEvent.click(screen.getByRole('button', { name: 'Regular run' }));
            fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
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
        const level = makeLevel('board-taps', 50, 2, color);
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
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(screen.queryByTestId('board')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByLabelText(`Health: ${PIECE_SETS[set].startingHealth}`)).toBeInTheDocument();
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', set);
    });

    it('pauses playback while browsing and resumes without changing the run', () => {
        vi.useFakeTimers();
        const level = makeLevel('paused', 50, 2);
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
            const levels = [makeLevel('first', 50), makeLevel('second', 55)];
            renderSetup(<App levels={levels} />);
            startRegular('Obsidian Order');
            selectQuality(levels[0]!, 'good');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            act(() => { vi.advanceTimersByTime(1500); });
            selectQuality(levels[1]!, 'bad');
            expect(screen.getByLabelText('Health: 0')).toBeInTheDocument();
            finishPayout();
            expect(screen.getByText('50 1.3x')).toBeInTheDocument();
            expect(screen.getByText('Total score').nextElementSibling).toHaveTextContent('65');
            expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
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
        const first = makeLevel('first', 50, transition === 'branch' ? 2 : 1);
        const second = makeLevel('second', 55);
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
        renderGame(<App levels={[makeLevel('pointer', 50, 2)]} />);
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
        renderGame(<App levels={[makeLevel('focus', 50, 2)]} />);
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
        const level = makeLevel('black', 50, 1, 'black');
        renderGame(<App levels={[level, makeLevel('next', 60)]} />);
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
        expect(screen.getByLabelText('Run statistics').closest('.play-panel')).toBe(progress.parentElement?.nextElementSibling);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('puts black player moves and white replies in the correct history columns', () => {
        vi.useFakeTimers();
        const level = makeLevel('black', 50, 1, 'black');
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
        const easy = makeLevel('easy', 50, 1, 'black');
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
        const level = makeLevel('branches', 50, 2);
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
        const easy = makeLevel('easy', 50);
        const hard = makeLevel('hard', 65);
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
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
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
        const level = makeLevel('lethal', 57);
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
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
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
        const level = makeLevel('early-mate', 50, 4, playerColor);
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove,
            decisionsTaken: 1, reason: 'checkmate', result: playerColor };
        const next = makeLevel('next', 60);
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
        renderGame(<App levels={[level, makeLevel('next', 60)]} />);
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
        const next = makeLevel('next', 60);
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
        expect(screen.getByRole('button', { name: 'Regular run' })).toBeDisabled();
        expect(screen.getByText('No scored, playable floors.')).toHaveAttribute('role', 'status');
        fireEvent.click(screen.getByText('1 floor file(s) could not be loaded'));
        expect(screen.getByText('broken.json: invalid floor data.')).toBeVisible();
    });

    it('shows the configured scoring and health rules', () => {
        const rules = { ...DEFAULT_RULES, startingHealth: 5, points: { ...DEFAULT_RULES.points, best: 200 } };
        renderGame(<App levels={[makeLevel()]} rules={rules} />);
        fireEvent.click(screen.getByRole('button', { name: 'Help for this page' }));
        const help = screen.getByRole('dialog', { name: 'Playing a regular run' });
        expect(help).toHaveTextContent('Start with 5 health.');
        expect(within(help).getByText('+200 points / 0 health lost')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Help for this page' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows extra health on the fourth consecutive Best move and resets it on a new run', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 4 }, (_, index) => makeLevel(`streak-${index}`, 45 + index));
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
            claimCheckpointReward();
        });
        finishPayout();
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
        startRegular('Default');
        expect(screen.getByLabelText('Health: 3')).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: '+1 health' })).not.toBeInTheDocument();
        selectQuality(levels[0]!, 'best');
        expect(screen.getByRole('status')).not.toHaveTextContent('+1 HP');
    });

    it('shows a persistent result and returns to set selection before replaying', () => {
        vi.useFakeTimers();
        const level = makeLevel();
        renderSetup(<App levels={[level]} />);
        startRegular('Obsidian Order');
        selectQuality(level, 'bad');
        finishPayout();
        const result = screen.getByRole('region', { name: 'Run over' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(result).getByRole('heading', { name: 'Run over' })).toHaveFocus();
        expect(screen.queryByRole('button', { name: 'Change loadout' })).not.toBeInTheDocument();
        expect(within(result).getAllByRole('button').map(button => button.textContent)).toEqual(['Play again', 'Share run']);
        const wallet = loadUserProgression();
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
        expect(window.location.hash).toBe('#/regular');
        expect(screen.getByRole('heading', { name: 'Regular run' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Obsidian Order' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next: items' }));
        expect(screen.getByRole('heading', { name: 'Choose your items' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Run supplies' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
        expect(screen.getByTestId('board')).toHaveAttribute('data-piece-set', 'obsidian');
        expect(screen.getByLabelText('Health: 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
        expect(loadUserProgression()).toEqual(wallet);
    });

    it('shows the rules in an overlay and returns focus to help when dismissed', () => {
        renderGame(<App levels={[makeLevel()]} />);
        const help = screen.getByRole('button', { name: 'Help for this page' });
        fireEvent.click(help);
        expect(screen.getByRole('dialog', { name: 'Playing a regular run' }).closest('.game-layout')).toBeNull();
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
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`complete-${index}`, 45 + index));
        renderGame(<App levels={levels} />);
        for (let index = 0; index < 10; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 9) act(() => { vi.advanceTimersByTime(1500); });
            claimCheckpointReward();
        }
        finishPayout();
        const saved = loadMultiplierProfile();
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(673);
        expect(saved.board).not.toEqual(initialMultiplierProfile().board);
        fireEvent.click(screen.getByRole('link', { name: 'Knightfall home' }));
        act(() => { window.history.replaceState(null, '', '#/game'); window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(loadMultiplierProfile()).toEqual(saved);
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
        startRegular('Default');
        expect(loadMultiplierProfile()).toEqual(saved);
        expect(screen.getByLabelText('Score: 0')).toBeInTheDocument();
    });

    it('awards Obsidian upgrades to its own profile and retains them across set changes', () => {
        vi.useFakeTimers();
        const levels = Array.from({ length: 10 }, (_, index) => makeLevel(`obsidian-${index}`, 45 + index));
        renderSetup(<App levels={levels} />);
        startRegular('Obsidian Order');
        for (let index = 0; index < 10; index++) {
            selectQuality(levels[index]!, 'best');
            act(() => { vi.advanceTimersByTime(1400); });
            act(() => { vi.advanceTimersByTime(1000); });
            if (index < 9) act(() => { vi.advanceTimersByTime(1500); });
            claimCheckpointReward();
        }
        finishPayout();
        const saved = loadMultiplierProfile('obsidian');
        expect(Object.values(saved.board).reduce((sum, value) => sum + value, 0)).toBe(737);
        expect(window.localStorage.getItem(MULTIPLIER_STORAGE_KEY)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
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
