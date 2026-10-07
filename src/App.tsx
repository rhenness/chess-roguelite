import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { ArrowUp, Clock3, Coins, DoorOpen, Flag, Flame, Heart, Shield, Sparkles, Trophy, Unlock, X } from 'lucide-react';
import type { GeneratedLevel, PlayerChoice } from './types/level';
import { filterSkillTierLevels, selectLevels } from './game/levels';
import { BoardNotification, type BoardNotice } from './components/BoardNotification';
import { PlayMenu, formatCountdown } from './components/PlayMenu';
import { PieceSetPicker } from './components/PieceSetPicker';
import { DailyDungeonPage } from './components/DailyDungeonPage';
import { LeaderboardsPage } from './components/LeaderboardsPage';
import { PrimaryNavigation } from './components/PrimaryNavigation';
import { PageHelp } from './components/PageHelp';
import { HelpWelcome } from './components/HelpWelcome';
import { SkillTierPicker, SkillTierBadge } from './components/SkillTierPicker';
import { SKILL_TIER_CONFIG, type SkillTier } from './config/difficulty';
import { PlayTutorial } from './components/PlayTutorial';
import { usePlayTutorial } from './game/usePlayTutorial';
import { useGamepadControls } from './game/useGamepadControls';
import { ItemIcon, ItemLoadout, RunItems } from './components/RunItems';
import { RunCheckpointReward } from './components/RunCheckpointReward';
import { activateItem, canActivateItem, ITEMS, itemCount, loadoutCost, LOADOUT_LIMIT, type ItemId, type ItemInventory } from './game/items';
import { MoveOptions, OPTION_COLORS, CONFIRM_COLOR } from './components/MoveOptions';
import { RunBoardFrame, RunGate, RunHearts, RunScenery, RunScorePlaque } from './components/RunEnvironment';
import { BOARD_APPEARANCE } from './components/boardAppearance';
import { EndlessPage } from './features/endless/EndlessPage';
import { useEndlessSession } from './features/endless/useEndlessSession';
import { usePageNavigation } from './game/usePageNavigation';
import { MultiplierUpgrades } from './components/MultiplierUpgrades';
import { PlayerAvatar } from './components/PlayerAvatar';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileOverview } from './components/ProfileOverview';
import { ShareRunButton } from './components/ShareRunButton';
import { ShareRunDialog } from './components/ShareRunDialog';
import { ShareProfileDialog } from './components/ShareProfileDialog';
import { profileHighScores, type ProfileHighScore } from './game/shareProfile';
import { isSharePersonalBest, shareRegularRun, type ShareRunData, type ShareRunHandler } from './game/shareRun';
import { DailyLeaderboard } from './components/DailyLeaderboard';
import { dailyLeaderboard } from './game/leaderboard';
import { loadPlayerProfile, savePlayerProfile, type PlayerProfile } from './game/playerProfile';
import { PIECE_RENDERERS } from './components/pieces/pieceRenderers';
import { PIECE_SETS, type PieceSetId } from './game/pieceSets';
import { createDeathNotice, createHealthNotice, installNotificationConsole } from './components/notificationConsole';
import { BOARD_SQUARES, formatMultiplier, type PayoutResult } from './game/multipliers';
import { useBoardPayout } from './game/useBoardPayout';
import { useUserProgression } from './game/useUserProgression';
import { usePlayerLeveling } from './game/usePlayerLeveling';
import { dungeonRunXp } from './game/playerLeveling';
import { useRunHistory } from './game/useRunHistory';
import { isPieceSetUnlocked } from './game/progression';
import { runCoinReward } from './game/economy';
import { applyPaidUpgrades } from './game/economy';
import { useDailyDungeon } from './game/useDailyDungeon';
import { restoreDailyRun } from './game/daily';
import { clearRegularRun, loadRegularRun, saveRegularRun } from './game/regular';
import {
    advancePlayback, boardFen, chooseCheckpointItem, chooseMove, nextLevel,
    QUALITY_LABELS, QUALITY_ORDER, shuffleChoices, skillTierRules, startRun,
    type RunRules, type RunState,
} from './game/run';

interface AppProps {
    levels: readonly GeneratedLevel[];
    levelWarnings?: readonly string[];
    rules?: RunRules;
}

// Colors identify shuffled options, never move quality.
const EMPTY_BOARD_POSITION = {};
const PIECES: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

function createNextFloorNotice(run: RunState): BoardNotice {
    const atCheckpoint = run.checkpointRewards.some(reward => reward.afterRound === run.levelIndex + 1 && reward.selected === null);
    const label = atCheckpoint ? 'Checkpoint' : `Floor ${run.levelIndex + 2}`;
    return {
        id: `level-${run.id}-${run.levelIndex + 2}`, visual: atCheckpoint ? <Flag strokeWidth={1.5} /> : <ArrowUp strokeWidth={1.5} />,
        label, announcement: label, tone: 'reward',
    };
}

let openModalCount = 0;
let modalOverflow = '';

function Modal({ children, titleId, className, onClose, returnFocus, dismissible = true }: {
    children: ReactNode;
    titleId: string;
    className: string;
    onClose: () => void;
    returnFocus: RefObject<HTMLButtonElement | null>;
    dismissible?: boolean;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current!;
        if (openModalCount === 0) modalOverflow = document.documentElement.style.overflow;
        openModalCount++;
        document.documentElement.style.overflow = 'hidden';
        element.showModal();
        element.querySelector<HTMLElement>('[data-modal-focus]')?.focus();
        return () => {
            element.close();
            openModalCount--;
            if (openModalCount === 0) document.documentElement.style.overflow = modalOverflow;
            returnFocus.current?.focus();
        };
    }, [returnFocus]);
    return <dialog ref={dialog} className={`modal ${className}`} aria-labelledby={titleId} aria-modal="true"
        onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
        onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]'))
                .filter(control => !control.closest('details:not([open])') || control.tagName === 'SUMMARY');
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }}>
        {dismissible && <button className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={18} aria-hidden="true" /></button>}
        {children}
    </dialog>;
}

function moveDescription(choice: PlayerChoice, fen: string): string {
    const from = choice.playerMove.uci.slice(0, 2);
    const to = choice.playerMove.uci.slice(2, 4);
    const piece = new Chess(fen).get(from as Square);
    const promotion = choice.playerMove.uci[4];
    return `${PIECES[piece?.type ?? 'p']} ${from} to ${to}${promotion ? `, promote to ${PIECES[promotion]?.toLowerCase()}` : ''}`;
}

function Feedback({ run }: { run: RunState }) {
    const choice = run.lastChoice;
    if (!choice) return null;
    return <div className={`reveal-card quality-${choice.quality}`} role="status" aria-label="Move quality">
        <span className="reveal-kicker">{choice.playerMove.san}</span>
        <strong>{QUALITY_LABELS[choice.quality]}</strong>
        <span>{(run.lastMoveResolution?.awardedPoints ?? run.rules.points[choice.quality]) >= 0 ? '+' : ''}{run.lastMoveResolution?.awardedPoints ?? run.rules.points[choice.quality]} points</span>
        {run.lastMoveResolution && run.lastMoveResolution.awardedPoints !== run.lastMoveResolution.normalPoints
            && <small>{run.lastMoveResolution.normalPoints} ×{run.lastMoveResolution.awardedPoints / run.lastMoveResolution.normalPoints} · Score boost</small>}
    </div>;
}

