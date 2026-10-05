import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { ArrowUp, Check, Clock3, Coins, DoorOpen, Flame, Heart, Sparkles, Trophy, Unlock, X } from 'lucide-react';
import type { GeneratedLevel, PlayerChoice } from './types/level';
import { selectLevels } from './game/levels';
import { BoardNotification, type BoardNotice } from './components/BoardNotification';
import { PlayMenu, formatCountdown } from './components/PlayMenu';
import { PieceSetPicker } from './components/PieceSetPicker';
import { DailyDungeonPage } from './components/DailyDungeonPage';
import { usePageNavigation } from './game/usePageNavigation';
import { MultiplierUpgrades } from './components/MultiplierUpgrades';
import { PlayerAvatar } from './components/PlayerAvatar';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileOverview } from './components/ProfileOverview';
import { DailyLeaderboard } from './components/DailyLeaderboard';
import { dailyLeaderboard } from './game/leaderboard';
import { loadPlayerProfile, savePlayerProfile, type PlayerProfile } from './game/playerProfile';
import { PIECE_RENDERERS } from './components/pieces/pieceRenderers';
import { PIECE_SETS, type PieceSetId } from './game/pieceSets';
import { createDeathNotice, createHealthNotice, installNotificationConsole } from './components/notificationConsole';
import { BOARD_SQUARES, formatMultiplier, type PayoutResult } from './game/multipliers';
import { useBoardPayout } from './game/useBoardPayout';
import { useUserProgression } from './game/useUserProgression';
import { useRunHistory } from './game/useRunHistory';
import { isPieceSetUnlocked } from './game/progression';
import { runCoinReward } from './game/economy';
import { applyPaidUpgrades } from './game/economy';
import { useDailyDungeon } from './game/useDailyDungeon';
import { restoreDailyRun } from './game/daily';
import {
    advancePlayback, BEST_MOVE_STREAK_LENGTH, boardFen, chooseMove, DEFAULT_RULES, nextLevel,
    QUALITY_LABELS, QUALITY_ORDER, RUN_LEVEL_COUNT, shuffleChoices, startRun,
    type RunRules, type RunState,
} from './game/run';

interface AppProps {
    levels: readonly GeneratedLevel[];
    levelWarnings?: readonly string[];
    rules?: RunRules;
}

// Colors identify shuffled options, never move quality.
const OPTION_COLORS = ['#c28b26', '#477c9e', '#a95843', '#785b96'];
const CONFIRM_COLOR = '#2f8a5c';
const EMPTY_BOARD_POSITION = {};
const PIECES: Record<string, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

function createNextFloorNotice(run: RunState): BoardNotice {
    const label = `Floor ${run.levelIndex + 2}`;
    return {
        id: `level-${run.id}-${run.levelIndex + 2}`, visual: <ArrowUp strokeWidth={1.5} />,
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
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]');
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
        <span>+{run.rules.points[choice.quality]} points</span>
    </div>;
}

function RunSummary({ run, payout, restart, onChangeSet }: {
    run: RunState;
    payout: PayoutResult;
    restart: () => void;
    onChangeSet: () => void;
}) {
    return <section className="summary result-page" aria-labelledby="result-title">
        <h1 id="result-title" tabIndex={-1} data-page-focus>{run.result === 'complete' ? 'Run complete' : 'Run over'}</h1>
        <span className="summary-score-label">Total score</span>
        <strong className="summary-score">{payout.finalScore.toLocaleString()}</strong>
        <p className="summary-calculation">{payout.baseScore.toLocaleString()} {formatMultiplier(payout.multiplier)}</p>
        <span className="coin-balance summary-coins" aria-label={`Earned ${runCoinReward(run)} coins`}>
            <Coins size={17} aria-hidden="true" /><strong>+{runCoinReward(run).toLocaleString()}</strong>
        </span>
        <details className="reward-details"><summary>Run details</summary><dl className="summary-stats">
            <div><dt>Floors completed</dt><dd>{run.levelsCompleted} / {run.levels.length}</dd></div>
            <div><dt>Total decisions</dt><dd>{run.decisionsMade}</dd></div>
        </dl>
        <div className="quality-counts" aria-label="Move counts">
            {QUALITY_ORDER.map(quality => <div key={quality}><strong>{run.moveCounts[quality]}</strong><span>{QUALITY_LABELS[quality]}</span></div>)}
        </div>
        </details>
        <div className="result-actions"><button className="primary-small" onClick={restart}>Play again</button>
            <button className="text-button" onClick={onChangeSet}>Change set</button></div>
    </section>;
}

