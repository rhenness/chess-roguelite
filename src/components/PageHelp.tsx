import type { DailyAttempt } from '../game/daily';
import { DAILY_COIN_MULTIPLIER } from '../game/daily';
import { LOADOUT_LIMIT } from '../game/items';
import { BEST_MOVE_STREAK_LENGTH, QUALITY_LABELS, QUALITY_ORDER, RUN_LEVEL_COUNT, type RunRules } from '../game/run';
import type { Page } from '../game/usePageNavigation';
import type { EndlessSession } from '../features/endless/types';
import type { MoveQuality } from '../types/level';

interface PageHelpProps {
    page: Page;
    rules: RunRules;
    result: boolean;
    dailyRun: boolean;
    dailyStatus?: DailyAttempt['status'];
    dailyClosed: boolean;
    editingProfile: boolean;
    endless: EndlessSession | null;
    moveQualities?: readonly MoveQuality[];
    floorCount?: number;
}

const pageCopy = {
    play: {
        title: 'Choose your game',
        lines: [
            `Regular: tackle ${RUN_LEVEL_COUNT} floors and build your score.`,
            'Daily: one attempt at today’s dungeon, with extra rewards.',
            'Endless: play both sides and keep going for as long as you survive.',
        ],
    },
    regular: {
        title: 'Choosing your set',
        lines: [
            'Choose a skill level; your latest choice is remembered. Your set determines starting health and the square multipliers used at the end of your run.',
            'Finish runs to unlock more sets. Each locked set shows how many runs you need.',
            'Tap the sparkle beside a set to spend coins on permanent square multiplier increases.',
        ],
    },
    'regular-items': {
        title: 'Choosing items',
        lines: [
            `Items are optional. Bring up to ${LOADOUT_LIMIT}, including duplicates.`,
            'Coins are spent when you start the run. Unused items expire when it ends.',
            'During play, activate an item before confirming your move.',
        ],
    },
    'endless-items': {
        title: 'Choosing items',
        lines: [
            `Items are optional. Bring up to ${LOADOUT_LIMIT}, including duplicates.`,
            'Coins are spent when you start the attempt. Unused items expire when it ends.',
            'During play, activate an item before confirming your move.',
        ],
    },
    endless: {
        title: 'Choosing Endless difficulty',
        lines: [
            'Play both sides. Checkmate or a draw starts a new board without ending the attempt.',
            'Standard: use health and optional items to build your score.',
            `Hardcore: no items. One ${QUALITY_LABELS.inaccuracy} or ${QUALITY_LABELS.bad} move ends the attempt; each ${QUALITY_LABELS.best} or ${QUALITY_LABELS.good} move adds one point.`,
        ],
    },
    leaderboards: {
        title: 'Daily leaderboard help',
        lines: [
            'Scores are ranked highest first. Equal scores share a rank. All skill levels share one leaderboard, with a skill badge on each entry.',
            'Finish today’s dungeon to add your final score.',
            'The other entries are demo players for now.',
        ],
    },
    profile: {
        title: 'Your profile',
        lines: [
            'Your card shows personal bests for Regular, Dungeon, Endless, and Hardcore.',
            `Endless uses your Standard score. Hardcore counts ${QUALITY_LABELS.best} and ${QUALITY_LABELS.good} moves before your first mistake.`,
            'Use the pencil beside your name to edit your name, avatar, and banner.',
        ],
    },
} satisfies Partial<Record<Page, { title: string; lines: string[] }>>;