function RunSummary({ run, payout, restart, onShare, finishedAt }: {
    run: RunState;
    payout: PayoutResult;
    restart: () => void;
    onShare?: ShareRunHandler;
    finishedAt?: number;
}) {
    return <section className="summary result-page" aria-labelledby="result-title">
        <h1 id="result-title" tabIndex={-1} data-page-focus>{run.result === 'complete' ? 'Run complete' : 'Run over'}</h1>
        <SkillTierBadge skillTier={run.skillTier} />
        <div className="summary-score-group">
            <span className="summary-score-label">Total score</span>
            <strong className="summary-score">{payout.finalScore.toLocaleString()}</strong>
            <p className="summary-calculation">{payout.baseScore.toLocaleString()} {formatMultiplier(payout.multiplier)}</p>
        </div>
        <span className="coin-balance summary-coins" aria-label={`Earned ${runCoinReward(run)} coins`}>
            <Coins size={17} aria-hidden="true" /><strong>+{runCoinReward(run).toLocaleString()}</strong>
            <span>Coins earned</span>
        </span>
        <span className="summary-xp" aria-label={`Earned ${dungeonRunXp(run)} XP`}>+{dungeonRunXp(run)} XP</span>
        <div className="summary-details" aria-label="Run details"><dl className="summary-stats">
            <div><dt>Floors completed</dt><dd>{run.levelsCompleted} / {run.levels.length}</dd></div>
            <div><dt>Total decisions</dt><dd>{run.decisionsMade}</dd></div>
        </dl>
        <div className="quality-counts" aria-label="Move counts">
            {QUALITY_ORDER.map(quality => <div key={quality}><strong>{run.moveCounts[quality]}</strong><span>{QUALITY_LABELS[quality]}</span></div>)}
        </div>
        </div>
        <div className="result-actions"><button className="primary-small" onClick={restart}>Play again</button>
            <ShareRunButton result={shareRegularRun(run, payout, finishedAt)} onShare={onShare} /></div>
    </section>;
}