function historyRows(run: RunState | null, level: GeneratedLevel | undefined) {
    const rows: { number: number; white: string; black: string }[] = [];
    if (!run || !level) return rows;
    let number = Number(level.root.fen.split(' ')[5]);
    function add(san: string, color: 'white' | 'black') {
        let row = rows.at(-1);
        if (!row || row.number !== number) {
            row = { number, white: '', black: '' };
            rows.push(row);
        }
        row[color] = san;
        if (color === 'black') number++;
    }
    for (const entry of run.history.filter(move => move.levelId === level.id)) {
        add(entry.playerMove.san, level.playerColor);
        if (entry.opponentReply) add(entry.opponentReply.san, level.playerColor === 'white' ? 'black' : 'white');
    }
    return rows;
}

export default function App({ levels, levelWarnings = [], rules = DEFAULT_RULES }: AppProps) {
    const pool = useMemo(() => selectLevels(levels), [levels]);
    const [run, setRun] = useState<RunState | null>(null);
    const daily = useDailyDungeon(pool);
    const { location, navigate, content } = usePageNavigation();
    const page = location.page;
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [regularSelectedSet, setRegularSelectedSet] = useState<PieceSetId>('default');
    const [dailySelectedSet, setDailySelectedSet] = useState<PieceSetId>('default');
    const [expirationActive, setExpirationActive] = useState(false);
    const regularRun = useRef<{ run: RunState; set: PieceSetId } | null>(null);
    const [playerProfile, setPlayerProfile] = useState(loadPlayerProfile);
    const [showProfile, setShowProfile] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
    const progression = useUserProgression(run);
    const runHistory = useRunHistory();
    const [pieceSet, setPieceSet] = useState<PieceSetId>('default');
    const [upgradeSet, setUpgradeSet] = useState<PieceSetId | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [pendingChoice, setPendingChoice] = useState<string | null>(null);
    const [boardSelection, setBoardSelection] = useState<{ from: string; to: string | null } | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [boardNotice, setBoardNotice] = useState<BoardNotice | null>(null);
    const dismissBoardNotice = useCallback(() => setBoardNotice(null), []);
    const waitingForCheckmate = run?.phase === 'level-ended'
        && boardNotice?.id === `checkmate-${run.id}-${run.levelIndex}`;
    const checkmatedFloor = waitingForCheckmate ? run : null;
    const completeBoardNotice = useCallback(() => {
        setBoardNotice(checkmatedFloor ? createNextFloorNotice(checkmatedFloor) : null);
    }, [checkmatedFloor]);
    const activeDaily = run?.daily ? daily.archive.days[run.daily.day]?.attempt : undefined;
    const paused = page !== 'game' || showProfile || showLeaderboard || !!upgradeSet || showRules;
    const payout = useBoardPayout(run, boardNotice !== null, pieceSet, paused,
        progression.profile.paidUpgrades, activeDaily?.multipliers, activeDaily?.payout);
    const helpButton = useRef<HTMLButtonElement>(null);
    const profileButton = useRef<HTMLButtonElement>(null);
    const leaderboardButton = useRef<HTMLButtonElement>(null);
    const profileReturnFocus = useRef<HTMLButtonElement | null>(null);
    const upgradeReturnFocus = useRef<HTMLButtonElement | null>(null);
    const dailyDungeon = location.day ? daily.archive.days[location.day] ?? daily.today : daily.today;
    const leaderboardDungeon = page === 'game' && run?.daily ? daily.archive.days[run.daily.day] : dailyDungeon;
    const standings = useMemo(() => leaderboardDungeon ? dailyLeaderboard(leaderboardDungeon.day, playerProfile,
        leaderboardDungeon.attempt?.status === 'finished' ? leaderboardDungeon.attempt.payout?.finalScore ?? null : null) : [],
    [leaderboardDungeon?.day, leaderboardDungeon?.attempt?.payout, playerProfile]);
    const savedDailyRun = useMemo(() => page === 'play' && daily.today?.attempt?.status === 'active' ? restoreDailyRun(daily.today) : null, [page, daily.today]);
    const level = run ? run.levels[run.levelIndex] : pool[0];
    const node = run?.node;
    const choices = useMemo(() => node?.kind === 'decision' ? shuffleChoices(node.choices) : [], [node]);
    const fen = run ? boardFen(run) : level?.root.fen;
    const playing = run?.phase === 'decision' && !payout.sequence && !paused && !expirationActive;
    const activeRules = run?.rules ?? rules;
    const orientation = level?.playerColor ?? 'white';
    const rows = historyRows(run, level);
    const currentOutcome = run?.outcomes.find(outcome => outcome.id === level?.id);
    const unlockedSet = progression.pendingUnlocks[0];
    const unlockNotice = useMemo<BoardNotice | null>(() => unlockedSet ? {
        id: `unlock-${unlockedSet}`, visual: <Unlock />, label: PIECE_SETS[unlockedSet].name,
        caption: 'Unlocked', announcement: `${PIECE_SETS[unlockedSet].name} unlocked`, tone: 'reward', durationMs: 2000,
    } : null, [unlockedSet]);
    const showingResult = page === 'game' && run?.phase === 'finished' && !!payout.result && !payout.sequence && !boardNotice && !unlockNotice;
    const showBonusBoard = !!payout.sequence || (run?.phase === 'finished' && !!payout.result);
    const displayScore = payout.result?.finalScore ?? run?.score ?? 0;
    const visibleNotice = expirationActive ? boardNotice : paused ? null : payout.notice ?? boardNotice
        ?? (run?.phase === 'finished' && payout.result && !payout.sequence && !showRules ? unlockNotice : null);

    useEffect(() => installNotificationConsole(setBoardNotice, dismissBoardNotice, payout.preview), [dismissBoardNotice, payout.preview]);

    useEffect(() => {
        setShowRules(false);
        setShowProfile(false);
        setShowLeaderboard(false);
        setUpgradeSet(null);
    }, [page, location.day]);

    useEffect(() => {
        if (page === 'game' && !run && !expirationActive) navigate({ page: 'play' }, true);
    }, [page, run, expirationActive, navigate]);

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
            payout.claimDailyUpgrade(dungeon.attempt.setId, dungeon.attempt.payout, dungeon.day);
            runHistory.recordRun(completed, dungeon.attempt.payout, dungeon.attempt.finishedAt ?? Date.now());
        }
    }, [daily.archive, progression.recordRun, payout.claimDailyUpgrade, runHistory.recordRun]);

    // The final score is known as soon as the actual payout starts, even if its animation is interrupted.
    const finishedPayout = payout.result ?? (payout.sequence?.preview ? null : payout.sequence?.outcome);
    useEffect(() => {
        if (run?.phase === 'finished' && !run.daily && finishedPayout) runHistory.recordRun(run, finishedPayout);
    }, [run, finishedPayout, runHistory.recordRun]);

    useEffect(() => {
        if (!profileSaveMessage) return;
        const timer = window.setTimeout(() => setProfileSaveMessage(null), 3500);
        return () => window.clearTimeout(timer);
    }, [profileSaveMessage]);

    function openProfile(button?: HTMLButtonElement) {
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
        if (page === 'game' && run?.id === daily.expired.id) {
            setShowProfile(false);
            setShowRules(false);
            setShowLeaderboard(false);
            setUpgradeSet(null);
            setExpirationActive(true);
            setBoardNotice({ id: `expired-${daily.expired.id}`, visual: <Clock3 />, label: 'Dungeon expired',
                caption: 'Your daily attempt has ended', announcement: 'Dungeon expired. Your daily attempt has ended.',
                tone: 'danger', durationMs: 2500 });
        } else {
            setProfileSaveMessage('Your unfinished daily dungeon has expired.');
            if (run?.id === daily.expired.id) {
                const regular = regularRun.current;
                setRun(regular?.run ?? null);
                setPieceSet(regular?.set ?? 'default');
                payout.reset(regular?.set ?? 'default');
            }
            daily.clearExpiration();
        }
    }, [daily.expired, daily.clearExpiration, run?.id, page]);

    function completeExpiration() {
        setBoardNotice(null);
        setExpirationActive(false);
        daily.clearExpiration();
        const regular = regularRun.current;
        setRun(regular?.run ?? null);
        setPieceSet(regular?.set ?? 'default');
        payout.reset(regular?.set ?? 'default');
        setUpgradeSet(null);
        navigate({ page: 'daily' }, true);
    }

    function changeRun(next: RunState) {
        if (!daily.update(next)) return;
        setRun(next);
        if (next.outcomes.length > (run?.outcomes.length ?? 0) && next.node.kind === 'terminal'
            && next.node.reason === 'checkmate' && next.node.result === next.levels[next.levelIndex]!.playerColor) {
            setBoardNotice({
                id: `checkmate-${next.id}-${next.levelIndex}`, visual: <Trophy strokeWidth={1.5} />,
                label: 'Checkmate', announcement: 'Checkmate', tone: 'reward',
            });
        } else if (next.phase === 'level-ended' && run?.phase !== 'level-ended'
            && next.outcomes.at(-1)?.status === 'completed') {
            setBoardNotice(createNextFloorNotice(next));
        }
    }

    useEffect(() => {
        if (paused || expirationActive || waitingForCheckmate || payout.sequence?.preview || (run?.phase !== 'reveal' && run?.phase !== 'reply' && run?.phase !== 'level-ended')) return;
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
    }, [run, payout.sequence?.preview, paused, expirationActive, waitingForCheckmate]);

    function beginRun(set: PieceSetId) {
        if (!pool.length || !isPieceSetUnlocked(set, progression.profile)) return;
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
        setRun(startRun(pool, set === 'default' ? rules : { ...rules, startingHealth: PIECE_SETS[set].startingHealth }));
    }

    function openMenu() {
        setShowRules(false);
        setUpgradeSet(null);
        navigate({ page: 'play' });
    }

    function beginDaily(set: PieceSetId) {
        if (!isPieceSetUnlocked(set, progression.profile)) return;
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
            return;
        }
        commitMove(uci);
    }

    function commitMove(uci: string) {
        if (!playing || !choices.some(choice => choice.playerMove.uci === uci)) return;
        setPreview(null);
        setPendingChoice(null);
        setBoardSelection(null);
        const updated = chooseMove(run!, uci);
        changeRun(updated);
        if (updated !== run && updated.lastChoice && (!run?.daily || Date.now() < run.daily.expiresAt)) {
            const healthChange = updated.lastHealthBonus - updated.rules.damage[updated.lastChoice.quality];
            if (updated.result === 'defeat') setBoardNotice(createDeathNotice());
            else if (healthChange !== 0) setBoardNotice(createHealthNotice(healthChange));
        }
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
    } else if (highlighted) {
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
    const boardOptions: ChessboardOptions = {
        id: 'knightfall-board', position: showBonusBoard ? EMPTY_BOARD_POSITION : fen, boardOrientation: orientation,
        showAnimations: !showBonusBoard,
        allowDragging: false, allowDrawingArrows: false, showNotation: true, animationDurationInMs: 220,
        darkSquareStyle: { backgroundColor: '#41665b' }, lightSquareStyle: { backgroundColor: '#e9e3d4' },
        boardStyle: { borderRadius: '6px', boxShadow: '0 22px 55px rgba(4, 12, 10, .28)' },
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
    const continueDaily = !!resumableDaily && (!!run?.daily || !resumableRegular);
    const continueRun = continueDaily ? resumableDaily : resumableRegular?.run;
    return <main className={`app-shell${page === 'play' ? ' main-menu-shell' : ''}`}>
        <header className={`topbar${page === 'play' ? ' main-menu-topbar' : ''}`}>
            {page !== 'play' && <a className="brand" href="#/play" aria-label="Knightfall home" onClick={event => { event.preventDefault(); if (!expirationActive) openMenu(); }}><img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="34" height="38" /><strong>Knightfall</strong></a>}
            <div className="top-actions">
                {page === 'game' && run?.daily && <button ref={leaderboardButton} className="leaderboard-button" disabled={!leaderboardDungeon || expirationActive}
                    aria-label="Daily leaderboard" title="Daily leaderboard" onClick={openLeaderboard}><Trophy size={18} aria-hidden="true" /></button>}
                <button ref={helpButton} disabled={!!payout.sequence || expirationActive} className="text-button help-button" aria-label="How to play" aria-expanded={showRules} aria-controls="game-rules" onClick={() => setShowRules(value => !value)}>?</button>
                <span className="coin-balance" aria-label={`Coins: ${progression.profile.coins}`} title={`${progression.profile.coins.toLocaleString()} coins`}>
                    <Coins size={17} aria-hidden="true" />
                    <strong className="coin-amount">{progression.profile.coins.toLocaleString()}</strong>
                    <strong className="coin-amount-compact" aria-hidden="true">{progression.profile.coins.toLocaleString(undefined,
                        progression.profile.coins >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined)}</strong>
                </span>
                <button ref={profileButton} className="profile-button" disabled={expirationActive} aria-label="View profile" title="Your profile" onClick={() => openProfile()}>
                    <PlayerAvatar profile={playerProfile} />
                </button>
            </div>
        </header>
        {upgradeSet && <Modal className="upgrade-modal" titleId="multiplier-upgrade-title" onClose={() => setUpgradeSet(null)} returnFocus={upgradeReturnFocus}>
            <MultiplierUpgrades set={upgradeSet} profile={progression.profile} baseBoard={payout.profileFor(upgradeSet).board} onBuy={progression.buyUpgrade} />
        </Modal>}
        {showLeaderboard && leaderboardDungeon && <Modal className="leaderboard-modal" titleId="daily-leaderboard-title" onClose={() => setShowLeaderboard(false)} returnFocus={leaderboardButton}>
            <DailyLeaderboard dungeon={leaderboardDungeon} now={daily.now} entries={standings} profile={playerProfile} />
        </Modal>}
        {showProfile && <Modal className={`profile-modal${editingProfile ? '' : ' profile-overview-modal'}`} titleId="profile-title" onClose={closeProfile} returnFocus={profileReturnFocus}>
            {editingProfile ? <ProfileEditor profile={playerProfile} onSave={updateProfile} onCancel={() => setEditingProfile(false)} />
                : <ProfileOverview profile={playerProfile} history={runHistory.history} now={daily.now} onEdit={() => setEditingProfile(true)} />}
        </Modal>}
        {showRules && !payout.sequence && !showProfile && <Modal className="rules-panel" titleId="game-rules" onClose={() => setShowRules(false)} returnFocus={helpButton}>
            <h2 id="game-rules">How to play</h2>
            <p>Tap a piece, then an offered destination. Or tap a colored option twice.</p>
            <p>Start with {activeRules.startingHealth} health. Health and score carry across floors.</p>
            <p>{BEST_MOVE_STREAK_LENGTH} Best in a row: +1 HP.</p>
            <p>Every run ends with a square multiplier. Complete all 10 floors to permanently upgrade one square.</p>
            <ul>{QUALITY_ORDER.map(quality => <li key={quality}><strong>{QUALITY_LABELS[quality]}</strong><span>+{activeRules.points[quality]} points / {activeRules.damage[quality]} health lost</span></li>)}</ul>
            <button className="primary-small" data-modal-focus autoFocus onClick={() => setShowRules(false)}>Got it</button>
        </Modal>}
        <div className={`page-content${page === 'game' && !showingResult ? ' game-content' : page === 'daily' ? ' daily-content' : ''}`} ref={content}>
        {page === 'play' && <PlayMenu daily={daily.today} now={daily.now} available={!!pool.length}
            onRegular={() => navigate({ page: 'regular' })} onDaily={() => navigate({ page: 'daily' })}
            dailyRank={standings.find(entry => entry.id === 'you')?.rank}
            continuation={continueRun ? { mode: continueDaily ? 'daily' : 'regular', level: Math.min(continueRun.levelIndex + 1, continueRun.levels.length), onContinue: continueDaily ? resumeDaily : resumeRegular } : undefined} />}
        {page === 'regular' && <section className="regular-page" aria-labelledby="regular-page-title">
            <header className="page-heading"><h1 id="regular-page-title" tabIndex={-1} data-page-focus>Regular run</h1></header>
            <PieceSetPicker showHeading={false} selectionOnly selectedSet={regularSelectedSet} onSelect={setRegularSelectedSet}
                onUpgrade={openUpgrades} progression={progression.profile} defaultStartingHealth={rules.startingHealth} />
            <div className="setup-actions">{resumableRegular && <button className="text-button" onClick={resumeRegular}>Resume regular run</button>}
                <button className="primary-small" disabled={!pool.length} onClick={() => beginRun(regularSelectedSet)}>{resumableRegular ? 'Start new run' : 'Start run'}</button></div>
            {resumableRegular && <p className="setup-replacement">Starting a new run replaces your regular run.</p>}
        </section>}
        {page === 'daily' && dailyDungeon && <DailyDungeonPage key={dailyDungeon.day} dungeon={dailyDungeon} today={daily.today?.day ?? dailyDungeon.day} now={daily.now}
            progression={progression.profile} defaultStartingHealth={rules.startingHealth} selected={dailySelectedSet} onSelected={setDailySelectedSet}
            onUpgrade={openUpgrades} onEnter={() => beginDaily(dailySelectedSet)} onResume={resumeDaily}
            onToday={() => navigate({ page: 'daily' })}
            entries={standings} profile={playerProfile} persisted={daily.persisted} />}
        {page === 'daily' && !dailyDungeon && <p className="empty-state" role="status">No dungeon available.</p>}
        {page === 'game' && (!showingResult || run?.daily) && <section id="game" className="game-layout" aria-label={run?.daily ? 'Daily game' : 'Regular game'} tabIndex={-1} data-page-focus>
            <div className={`board-column${run?.daily ? ' daily-board-column' : ''}`}>
                {run?.daily && <div className="daily-run-label"><span className="daily-run-banner"><DoorOpen size={14} aria-hidden="true" />DAILY DUNGEON</span>
                    <time aria-label="Time until dungeon expires"><Clock3 size={14} aria-hidden="true" />{formatCountdown(run.daily.expiresAt, daily.now)}</time></div>}
                <div className="board-wrap">
                    {fen && level ? <Chessboard options={boardOptions} /> : <div className="empty-board">No playable floors</div>}
                    {visibleNotice && <BoardNotification key={visibleNotice.id} notice={visibleNotice}
                        onComplete={expirationActive ? completeExpiration : payout.notice ? payout.advanceNotice : boardNotice ? completeBoardNotice : progression.advanceUnlock} />}
                </div>
                <div className="level-progress" role={run ? 'progressbar' : undefined} aria-label={run ? 'Run progress' : undefined}
                    aria-valuemin={run ? 1 : undefined} aria-valuemax={run?.levels.length} aria-valuenow={run ? run.levelIndex + 1 : undefined}
                    aria-valuetext={run ? `Floor ${run.levelIndex + 1} of ${run.levels.length}` : undefined}>
                    {(run?.levels ?? pool.slice(0, RUN_LEVEL_COUNT)).map((item, index) => <span key={item.id} aria-hidden="true"
                        className={run ? index < run.levelIndex ? 'past' : index === run.levelIndex ? 'current' : 'future' : 'future'} />)}
                </div>
                <div className="run-stats" aria-label="Run statistics">
                    <div className="health-stats">
                        <span className="health-count" aria-label={`Health: ${run?.health ?? rules.startingHealth}`}><Heart size={15} fill="currentColor" aria-hidden="true" /><strong>{run?.health ?? rules.startingHealth}</strong></span>
                        {run && run.bestMoveStreak > 0 && <span className="streak-count" aria-label={`Best streak: ${run.bestMoveStreak}`}><Flame size={15} fill="currentColor" aria-hidden="true" /><strong>{run.bestMoveStreak}</strong></span>}
                    </div>
                    <span className="move-count" aria-label={`Score: ${displayScore}`}><span>Score</span><strong>{displayScore.toLocaleString()}</strong></span>
                </div>
            </div>
            <aside className="play-panel">
                <div className="options-area">
                    {!pool.length && <div className="empty-state" role="status">No scored, playable floors.</div>}
                    {playing && <div className="move-picker"><div className="move-options" role="group" aria-label="Available moves">
                        {choices.map((choice, index) => {
                            const pending = pendingChoice === choice.playerMove.uci;
                            const promotion = choice.playerMove.uci[4];
                            const choosingPromotion = !!promotion && boardSelection?.from === choice.playerMove.uci.slice(0, 2)
                                && boardSelection?.to === choice.playerMove.uci.slice(2, 4);
                            const PromotionPiece = choosingPromotion
                                ? PIECE_RENDERERS[pieceSet][`${level?.playerColor === 'black' ? 'b' : 'w'}${promotion!.toUpperCase()}`]
                                : undefined;
                            return <button className={`move-option${pending ? ' pending' : ''}`} key={choice.playerMove.uci}
                                onClick={() => choosingPromotion ? commitMove(choice.playerMove.uci) : selectMove(choice.playerMove.uci)}
                                onMouseEnter={() => setPreview(choice.playerMove.uci)} onMouseLeave={() => setPreview(null)}
                                onFocus={() => setPreview(choice.playerMove.uci)} onBlur={() => setPreview(null)}
                                aria-pressed={pending}
                                aria-label={choosingPromotion ? `Promote to ${PIECES[promotion!]!.toLowerCase()}: ${choice.playerMove.san}.`
                                    : pending ? `Confirm ${choice.playerMove.san}. Tap again to play this move.` : `Option ${index + 1}: ${choice.playerMove.san}, ${moveDescription(choice, run!.node.fen)}. Tap twice to play.`}
                                style={{ '--option-color': OPTION_COLORS[index] } as CSSProperties}>
                                {PromotionPiece && <PromotionPiece />}
                                {pending && <Check className="selection-check" aria-hidden="true" strokeWidth={3} />}
                            </button>;
                        })}
                    </div></div>}
                    {payout.sequence && <div className="payout-card" role="status" aria-label="Score payout">
                        <Sparkles size={20} aria-hidden="true" />
                        <span>Score bonus</span>
                        <strong>{payout.sequence.phase === 'spinning' ? '…' : formatMultiplier(payout.sequence.outcome.multiplier)}</strong>
                    </div>}
                    {!payout.sequence && run && (run.phase === 'reveal' || run.phase === 'reply') && <Feedback run={run} />}
                    {!payout.sequence && run?.phase === 'level-ended' && <div className="finished-card"><h2>{currentOutcome?.status === 'completed' ? 'Floor completed' : 'Floor lost'}</h2></div>}
                </div>
                <section className="history-section">
                    <div className="section-title">Move history</div>
                    <div className="history-list" tabIndex={0} aria-label="Move history">
                        {rows.map(row => <div className="history-row" key={row.number}><span>{row.number}.</span><strong>{row.white}</strong><strong>{row.black}</strong></div>)}
                    </div>
                </section>
            </aside>
        </section>}
        {showingResult && !run!.daily && <RunSummary run={run!} payout={payout.result!} restart={() => beginRun(pieceSet)} onChangeSet={() => navigate({ page: 'regular' })} />}
        {levelWarnings.length > 0 && <details className="catalog-warnings"><summary>{levelWarnings.length} floor file(s) could not be loaded</summary><ul>{levelWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        </div>
        {profileSaveMessage && <p className="profile-save-toast" role="status">{profileSaveMessage}</p>}
    </main>;
}