export function PageHelp({ page, rules, result, dailyRun, dailyStatus, dailyClosed, editingProfile, endless, moveQualities, floorCount = RUN_LEVEL_COUNT }: PageHelpProps) {
    let title: string;
    let lines: string[];
    let gameDetails = false;
    const hardcore = page === 'endless-game' && endless?.mode === 'hardcore';
    const itemDetails = page === 'regular-items' || page === 'endless-items';

    if (page === 'game') {
        title = result ? 'Your run results' : dailyRun ? 'Playing the daily dungeon' : 'Playing a regular run';
        lines = result ? [
            'Your final score is your run score multiplied by the selected square’s multiplier.',
            'Coins come from unboosted points and a bonus for clearing every floor.',
            'Clear every floor to permanently upgrade one square for the set you used.',
        ] : [
            'Tap a piece, then an offered destination. Or tap a colored option twice. Colors identify options, not move quality.',
            `Start with ${rules.startingHealth} health. Health and score carry across floors. Mistakes cost health; ${BEST_MOVE_STREAK_LENGTH} ${QUALITY_LABELS.best} moves in a row restore one heart.`,
            dailyRun ? 'The dungeon resets at 00:00 UTC each day. Activate supplies before confirming a move.'
                : `Reach the end of up to ${floorCount} floors. Activate any items before confirming a move.`,
            'After rounds 3 and 6, choose one of two free items. Your choice goes into your inventory for later use.',
        ];
        gameDetails = !result;
    } else if (page === 'daily') {
        title = 'Daily dungeon help';
        lines = dailyStatus === 'finished' ? [
            'Your final score includes the selected square multiplier and is entered on this dungeon’s leaderboard.',
            `Daily runs award ${DAILY_COIN_MULTIPLIER} times the normal coins. Clearing every floor also upgrades one square.`,
            'You get one attempt per dungeon. Come back for the next one.',
        ] : dailyClosed || dailyStatus === 'expired' ? [
            'This dungeon has ended. Unfinished attempts reset without rewards.',
            'A new dungeon opens each day. Open today’s dungeon to play.',
        ] : [
            dailyStatus === 'active' ? 'Resume your existing attempt; your skill level is locked and you cannot restart this dungeon.' : 'Choose a skill level and set for your one attempt at today’s dungeon. Entering locks your skill level and consumes your attempt across all skill levels.',
            'The dungeon resets at 00:00 UTC each day. One of each item is supplied free.',
            `Earn ${DAILY_COIN_MULTIPLIER} times the normal coins. Clear every floor to upgrade one square.`,
        ];
    } else if (page === 'endless-game') {
        title = endless?.phase === 'finished' ? 'Your Endless results' : hardcore ? 'Playing Hardcore Endless' : 'Playing Standard Endless';
        lines = !endless ? [
            'Choose a difficulty and set on the Endless page to start an attempt.',
        ] : endless.phase === 'finished' ? [
            hardcore ? `Your score counts ${QUALITY_LABELS.best} and ${QUALITY_LABELS.good} moves made before the attempt ended.` : 'Your score adds up move points, including item boosts.',
            `Your longest streak counts consecutive ${QUALITY_LABELS.best} and ${QUALITY_LABELS.good} moves.`,
            'Coins come from unboosted points. Your result is saved in your profile.',
        ] : [
            'Play both sides. Tap a piece and an offered destination, or tap a colored option twice.',
            hardcore ? `${QUALITY_LABELS.best} and ${QUALITY_LABELS.good} moves add one point. One ${QUALITY_LABELS.inaccuracy} or ${QUALITY_LABELS.bad} move ends the attempt.`
                : `${QUALITY_LABELS.best} and ${QUALITY_LABELS.good} moves extend your streak. Mistakes break it and cost health; ${BEST_MOVE_STREAK_LENGTH} ${QUALITY_LABELS.best} moves in a row restore one heart.`,
            'Checkmate and draws start a new board. Your streak carries over.',
        ];
        gameDetails = !!endless && endless.phase !== 'finished';
    } else if (page === 'profile' && editingProfile) {
        title = 'Editing your profile';
        lines = ['Choose your display name, avatar, and banner.', 'Save to keep your changes, or cancel to leave your profile as it was.'];
    } else {
        ({ title, lines } = pageCopy[page]);
    }

    return <>
        <h2 id="game-rules">{title}</h2>
        {lines.map(line => <p key={line}>{line}</p>)}
        {gameDetails && <div className="help-details">
            <h3>{hardcore ? 'Controls' : 'Controls and scoring'}</h3>
            <p>Use arrow keys to switch colored options. Press Enter or Space once to select, then again to confirm.</p>
            <p>Move grades: {QUALITY_ORDER.map(quality => QUALITY_LABELS[quality]).join(' → ')}. Your score and hearts update after each move.</p>
            {!hardcore && <ul>{QUALITY_ORDER.filter(quality => !moveQualities || moveQualities.includes(quality)).map(quality => <li key={quality}>
                <strong>{QUALITY_LABELS[quality]}</strong>
                <span>{rules.points[quality] >= 0 ? '+' : ''}{rules.points[quality]} points / {rules.damage[quality]} health lost</span>
            </li>)}</ul>}
            {!hardcore && <p>Activate items before confirming a move. Effects carry across floors or boards. Shields block damage, but mistakes still break your streak. Score boosts apply to positive points and do not increase coin earnings. Penalties can reduce your score to zero.</p>}
        </div>}
        {itemDetails && <div className="help-details">
            <h3>Item details</h3>
            <p>Timed effects spend a charge on each move you play and carry across floors or boards. A shield charge is spent even on a safe move; mistakes still break your streak.</p>
            <p>Score boosts do not increase coin earnings or checkmate bonus points.</p>
        </div>}
        <p className="help-page-note"><small>Help changes based on the page you’re viewing.</small></p>
    </>;
}