export default function App({ levels, levelWarnings = [], rules: rulesOverride }: AppProps) {
    const [playerProfile, setPlayerProfile] = useState(loadPlayerProfile);
    const skillTier = playerProfile.preferredSkillTier ?? 'intermediate';
    const needsSkillSelection = playerProfile.preferredSkillTier === undefined;
    const [firstSkillTier, setFirstSkillTier] = useState<SkillTier | null>(null);
    const rules = useMemo(() => rulesOverride ?? skillTierRules(skillTier), [rulesOverride, skillTier]);
    const pool = useMemo(() => selectLevels(levels), [levels]);
    const skillPool = useMemo(() => filterSkillTierLevels(pool, skillTier), [pool, skillTier]);
    const [savedRegular] = useState(() => loadRegularRun(pool));
    const regularInitialItems = useRef<ItemInventory>(savedRegular?.initialItems ?? {});
    const [run, setRunState] = useState<RunState | null>(null);
    const latestRun = useRef(run);
    const setRun = useCallback((next: RunState | null) => { latestRun.current = next; setRunState(next); }, []);
    const [selectedItems, setSelectedItemsState] = useState<ItemInventory>({});
    const latestSelectedItems = useRef(selectedItems);
    const setSelectedItems = useCallback((next: ItemInventory) => { latestSelectedItems.current = next; setSelectedItemsState(next); }, []);
    const daily = useDailyDungeon(pool, skillTier);
    const { location, navigate, content } = usePageNavigation();
    const page = needsSkillSelection ? 'play' : location.page;
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [regularSelectedSet, setRegularSelectedSet] = useState<PieceSetId>('default');
    const [dailySelectedSet, setDailySelectedSet] = useState<PieceSetId>('default');
    const regularRun = useRef<{ run: RunState; set: PieceSetId } | null>(savedRegular);
    const [sharedRun, setSharedRun] = useState<{ result: ShareRunData; profile: PlayerProfile } | null>(null);
    const shareReturnFocus = useRef<HTMLButtonElement | null>(null);
    const [sharedProfile, setSharedProfile] = useState<{ profile: PlayerProfile; highScores: ProfileHighScore[] } | null>(null);
    const profileShareReturnFocus = useRef<HTMLButtonElement | null>(null);
    const [showProfile, setShowProfile] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
    const progression = useUserProgression(run);
    const runHistory = useRunHistory();
    const tutorial = usePlayTutorial(run);
    const firstPlayLocked = progression.profile.finishedRuns === 0;
    const [pieceSet, setPieceSet] = useState<PieceSetId>('default');
    const [upgradeSet, setUpgradeSet] = useState<PieceSetId | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [pendingChoice, setPendingChoice] = useState<string | null>(null);
    const moveOptions = useRef<HTMLDivElement>(null);
    const keyboardOption = useRef<number | null>(null);
    const [gamepadActive, setGamepadActive] = useState(false);
    const [boardSelection, setBoardSelection] = useState<{ from: string; to: string | null } | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [boardNotice, setBoardNoticeState] = useState<BoardNotice | null>(null);
    const noticeRef = useRef<BoardNotice | null>(null);
    const noticeQueue = useRef<BoardNotice[]>([]);
    const setBoardNotice = useCallback((notice: BoardNotice | null) => {
        noticeQueue.current = [];
        noticeRef.current = notice;
        setBoardNoticeState(notice);
    }, []);
    const enqueueNotice = useCallback((notice: BoardNotice) => {
        if (noticeRef.current?.id === notice.id || noticeQueue.current.some(queued => queued.id === notice.id)) return;
        if (noticeRef.current) noticeQueue.current.push(notice);
        else { noticeRef.current = notice; setBoardNoticeState(notice); }
    }, []);
    const dismissBoardNotice = useCallback(() => setBoardNotice(null), []);
    const waitingForCheckmate = run?.phase === 'level-ended'
        && (boardNotice?.id === `checkmate-${run.id}-${run.levelIndex}`
            || noticeQueue.current.some(notice => notice.id === `checkmate-${run.id}-${run.levelIndex}`));
    const completeBoardNotice = useCallback(() => {
        const current = latestRun.current;
        if (current?.phase === 'level-ended' && noticeRef.current?.id === `checkmate-${current.id}-${current.levelIndex}`)
            noticeQueue.current.push(createNextFloorNotice(current));
        const next = noticeQueue.current.shift() ?? null;
        noticeRef.current = next;
        setBoardNoticeState(next);
    }, []);
    const activeDaily = run?.daily ? daily.archive.days[run.daily.day]?.attempt : undefined;
    const paused = needsSkillSelection || page !== 'game' || showProfile || showLeaderboard || !!upgradeSet || showRules;
    const payout = useBoardPayout(run, boardNotice !== null, pieceSet, paused || tutorial.paused,
        progression.profile.paidUpgrades, activeDaily?.multipliers, activeDaily?.payout);
    const helpButton = useRef<HTMLButtonElement>(null);
    const profileButton = useRef<HTMLButtonElement>(null);
    const leaderboardButton = useRef<HTMLButtonElement>(null);
    const profileReturnFocus = useRef<HTMLButtonElement | null>(null);
    const upgradeReturnFocus = useRef<HTMLButtonElement | null>(null);
    const requestedDaily = location.day ? daily.archive.days[location.day] : undefined;
    const dailyDungeon = requestedDaily && (requestedDaily.day === daily.today?.day || requestedDaily.attempt?.status === 'finished')
        ? requestedDaily : daily.today;
    const leaderboardDungeon = page === 'game' && run?.daily ? daily.archive.days[run.daily.day]
        : page === 'leaderboards' ? daily.today : dailyDungeon;
    const standings = useMemo(() => leaderboardDungeon ? dailyLeaderboard(leaderboardDungeon.day, playerProfile,
        leaderboardDungeon.attempt?.status === 'finished' ? leaderboardDungeon.attempt.payout?.finalScore ?? null : null,
        leaderboardDungeon.attempt?.skillTier ?? 'intermediate') : [],
    [leaderboardDungeon?.day, leaderboardDungeon?.attempt?.payout, leaderboardDungeon?.attempt?.skillTier, playerProfile]);
    const savedDailyRun = useMemo(() => page === 'play' && daily.today?.attempt?.status === 'active' ? restoreDailyRun(daily.today) : null, [page, daily.today]);
    const level = run ? run.levels[run.levelIndex] : skillPool[0];
    const node = run?.node;
    const choices = useMemo(() => node?.kind === 'decision' ? shuffleChoices(node.choices) : [], [node]);
    const fen = run ? boardFen(run) : level?.root.fen;
    const itemInteraction = run?.phase === 'decision' && !payout.sequence && !paused && !tutorial.paused;
    const playing = itemInteraction && tutorial.step !== 'item';
    const tutorialStep = page === 'game' && !paused ? tutorial.step : null;
    const tutorialMove = choices.find(choice => choice.quality === 'best' && choice.playerMove.uci.slice(0, 2) === boardSelection?.from)
        ?? choices.find(choice => choice.playerMove.uci.slice(0, 2) === boardSelection?.from)
        ?? choices.find(choice => choice.quality === 'best') ?? choices[0];
    const checkpointReward = run?.phase === 'checkpoint'
        ? run.checkpointRewards.find(reward => reward.afterRound === run.levelIndex + 1) : undefined;
    const activeRules = run?.rules ?? rules;
    const orientation = level?.playerColor ?? 'white';
    const currentOutcome = run?.outcomes.find(outcome => outcome.id === level?.id);
    const unlockedSet = progression.pendingUnlocks[0];
    const unlockNotice = useMemo<BoardNotice | null>(() => unlockedSet ? {
        id: `unlock-${unlockedSet}`, visual: <Unlock />, label: PIECE_SETS[unlockedSet].name,
        caption: 'Unlocked', announcement: `${PIECE_SETS[unlockedSet].name} unlocked`, tone: 'reward', durationMs: 2000,
    } : null, [unlockedSet]);
    const showingResult = page === 'game' && run?.phase === 'finished' && !!payout.result && !payout.sequence && !boardNotice && !unlockNotice;
    const showBonusBoard = !!payout.sequence || (run?.phase === 'finished' && !!payout.result);
    const displayScore = payout.result?.finalScore ?? run?.score ?? 0;
    const visibleNotice = paused ? null : payout.notice ?? boardNotice
        ?? (run?.phase === 'finished' && payout.result && !payout.sequence && !showRules ? unlockNotice : null);
    const endlessActive = page === 'endless-game' && !showRules && !showProfile && !showLeaderboard && !upgradeSet;
    const endless = useEndlessSession(endlessActive, progression.claimCoins);
    const leveling = usePlayerLeveling(run, endless.session);
    const openRunShare: ShareRunHandler = (result, trigger) => {
        shareReturnFocus.current = trigger;
        setSharedRun({ result: { ...result, personalBest: isSharePersonalBest(result, runHistory.history.runs, endless.records) },
            profile: { ...playerProfile } });
    };
    const openProfileShare = (trigger: HTMLButtonElement) => {
        profileShareReturnFocus.current = trigger;
        setSharedProfile({ profile: { ...playerProfile }, highScores: profileHighScores(runHistory.history, endless.records) });
    };
    useEffect(() => { setSharedRun(null); setSharedProfile(null); }, [location.page, location.day]);
    const endlessPage = page === 'endless' || page === 'endless-items' || page === 'endless-game';

    const resetDailyDungeon = useCallback(() => {
        const day = daily.reset();
        if (latestRun.current?.daily) {
            const regular = regularRun.current;
            setRun(regular?.run ?? null);
            setPieceSet(regular?.set ?? 'default');
            payout.reset(regular?.set ?? 'default');
            regularRun.current = null;
        }
        setBoardNotice(null);
        setPreview(null);
        setPendingChoice(null);
        setBoardSelection(null);
        setShowRules(false);
        setShowProfile(false);
        setShowLeaderboard(false);
        setUpgradeSet(null);
        setProfileSaveMessage(null);
        navigate({ page: 'daily' }, true);
        return day;
    }, [daily.reset, setRun, payout.reset, setBoardNotice, navigate]);

    useEffect(() => installNotificationConsole(setBoardNotice, dismissBoardNotice, payout.preview, resetDailyDungeon),
        [setBoardNotice, dismissBoardNotice, payout.preview, resetDailyDungeon]);

    useEffect(() => {
        setShowRules(false);
        setShowProfile(false);
        setShowLeaderboard(false);
        setEditingProfile(false);
        setUpgradeSet(null);
    }, [page, location.day]);

    useEffect(() => {
        if (page === 'game' && !run) navigate({ page: 'play' }, true);
    }, [page, run, navigate]);

    useEffect(() => {
        if (needsSkillSelection && location.page !== 'play') navigate({ page: 'play' }, true);
    }, [needsSkillSelection, location.page, navigate]);

    useEffect(() => {
        if (page === 'daily' && location.day && daily.today && location.day !== daily.today.day
            && requestedDaily?.attempt?.status !== 'finished') navigate({ page: 'daily' }, true);
    }, [page, location.day, daily.today?.day, requestedDaily?.attempt?.status, navigate]);

    useEffect(() => {
        if (!showingResult || paused) return;
        if (run?.daily) navigate({ page: 'daily', day: run.daily.day }, true);
        else content.current?.querySelector<HTMLElement>('[data-page-focus]')?.focus({ preventScroll: true });
    }, [showingResult, paused, run?.daily?.day, navigate]);

    useEffect(() => {
        // A completed attempt survives a refresh even if its payout presentation was interrupted.
        for (const dungeon of Object.values(daily.archive.days)) {
            if (dungeon.attempt?.status !== 'finished' || !dungeon.attempt.payout) continue;
            const completed = restoreDailyRun(dungeon);
            if (!completed) continue;
            progression.recordRun(completed);
            leveling.recordRun(completed);
            payout.claimDailyUpgrade(dungeon.attempt.setId, dungeon.attempt.payout, dungeon.day);
            runHistory.recordRun(completed, dungeon.attempt.payout, dungeon.attempt.finishedAt ?? Date.now());
        }
    }, [daily.archive, progression.recordRun, leveling.recordRun, payout.claimDailyUpgrade, runHistory.recordRun]);

    // The final score is known as soon as the actual payout starts, even if its animation is interrupted.
    const finishedPayout = payout.result ?? (payout.sequence?.preview ? null : payout.sequence?.outcome);
    useEffect(() => {
        if (run?.phase === 'finished' && !run.daily && finishedPayout) runHistory.recordRun(run, finishedPayout);
    }, [run, finishedPayout, runHistory.recordRun]);

    useEffect(() => {
        if (!run || run.daily) return;
        if (run.phase === 'finished' && finishedPayout) {
            clearRegularRun();
            regularRun.current = null;
        } else {
            saveRegularRun({ run, set: pieceSet, initialItems: regularInitialItems.current });
        }
    }, [run, pieceSet, finishedPayout]);

    useEffect(() => {
        if (!profileSaveMessage) return;
        const timer = window.setTimeout(() => setProfileSaveMessage(null), 3500);
        return () => window.clearTimeout(timer);
    }, [profileSaveMessage]);

    function openProfile(button?: HTMLButtonElement) {
        if (page !== 'game' || showingResult) {
            setEditingProfile(false);
            navigate({ page: 'profile' });
            return;
        }
        profileReturnFocus.current = button ?? profileButton.current;
        setShowRules(false);
        setProfileSaveMessage(null);
        setEditingProfile(false);
        setShowProfile(true);
    }

    function closeProfile() {
        if (editingProfile) setEditingProfile(false);
        else setShowProfile(false);
    }

    function updateProfile(profile: PlayerProfile) {
        savePlayerProfile(profile);
        setPlayerProfile(profile);
        setEditingProfile(false);
    }

    useEffect(() => {
        if (!daily.expired) return;
        if (run?.id === daily.expired.id) {
            const regular = regularRun.current;
            setRun(regular?.run ?? null);
            setPieceSet(regular?.set ?? 'default');
            payout.reset(regular?.set ?? 'default');
            setBoardNotice(null);
            setPreview(null);
            setPendingChoice(null);
            setBoardSelection(null);
            setShowProfile(false);
            setShowRules(false);
            setShowLeaderboard(false);
            setUpgradeSet(null);
            if (page === 'game') navigate({ page: 'daily' }, true);
        }
        daily.clearExpiration();
    }, [daily.expired, daily.clearExpiration, run?.id, page, navigate, setRun, payout.reset, setBoardNotice]);

    function changeRun(next: RunState) {
        if (!daily.update(next)) return false;
        setRun(next);
        if (next.outcomes.length > (run?.outcomes.length ?? 0) && next.node.kind === 'terminal'
            && next.node.reason === 'checkmate' && next.node.result === next.levels[next.levelIndex]!.playerColor) {
            enqueueNotice({
                id: `checkmate-${next.id}-${next.levelIndex}`, visual: <Trophy strokeWidth={1.5} />,
                label: 'Checkmate', announcement: 'Checkmate', tone: 'reward',
            });
        } else if (next.phase === 'level-ended' && run?.phase !== 'level-ended'
            && (next.outcomes.at(-1)?.status === 'completed'
                || next.checkpointRewards.some(reward => reward.afterRound === next.levelIndex + 1 && reward.selected === null))) {
            enqueueNotice(createNextFloorNotice(next));
        }
        return true;
    }

    useEffect(() => {
        if (paused || tutorial.paused || waitingForCheckmate || payout.sequence?.preview || (run?.phase !== 'reveal' && run?.phase !== 'reply' && run?.phase !== 'level-ended')) return;
        const timer = window.setTimeout(() => {
            if (run.phase === 'level-ended') {
                setPreview(null);
                setPendingChoice(null);
                setBoardSelection(null);
                changeRun(nextLevel(run));
            } else {
                changeRun(advancePlayback(run));
            }
        }, run.phase === 'level-ended' ? 1500 : run.phase === 'reveal' ? 1400 : 1000);
        return () => window.clearTimeout(timer);
    }, [run, payout.sequence?.preview, paused, tutorial.paused, waitingForCheckmate]);

    function bringItem(id: ItemId) {
        const selected = latestSelectedItems.current;
        if (itemCount(selected) >= LOADOUT_LIMIT || loadoutCost(selected) + ITEMS[id].price > progression.profile.coins) return;
        setSelectedItems({ ...selected, [id]: (selected[id] ?? 0) + 1 });
    }

    function selectSkillTier(tier: SkillTier) {
        const next = { ...playerProfile, preferredSkillTier: tier };
        setPlayerProfile(next);
        if (!savePlayerProfile(next)) setProfileSaveMessage('Your skill level is remembered for this session. Browser storage is unavailable.');
    }

    function beginRun(set: PieceSetId, guided = false) {
        if (needsSkillSelection || !skillPool.length || !isPieceSetUnlocked(set, progression.profile)) return;
        const startsTutorial = guided || (progression.profile.finishedRuns === 0 && tutorial.state.status !== 'done');
        const purchasedItems = startsTutorial || (page === 'play' && progression.profile.finishedRuns === 0)
            ? {} : { ...latestSelectedItems.current };
        const initialItems: ItemInventory = startsTutorial ? { 'healing-potion': 1 } : purchasedItems;
        const next = startRun(skillPool, set === 'default' ? rules : { ...rules, startingHealth: PIECE_SETS[set].startingHealth },
            Math.random, initialItems, undefined, { skillTier });
        if (!progression.buyLoadout(purchasedItems)) {
            setProfileSaveMessage('Not enough coins for these items. Adjust your loadout.');
            return;
        }
        regularInitialItems.current = initialItems;
        setSelectedItems({});
        setPreview(null);
        setPendingChoice(null);
        setBoardSelection(null);
        setShowRules(false);
        setBoardNotice(null);
        progression.dismissUnlocks();
        payout.reset(set);
        setPieceSet(set);
        setUpgradeSet(null);
        regularRun.current = null;
        setRegularSelectedSet(set);
        navigate({ page: 'game' });
        setRun(next);
        tutorial.begin(next, progression.profile.finishedRuns === 0, guided);
    }

    function openMenu() {
        setShowRules(false);
        setUpgradeSet(null);
        navigate({ page: 'play' });
    }

    function beginDaily(set: PieceSetId) {
        if (needsSkillSelection || !isPieceSetUnlocked(set, progression.profile)) return;
        try {
            const board = applyPaidUpgrades(payout.profileFor(set).board, progression.profile.paidUpgrades[set]);
            const next = daily.begin(set, set === 'default' ? rules : { ...rules, startingHealth: PIECE_SETS[set].startingHealth }, board);
            if (run && !run.daily && run.phase !== 'finished') regularRun.current = { run, set: pieceSet };
            showDailyRun(next, set);
        } catch (error) {
            setProfileSaveMessage(error instanceof Error ? error.message : 'The daily dungeon is unavailable.');
        }
    }

    function openLeaderboard() {
        if (page !== 'game' || !run?.daily) return;
        setShowRules(false);
        setUpgradeSet(null);
        setShowLeaderboard(true);
    }

    function showDailyRun(next: RunState, set: PieceSetId) {
        setPendingChoice(null);
        setBoardSelection(null);
        setPreview(null);
        setShowRules(false);
        setShowLeaderboard(false);
        navigate({ page: 'game' });
        setBoardNotice(null);
        progression.dismissUnlocks();
        payout.reset(set);
        setPieceSet(set);
        setRun(next);
    }

    function resumeDaily() {
        if (run?.daily?.day === daily.today?.day && activeDaily?.status === 'active') {
            navigate({ page: 'game' });
            return;
        }
        const next = daily.resume();
        const attempt = daily.today?.attempt;
        if (!next || !attempt) return;
        if (run && !run.daily && run.phase !== 'finished') regularRun.current = { run, set: pieceSet };
        showDailyRun(next, attempt.setId);
    }

    function resumeRegular() {
        if (run && !run.daily) {
            navigate({ page: 'game' });
            return;
        }
        const saved = regularRun.current;
        if (!saved) return;
        regularRun.current = null;
        showDailyRun(saved.run, saved.set);
    }

    function selectMove(uci: string) {
        if (!playing) return;
        setBoardSelection(null);
        if (pendingChoice !== uci) {
            setPendingChoice(uci);
            tutorial.selectedPiece();
            return;
        }
        commitMove(uci);
    }

    useGamepadControls(page === 'game', action => {
        if (paused || tutorial.paused || document.querySelector('dialog[open]')) return;
        const game = content.current?.querySelector<HTMLElement>('#game');
        if (!game) return;
        const buttonsIn = (selector: string) => Array.from(game.querySelectorAll<HTMLButtonElement>(`${selector}:not(:disabled)`));
        const confirmation = buttonsIn('.item-confirmation button');
        const moves = buttonsIn('.move-option');
        const items = buttonsIn('.item-button');
        const rewards = buttonsIn('.checkpoint-item');
        const rows = (confirmation.length ? [confirmation] : rewards.length ? [rewards] : [moves, items]).filter(row => row.length);
        if (!rows.length) return;
        setGamepadActive(true);
        if (action === 'cancel') {
            const item = game.querySelector<HTMLButtonElement>('.item-button[aria-expanded="true"]');
            game.querySelector<HTMLButtonElement>('.item-cancel')?.click();
            item?.focus({ preventScroll: true });
            setPendingChoice(null);
            setBoardSelection(null);
            setPreview(null);
            return;
        }
        let rowIndex = rows.findIndex(row => row.includes(document.activeElement as HTMLButtonElement));
        let index = rowIndex < 0 ? -1 : rows[rowIndex]!.indexOf(document.activeElement as HTMLButtonElement);
        if (rowIndex < 0) rowIndex = 0;
        if (action === 'confirm') {
            const button = rows[rowIndex]![index < 0 ? confirmation.length ? confirmation.length - 1 : 0 : index]!;
            if (moves.includes(button)) keyboardOption.current = moves.indexOf(button);
            else if (rewards.includes(button)) keyboardOption.current = 0;
            button.focus({ preventScroll: true });
            button.click();
            return;
        }
        setPendingChoice(null);
        setBoardSelection(null);
        const forward = action === 'right' || action === 'down';
        if (index >= 0 && rows.length > 1 && (action === 'up' || action === 'down')) {
            rowIndex = (rowIndex + (forward ? 1 : -1) + rows.length) % rows.length;
            index = Math.min(index, rows[rowIndex]!.length - 1);
        } else {
            const row = rows[rowIndex]!;
            index = index < 0 ? forward ? 0 : row.length - 1 : (index + (forward ? 1 : -1) + row.length) % row.length;
        }
        const button = rows[rowIndex]![index]!;
        keyboardOption.current = moves.includes(button) ? moves.indexOf(button) : null;
        if (!moves.includes(button)) setPreview(null);
        button.focus({ preventScroll: true });
    }, () => { setGamepadActive(false); keyboardOption.current = null; });

    useEffect(() => {
        if (!playing || keyboardOption.current === null) return;
        const active = document.activeElement;
        if (active !== document.body && active !== content.current?.querySelector('#game')
            && !moveOptions.current?.contains(active)) return;
        const buttons = moveOptions.current?.querySelectorAll<HTMLButtonElement>('button');
        if (!buttons?.length) return;
        if (keyboardOption.current >= buttons.length) keyboardOption.current = 0;
        buttons[keyboardOption.current]!.focus({ preventScroll: true });
    }, [playing, choices]);

    useEffect(() => {
        if (!playing) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const buttons = Array.from(moveOptions.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
            if (!buttons.length) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('dialog, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (target?.closest('button, a[href], [role="button"]') && !moveOptions.current?.contains(target)) return;

            const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            const activate = event.key === 'Enter' || event.key === ' ';
            if (!direction && !activate) return;
            event.preventDefault();
            if (activate && event.repeat) return;

            const current = buttons.findIndex(button => button === document.activeElement);
            let index = Math.max(0, current);
            if (direction) {
                index = current < 0 ? (direction > 0 ? 0 : buttons.length - 1)
                    : (current + direction + buttons.length) % buttons.length;
            }
            if (direction) {
                keyboardOption.current = index;
                setPendingChoice(null);
                setBoardSelection(null);
            }
            if (activate && keyboardOption.current !== null) keyboardOption.current = index;
            buttons[index]!.focus();
            if (activate) selectMove(choices[index]!.playerMove.uci);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    function commitMove(uci: string) {
        if (!playing || !choices.some(choice => choice.playerMove.uci === uci)) return;
        setPreview(null);
        setPendingChoice(null);
        setBoardSelection(null);
        const previous = latestRun.current;
        if (!previous) return;
        const updated = chooseMove(previous, uci);
        if (updated === previous || !changeRun(updated)) return;
        if (updated.lastChoice && updated.lastMoveResolution) {
            const resolution = updated.lastMoveResolution;
            const healthChange = resolution.healthBonus - resolution.damageTaken;
            if (updated.result === 'defeat') setBoardNotice(createDeathNotice());
            else if (resolution.shieldSpent) {
                const caption = resolution.damagePrevented > 0 ? `Prevented ${resolution.damagePrevented} damage` : 'No damage to block';
                enqueueNotice({ id: `shield-${updated.id}-${updated.decisionsMade}`, visual: <Shield />,
                    label: resolution.damagePrevented > 0 ? 'Damage blocked' : 'Guard spent',
                    caption: `${caption}${resolution.healthBonus ? ' · +1 health' : ''}`,
                    announcement: `${caption}${resolution.healthBonus ? '. Gained 1 health' : ''}`, tone: 'reward', durationMs: 1200 });
            } else if (healthChange !== 0) enqueueNotice(createHealthNotice(healthChange));
        }
    }

    function useRunItem(id: ItemId) {
        const current = latestRun.current;
        if (!itemInteraction || !current) return;
        const next = activateItem(current, id);
        if (next === current) return;
        if (!changeRun(next)) return;
        setPendingChoice(null);
        setBoardSelection(null);
        setPreview(null);
        keyboardOption.current = null;
        const item = ITEMS[id];
        const caption = item.effect.kind === 'heal' ? '+1 health' : item.effect.kind === 'scoreMultiplier' ? '×3 points for 3 moves' : 'Next move protected';
        enqueueNotice({ id: `item-${next.id}-${next.itemUses.length}`, visual: <ItemIcon id={id} />,
            label: item.effect.kind === 'heal' ? '+1' : item.name,
            caption: item.effect.kind === 'heal' ? item.name : caption,
            announcement: `${item.name}. ${caption}`, tone: item.effect.kind === 'heal' ? 'health' : 'reward', durationMs: 1200 });
    }

    function selectSquare(square: string) {
        if (!playing || showRules) return;
        if (boardSelection) {
            const matches = choices.filter(choice => choice.playerMove.uci.slice(0, 2) === boardSelection.from
                && choice.playerMove.uci.slice(2, 4) === square);
            if (matches.length === 1) {
                commitMove(matches[0]!.playerMove.uci);
                return;
            }
            if (matches.length > 1) {
                // Promotions can share a destination; show their pieces in the existing options.
                setBoardSelection({ from: boardSelection.from, to: square });
                setPreview(null);
                return;
            }
            if (square === boardSelection.from) {
                setBoardSelection(null);
                setPreview(null);
                return;
            }
        }
        if (!choices.some(choice => choice.playerMove.uci.slice(0, 2) === square)) return;
        setBoardSelection({ from: square, to: null });
        tutorial.selectedPiece();
        setPendingChoice(null);
        setPreview(null);
    }

    const highlighted = playing ? pendingChoice ?? preview : run?.phase === 'reply'
        ? run.lastChoice?.opponentReply?.uci : run?.lastChoice?.playerMove.uci;
    const highlightIndex = choices.findIndex(choice => choice.playerMove.uci === highlighted);
    const highlightColor = pendingChoice ? CONFIRM_COLOR : OPTION_COLORS[Math.max(0, highlightIndex)]!;
    const squareStyles: Record<string, CSSProperties> = {};
    if (showBonusBoard) {
        for (const square of BOARD_SQUARES) {
            squareStyles[square] = {
                backgroundColor: payout.board[square] > 10 ? 'rgba(240, 204, 105, 0.12)' : 'transparent',
            };
        }
        if (payout.highlightedSquare) {
            const upgrading = payout.sequence?.phase === 'upgrading';
            squareStyles[payout.highlightedSquare] = {
                backgroundColor: upgrading ? '#87b59a' : '#e8c873',
                boxShadow: `inset 0 0 0 4px ${upgrading ? '#2f8a5c' : '#fff0ae'}`,
            };
        }
    } else if (highlighted && !checkpointReward) {
        squareStyles[highlighted.slice(0, 2)] = { boxShadow: `inset 0 0 0 5px ${highlightColor}` };
        squareStyles[highlighted.slice(2, 4)] = { boxShadow: `inset 0 0 0 5px ${highlightColor}` };
    }
    if (playing && boardSelection) {
        choices.forEach((choice, index) => {
            if (choice.playerMove.uci.slice(0, 2) !== boardSelection.from) return;
            const to = choice.playerMove.uci.slice(2, 4);
            const color = boardSelection.to === to ? CONFIRM_COLOR : OPTION_COLORS[index]!;
            squareStyles[to] = { boxShadow: `inset 0 0 0 4px ${color}` };
        });
        squareStyles[boardSelection.from] = { boxShadow: `inset 0 0 0 5px ${CONFIRM_COLOR}` };
    }
    if (playing && run?.node.kind === 'decision' && tutorialStep === 'destination' && boardSelection?.from) {
        const suggested = tutorialMove;
        if (suggested) {
            const square = suggested.playerMove.uci.slice(2, 4);
            squareStyles[square] = { ...squareStyles[square], backgroundColor: '#e8c87380' };
        }
    }
    const immersiveRun = page === 'game' && !showingResult;
    const boardOptions: ChessboardOptions = {
        ...BOARD_APPEARANCE,
        lightSquareStyle: immersiveRun ? { backgroundColor: '#d7d9b2' } : BOARD_APPEARANCE.lightSquareStyle,
        boardStyle: immersiveRun ? { borderRadius: '12px', boxShadow: '0 0 0 1px #9cae86, 0 2px 8px #203e3022' } : BOARD_APPEARANCE.boardStyle,
        id: 'knightfall-board', position: showBonusBoard || checkpointReward ? EMPTY_BOARD_POSITION : fen, boardOrientation: orientation,
        showAnimations: !showBonusBoard && !checkpointReward,
        squareStyles,
        squareStyle: playing ? { cursor: 'pointer' } : undefined,
        onSquareClick: ({ square }) => selectSquare(square),
        pieces: PIECE_RENDERERS[pieceSet],
        squareRenderer: showBonusBoard ? ({ square }) => <div
            className={`payout-square${square === payout.highlightedSquare ? ' selected' : ''}${payout.sequence?.phase !== 'spinning' ? ' settled' : ''}${payout.board[square as Square] > 10 ? ' boosted' : ''}`}
            style={squareStyles[square]}>
            <span className="payout-square-label" aria-label={`${square}: ${formatMultiplier(payout.board[square as Square])}`}>
                {formatMultiplier(payout.board[square as Square])}
            </span>
        </div> : undefined,
        arrows: playing ? choices.map((choice, index) => ({
            startSquare: choice.playerMove.uci.slice(0, 2), endSquare: choice.playerMove.uci.slice(2, 4),
            color: pendingChoice === choice.playerMove.uci ? CONFIRM_COLOR : OPTION_COLORS[index]!,
        })) : [],
    };

    function openUpgrades(set: PieceSetId, button: HTMLButtonElement) {
        if (!isPieceSetUnlocked(set, progression.profile)) return;
        upgradeReturnFocus.current = button;
        setUpgradeSet(set);
    }

    const resumableRegular = run && !run.daily && (run.phase !== 'finished' || !payout.result) ? { run, set: pieceSet } : regularRun.current;
    const resumableDaily = daily.today && daily.now < daily.today.expiresAt ? savedDailyRun : null;
    const showNavigation = (page !== 'game' || showingResult) && (page !== 'endless-game' || endless.session?.phase === 'finished' || !endless.session);
    const activeDestination = page === 'game' ? 'play' : page;
    const hasRunItems = page === 'endless-game' ? !!endless.session && (itemCount(endless.session.items) > 0 || endless.session.activeEffects.length > 0)
        : !!run && (itemCount(run.items) > 0 || run.activeEffects.length > 0);
    return <main className={`app-shell${page === 'play' ? ` main-menu-shell${needsSkillSelection ? '' : ' journey-home-shell'}` : ''}${immersiveRun ? ` run-environment${run?.daily ? ' run-daily' : ''}` : ''}${showNavigation ? ' has-navigation' : ''}${hasRunItems ? ' has-run-items' : ''}`}
        onPointerDownCapture={() => { keyboardOption.current = null; setGamepadActive(false); }}
        onKeyDownCapture={() => setGamepadActive(false)}>
        <header className={`topbar${page === 'play' ? ' main-menu-topbar' : ''}`}>
            {immersiveRun && <a className="run-home" href="#/play" aria-label="Pause run and return home" title="Home" onClick={event => { event.preventDefault(); openMenu(); }}>
                <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 3H37L45 11V37L37 45H11L3 37V11Z" fill="#17382f" stroke="#6a8976" strokeWidth="2" /><path d="M28 15 19 24 28 33" fill="none" stroke="#ece5c9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>}
            {(page !== 'play' || !needsSkillSelection) && <a className="brand" href="#/play" aria-label="Knightfall home" onClick={event => { event.preventDefault(); openMenu(); }}>
                <img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="38" height="42" /><strong>Knightfall</strong>
            </a>}
            {showNavigation && <PrimaryNavigation active={activeDestination} onNavigate={navigate} locked={firstPlayLocked} />}
            <div className="top-actions">
                {page === 'game' && run?.daily && <button ref={leaderboardButton} className="leaderboard-button" disabled={!leaderboardDungeon}
                    aria-label="Daily leaderboard" title="Daily leaderboard" onClick={openLeaderboard}><Trophy size={20} aria-hidden="true" /></button>}
                <div className="help-anchor">
                    <button ref={helpButton} disabled={!!payout.sequence} className="text-button help-button" aria-label="Help for this page" aria-expanded={showRules} aria-controls="game-rules" onClick={() => setShowRules(value => !value)}>?</button>
                    <HelpWelcome home={page === 'play'} blocked={needsSkillSelection || showRules || showProfile || showLeaderboard || !!sharedRun || !!sharedProfile || !!upgradeSet || !!payout.sequence} anchor={helpButton} />
                </div>
                <span className="coin-balance" aria-label={`Coins: ${progression.profile.coins}`} title={`${progression.profile.coins.toLocaleString()} coins`}>
                    <Coins size={20} aria-hidden="true" />
                    <strong className="coin-amount">{progression.profile.coins.toLocaleString()}</strong>
                    <strong className="coin-amount-compact" aria-hidden="true">{progression.profile.coins.toLocaleString(undefined,
                        progression.profile.coins >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined)}</strong>
                </span>
                <button ref={profileButton} className="profile-button" aria-label="View profile" title="Your profile" onClick={() => openProfile()}>
                    <PlayerAvatar profile={playerProfile} />
                </button>
            </div>
        </header>
        {upgradeSet && <Modal className="upgrade-modal" titleId="multiplier-upgrade-title" onClose={() => setUpgradeSet(null)} returnFocus={upgradeReturnFocus}>
            <MultiplierUpgrades set={upgradeSet} profile={progression.profile} baseBoard={payout.profileFor(upgradeSet).board} onBuy={progression.buyUpgrade} />
        </Modal>}
        {sharedRun && <Modal className="share-run-modal" titleId="share-run-title" onClose={() => setSharedRun(null)} returnFocus={shareReturnFocus}>
            <ShareRunDialog result={sharedRun.result} profile={sharedRun.profile} />
        </Modal>}
        {showLeaderboard && leaderboardDungeon && <Modal className="leaderboard-modal" titleId="daily-leaderboard-title" onClose={() => setShowLeaderboard(false)} returnFocus={leaderboardButton}>
            <DailyLeaderboard dungeon={leaderboardDungeon} now={daily.now} entries={standings} profile={playerProfile} />
        </Modal>}
        {showProfile && <Modal className={`profile-modal${editingProfile ? '' : ' profile-overview-modal'}`} titleId="profile-title" onClose={closeProfile} returnFocus={profileReturnFocus}>
            {editingProfile ? <ProfileEditor profile={playerProfile} onSave={updateProfile} onCancel={() => setEditingProfile(false)} />
                : <ProfileOverview profile={playerProfile} history={runHistory.history} endlessRecords={endless.records}
                    onEdit={() => setEditingProfile(true)} onPlay={() => { setShowProfile(false); openMenu(); }} onShare={openProfileShare} />}
        </Modal>}
        {sharedProfile && <Modal className="share-run-modal" titleId="share-profile-title" onClose={() => setSharedProfile(null)} returnFocus={profileShareReturnFocus}>
            <ShareProfileDialog profile={sharedProfile.profile} highScores={sharedProfile.highScores} />
        </Modal>}
        {showRules && !payout.sequence && !showProfile && <Modal className="rules-panel" titleId="game-rules" onClose={() => setShowRules(false)} returnFocus={helpButton}>
            <PageHelp key={`${page}/${showingResult}/${endless.session?.mode}/${endless.session?.phase === 'finished'}`} page={page}
                rules={page === 'endless-game' ? endless.session?.rules ?? rules : activeRules}
                moveQualities={page === 'endless-game' || !run ? undefined : run.levels.flatMap(level => level.generation.playerQualities ?? [])}
                floorCount={run?.floorCount ?? SKILL_TIER_CONFIG[skillTier].run.floorCount}
                result={showingResult} dailyRun={!!run?.daily} dailyStatus={dailyDungeon?.attempt?.status}
                dailyClosed={!!dailyDungeon && daily.now >= dailyDungeon.expiresAt} editingProfile={editingProfile} endless={endless.session} />
            <button className="primary-small" data-modal-focus autoFocus onClick={() => setShowRules(false)}>Got it</button>
            {(page === 'play' || page === 'regular' || page === 'regular-items' || (page === 'game' && run && !run.daily && run.phase !== 'finished'))
                && <button className="text-button" onClick={() => {
                    setShowRules(false);
                    if (page === 'game' && run) { setPendingChoice(null); setBoardSelection(null); setPreview(null); tutorial.begin(run, true, true); }
                    else beginRun('default', true);
                }}>{page === 'game' ? 'Replay play tutorial' : 'Start guided run'}</button>}
        </Modal>}
        <div className={`page-content${(page === 'game' && !showingResult) || (page === 'endless-game' && endless.session?.phase !== 'finished') ? ' game-content' : page === 'daily' || page === 'leaderboards' ? ' daily-content' : page === 'regular' || page === 'regular-items' || page === 'endless' || page === 'endless-items' ? ' regular-content' : page === 'profile' ? ' profile-content' : ''}`} ref={content}>
        {page === 'play' && <PlayMenu daily={daily.today} now={daily.now} available={!!pool.length} locked={firstPlayLocked}
            progress={leveling.progress} profile={playerProfile} levelingPersisted={leveling.persisted}
            skillSelection={needsSkillSelection ? {
                value: firstSkillTier, onChange: setFirstSkillTier,
                available: !!firstSkillTier && !!filterSkillTierLevels(pool, firstSkillTier).length,
                onContinue: () => { if (firstSkillTier) selectSkillTier(firstSkillTier); },
            } : undefined}
            onRegular={() => {
                if (progression.profile.finishedRuns === 0) {
                    if (resumableRegular) resumeRegular();
                    else if (skillPool.length) beginRun('default');
                    else navigate({ page: 'regular' });
                } else navigate({ page: 'regular' });
            }} onDaily={() => navigate({ page: 'daily' })}
            onEndless={() => navigate({ page: 'endless' })} endlessMove={endless.session && endless.session.phase !== 'finished' ? endless.session.moves + 1 : undefined}
            dailyRank={standings.find(entry => entry.id === 'you')?.rank}
            regularFloor={resumableRegular ? Math.min(resumableRegular.run.levelIndex + 1, resumableRegular.run.levels.length) : undefined}
            dailyFloor={resumableDaily ? Math.min(resumableDaily.levelIndex + 1, resumableDaily.levels.length) : undefined} />}
        {endlessPage && <EndlessPage page={page} controller={endless} active={endlessActive}
            profile={progression.profile} buyLoadout={progression.buyLoadout} navigate={navigate} onShare={openRunShare} />}
        {(page === 'regular' || page === 'regular-items') && <section className="regular-page" aria-labelledby="regular-page-title">
            <div className="regular-setup-body" data-page-scroll="regular-setup">
                <header className="page-heading regular-setup-heading">
                    <h1 id="regular-page-title" tabIndex={-1} data-page-focus>{page === 'regular' ? 'Regular run' : 'Choose your items'}</h1>
                </header>
                {page === 'regular' && <><SkillTierPicker cards value={skillTier} onChange={selectSkillTier} />
                    {!skillPool.length && <p className="skill-unavailable" role="status">No floors are available for this skill level yet. Choose another skill level.</p>}</>}
                {page === 'regular' ? <PieceSetPicker showHeading={false} selectionOnly selectedSet={regularSelectedSet} onSelect={setRegularSelectedSet}
                    onUpgrade={openUpgrades} progression={progression.profile} defaultStartingHealth={rules.startingHealth} />
                    : <ItemLoadout selected={selectedItems} coins={progression.profile.coins}
                        onChange={setSelectedItems} onBring={bringItem} />}
            </div>
            <footer className="regular-setup-footer">
                <div className={`setup-actions${page === 'regular' && resumableRegular ? ' setup-actions-resumable' : ''}`}>
                    {page === 'regular' ? <>
                        {resumableRegular && <button className="primary-small" onClick={resumeRegular}>Resume regular run</button>}
                        <button className={resumableRegular ? 'text-button' : 'primary-small'} disabled={!skillPool.length} onClick={() => navigate({ page: 'regular-items' })}>
                            {resumableRegular ? 'Start new run' : 'Next: items'}</button>
                    </> : <>
                        <button className="text-button" onClick={() => navigate({ page: 'regular' })}>Back to sets</button>
                        <button className="primary-small" disabled={!skillPool.length || !isPieceSetUnlocked(regularSelectedSet, progression.profile) || loadoutCost(selectedItems) > progression.profile.coins} onClick={() => beginRun(regularSelectedSet)}>
                            {resumableRegular ? 'Start new run' : 'Start run'}</button>
                    </>}
                </div>
            </footer>
        </section>}
        {page === 'daily' && dailyDungeon && <DailyDungeonPage key={dailyDungeon.day} dungeon={dailyDungeon} today={daily.today?.day ?? dailyDungeon.day} now={daily.now}
            progression={progression.profile} defaultStartingHealth={rules.startingHealth} selected={dailySelectedSet} onSelected={setDailySelectedSet}
            onUpgrade={openUpgrades} onEnter={() => beginDaily(dailySelectedSet)} onResume={resumeDaily}
            onToday={() => navigate({ page: 'daily' })}
            rank={standings.find(entry => entry.id === 'you')?.rank} persisted={daily.persisted} onShare={openRunShare}
            skillTier={skillTier} onSkillTier={selectSkillTier} />}
        {page === 'daily' && !dailyDungeon && <p className="empty-state" role="status">No dungeon available.</p>}
        {page === 'leaderboards' && <LeaderboardsPage dungeon={daily.today} now={daily.now} entries={standings} profile={playerProfile} />}
        {page === 'profile' && <section className="profile-page" aria-labelledby="profile-page-title">
            {editingProfile ? <ProfileEditor asPage profile={playerProfile} onSave={updateProfile} onCancel={() => setEditingProfile(false)} />
                : <ProfileOverview asPage profile={playerProfile} history={runHistory.history} endlessRecords={endless.records}
                    onEdit={() => setEditingProfile(true)} onPlay={openMenu} onShare={openProfileShare} />}
        </section>}
        {page === 'game' && (!showingResult || run?.daily) && <section id="game" className={`game-layout${immersiveRun ? ' run-stage' : ''}${tutorialStep ? ` tutorial-focus-${tutorialStep}` : ''}`} aria-label={run?.daily ? 'Daily game' : 'Regular game'} tabIndex={-1} data-page-focus data-gamepad-active={gamepadActive || undefined}>
            {immersiveRun && <RunScenery />}
            <div className={`board-column${run?.daily ? ' daily-board-column' : ''}`}>
                {immersiveRun && run && <RunGate floor={run.levelIndex + 1} skillTier={run.skillTier} />}
                {!immersiveRun && run && !run.daily && <div className="run-skill-level"><SkillTierBadge skillTier={run.skillTier} /></div>}
                {run?.daily && <div className="daily-run-label"><div className="daily-run-heading"><span className="daily-run-banner"><DoorOpen size={14} aria-hidden="true" />DAILY DUNGEON</span>
                    {!immersiveRun && <SkillTierBadge skillTier={run.skillTier} />}</div>
                    <time aria-label="Time until dungeon resets"><Clock3 size={14} aria-hidden="true" />{formatCountdown(run.daily.expiresAt, daily.now)}</time></div>}
                <div className="board-wrap">
                    {immersiveRun && <RunBoardFrame />}
                    {fen && level ? <Chessboard options={boardOptions} /> : <div className="empty-board">No playable floors</div>}
                    {checkpointReward && run && <RunCheckpointReward key={`${run.id}-${checkpointReward.afterRound}`}
                        reward={checkpointReward} enabled={!paused}
                        onChoose={id => { const current = latestRun.current;
                            if (current && !paused) changeRun(chooseCheckpointItem(current, id)); }} />}
                    {visibleNotice && <BoardNotification key={visibleNotice.id} notice={visibleNotice}
                        onComplete={payout.notice ? payout.advanceNotice : boardNotice ? completeBoardNotice : progression.advanceUnlock} />}
                </div>
                <div className="level-progress" role={run ? 'progressbar' : undefined} aria-label={run ? 'Run progress' : undefined}
                    aria-valuemin={run ? 1 : undefined} aria-valuemax={run?.levels.length} aria-valuenow={run ? run.levelIndex + 1 : undefined}
                    aria-valuetext={run ? checkpointReward ? `Checkpoint after floor ${run.levelIndex + 1} of ${run.levels.length}`
                        : `Floor ${run.levelIndex + 1} of ${run.levels.length}` : undefined}>
                    {(run?.levels ?? skillPool.slice(0, SKILL_TIER_CONFIG[skillTier].run.floorCount)).flatMap((item, index) => {
                        const reward = run?.checkpointRewards.find(entry => entry.afterRound === index + 1);
                        const floor = <span key={item.id} aria-hidden="true"
                            className={run ? index < run.levelIndex || (index === run.levelIndex && checkpointReward) ? 'past'
                                : index === run.levelIndex ? 'current' : 'future' : 'future'} />;
                        return reward ? [floor, <span key={`checkpoint-${item.id}`} aria-hidden="true"
                            title={`Checkpoint after floor ${reward.afterRound}`}
                            className={`checkpoint-dot ${reward.selected !== null ? 'past' : checkpointReward?.afterRound === reward.afterRound ? 'current' : 'future'}`} />] : [floor];
                    })}
                </div>
            </div>
            <aside className="play-panel">
                <div className="run-details">
                    <div className="run-stats" aria-label="Run statistics">
                        <div className="health-stats">
                            {immersiveRun ? <RunHearts health={run?.health ?? rules.startingHealth} maxHealth={activeRules.startingHealth} />
                                : <span className="health-count" aria-label={`Health: ${run?.health ?? rules.startingHealth}`}><Heart size={15} fill="currentColor" aria-hidden="true" /><strong>{run?.health ?? rules.startingHealth}</strong></span>}
                            {run && run.bestMoveStreak > 0 && <span className="streak-count" aria-label={`Best streak: ${run.bestMoveStreak}`}><Flame size={15} fill="currentColor" aria-hidden="true" /><strong>{run.bestMoveStreak}</strong></span>}
                        </div>
                        <span className="move-count" aria-label={`Score: ${displayScore}`}>{immersiveRun && <RunScorePlaque />}<span>Score</span><strong>{displayScore.toLocaleString()}</strong></span>
                    </div>
                    {run && hasRunItems && !showBonusBoard && <RunItems key={run.id} items={run.items} activeEffects={run.activeEffects}
                        canUse={id => canActivateItem(run, id)} enabled={itemInteraction} onUse={useRunItem} />}
                </div>
                {!checkpointReward && <div className="options-area">
                    {!pool.length && <div className="empty-state" role="status">No scored, playable floors.</div>}
                    {playing && <MoveOptions immersive={immersiveRun} groupRef={moveOptions} pending={pendingChoice} onPreview={setPreview}
                        onSelect={uci => !!uci[4] && boardSelection?.from === uci.slice(0, 2) && boardSelection?.to === uci.slice(2, 4)
                            ? commitMove(uci) : selectMove(uci)}
                        options={choices.map((choice, index) => {
                            const pending = pendingChoice === choice.playerMove.uci;
                            const promotion = choice.playerMove.uci[4];
                            const choosingPromotion = !!promotion && boardSelection?.from === choice.playerMove.uci.slice(0, 2)
                                && boardSelection?.to === choice.playerMove.uci.slice(2, 4);
                            const PromotionPiece = choosingPromotion
                                ? PIECE_RENDERERS[pieceSet][`${level?.playerColor === 'black' ? 'b' : 'w'}${promotion!.toUpperCase()}`]
                                : undefined;
                            return { uci: choice.playerMove.uci, content: PromotionPiece && <PromotionPiece />,
                                label: choosingPromotion ? `Promote to ${PIECES[promotion!]!.toLowerCase()}: ${choice.playerMove.san}.`
                                    : pending ? `Confirm ${choice.playerMove.san}. Tap again to play this move.` : `Option ${index + 1}: ${choice.playerMove.san}, ${moveDescription(choice, run!.node.fen)}. Tap twice to play.` };
                        })} />}
                    {payout.sequence && <div className="payout-card" role="status" aria-label="Score payout">
                        <Sparkles size={20} aria-hidden="true" />
                        <span>Score bonus</span>
                        <strong>{payout.sequence.phase === 'spinning' ? '…' : formatMultiplier(payout.sequence.outcome.multiplier)}</strong>
                    </div>}
                    {!payout.sequence && run && (run.phase === 'reveal' || run.phase === 'reply') && <Feedback run={run} />}
                    {!payout.sequence && run?.phase === 'level-ended' && <div className="finished-card"><h2>{currentOutcome?.status === 'completed' ? 'Floor completed' : 'Floor lost'}</h2></div>}
                </div>}
            </aside>
        </section>}
        {showingResult && !run!.daily && <RunSummary run={run!} payout={payout.result!} restart={() => navigate({ page: 'regular' })}
            onShare={openRunShare} finishedAt={runHistory.history.runs.find(record => record.id === run!.id)?.finishedAt} />}
        {levelWarnings.length > 0 && <details className="catalog-warnings"><summary>{levelWarnings.length} floor file(s) could not be loaded</summary><ul>{levelWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        </div>
        {tutorialStep && run && <PlayTutorial step={tutorialStep} run={run} selectedFrom={boardSelection?.from}
            targetSquare={tutorialStep === 'piece' ? tutorialMove?.playerMove.uci.slice(0, 2) : tutorialMove?.playerMove.uci.slice(2, 4)}
            targetMove={tutorialMove?.playerMove.uci}
            pendingMove={pendingChoice !== null} onNext={tutorial.next} onSkip={tutorial.skip} />}
        {profileSaveMessage && <p className="profile-save-toast" role="status">{profileSaveMessage}</p>}
    </main>;
}
