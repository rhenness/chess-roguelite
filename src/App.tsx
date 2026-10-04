import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { Check, Flame, Heart, RotateCw, Sparkles, X } from 'lucide-react';
import type { GeneratedLevel, PlayerChoice } from './types/level';
import { selectLevels } from './game/levels';
import { BoardNotification, type BoardNotice } from './components/BoardNotification';
import { createDeathNotice, createHealthNotice, installNotificationConsole } from './components/notificationConsole';
import { BOARD_SQUARES, formatMultiplier, type PayoutResult } from './game/multipliers';
import { useBoardPayout } from './game/useBoardPayout';
import {
    advancePlayback, BEST_MOVE_STREAK_LENGTH, boardFen, chooseMove, DEFAULT_RULES, nextLevel,
    QUALITY_LABELS, QUALITY_ORDER, shuffleChoices, startRun,
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

function Modal({ children, titleId, className, onClose, returnFocus }: {
    children: ReactNode;
    titleId: string;
    className: string;
    onClose: () => void;
    returnFocus: RefObject<HTMLButtonElement | null>;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current!;
        const previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        element.showModal();
        element.querySelector<HTMLButtonElement>('[data-modal-focus]')?.focus();
        return () => {
            element.close();
            document.documentElement.style.overflow = previousOverflow;
            returnFocus.current?.focus();
        };
    }, [returnFocus]);
    return <dialog ref={dialog} className={`modal ${className}`} aria-labelledby={titleId} aria-modal="true"
        onCancel={event => { event.preventDefault(); onClose(); }}
        onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }}>
        <button className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={18} aria-hidden="true" /></button>
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

function RunSummary({ run, payout, restart, onClose, returnFocus }: {
    run: RunState;
    payout: PayoutResult;
    restart: () => void;
    onClose: () => void;
    returnFocus: RefObject<HTMLButtonElement | null>;
}) {
    return <Modal className="summary" titleId="result-title" onClose={onClose} returnFocus={returnFocus}>
        <h2 id="result-title">{run.result === 'complete' ? 'Run complete' : 'Run over'}</h2>
        <span className="summary-score-label">Total score</span>
        <strong className="summary-score">{payout.finalScore.toLocaleString()}</strong>
        <p className="summary-calculation">{payout.baseScore.toLocaleString()} {formatMultiplier(payout.multiplier)}</p>
        <dl className="summary-stats">
            <div><dt>Levels completed</dt><dd>{run.levelsCompleted} / {run.levels.length}</dd></div>
            <div><dt>Total decisions</dt><dd>{run.decisionsMade}</dd></div>
        </dl>
        <div className="quality-counts" aria-label="Move counts">
            {QUALITY_ORDER.map(quality => <div key={quality}><strong>{run.moveCounts[quality]}</strong><span>{QUALITY_LABELS[quality]}</span></div>)}
        </div>
        <button className="primary-small" data-modal-focus autoFocus onClick={restart}>Start new run</button>
    </Modal>;
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
    const [run, setRun] = useState<RunState | null>(() => pool.length ? startRun(pool, rules) : null);
    const [preview, setPreview] = useState<string | null>(null);
    const [pendingChoice, setPendingChoice] = useState<string | null>(null);
    const [flipped, setFlipped] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [resultDismissed, setResultDismissed] = useState(false);
    const [boardNotice, setBoardNotice] = useState<BoardNotice | null>(null);
    const dismissBoardNotice = useCallback(() => setBoardNotice(null), []);
    const payout = useBoardPayout(run, boardNotice !== null);
    const scoreButton = useRef<HTMLButtonElement>(null);
    const helpButton = useRef<HTMLButtonElement>(null);
    const level = run ? run.levels[run.levelIndex] : pool[0];
    const node = run?.node;
    const choices = useMemo(() => node?.kind === 'decision' ? shuffleChoices(node.choices) : [], [node]);
    const fen = run ? boardFen(run) : level?.root.fen;
    const playing = run?.phase === 'decision' && !payout.sequence;
    const activeRules = run?.rules ?? rules;
    const orientation = (flipped ? (level?.playerColor === 'black' ? 'white' : 'black') : level?.playerColor) ?? 'white';
    const rows = historyRows(run, level);
    const currentOutcome = run?.outcomes.find(outcome => outcome.id === level?.id);
    const showingResult = run?.phase === 'finished' && !!payout.result && !payout.sequence && !resultDismissed && !boardNotice;
    const showBonusBoard = !!payout.sequence || (run?.phase === 'finished' && !!payout.result);
    const displayScore = payout.result?.finalScore ?? run?.score ?? 0;
    const visibleNotice = payout.notice ?? boardNotice;

    useEffect(() => installNotificationConsole(setBoardNotice, dismissBoardNotice, payout.preview), [dismissBoardNotice, payout.preview]);

    useEffect(() => {
        if (payout.sequence?.preview || (run?.phase !== 'reveal' && run?.phase !== 'reply')) return;
        const timer = window.setTimeout(() => {
            setRun(current => current ? advancePlayback(current) : current);
        }, run.phase === 'reveal' ? 1400 : 1000);
        return () => window.clearTimeout(timer);
    }, [run, payout.sequence?.preview]);

    function beginRun() {
        if (!pool.length) return;
        setPreview(null);
        setPendingChoice(null);
        setFlipped(false);
        setShowRules(false);
        setResultDismissed(false);
        setBoardNotice(null);
        payout.reset();
        setRun(startRun(pool, rules));
    }

    function selectMove(uci: string) {
        if (!playing) return;
        if (pendingChoice !== uci) {
            setPendingChoice(uci);
            return;
        }
        setPreview(null);
        setPendingChoice(null);
        const updated = chooseMove(run!, uci);
        setRun(updated);
        if (updated !== run && updated.lastChoice) {
            const healthChange = updated.lastHealthBonus - updated.rules.damage[updated.lastChoice.quality];
            if (updated.result === 'defeat') setBoardNotice(createDeathNotice());
            else if (healthChange !== 0) setBoardNotice(createHealthNotice(healthChange));
        }
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
    const boardOptions: ChessboardOptions = {
        id: 'knightfall-board', position: showBonusBoard ? EMPTY_BOARD_POSITION : fen, boardOrientation: orientation,
        showAnimations: !showBonusBoard,
        allowDragging: false, allowDrawingArrows: false, showNotation: true, animationDurationInMs: 220,
        darkSquareStyle: { backgroundColor: '#41665b' }, lightSquareStyle: { backgroundColor: '#e9e3d4' },
        boardStyle: { borderRadius: '6px', boxShadow: '0 22px 55px rgba(4, 12, 10, .28)' },
        squareStyles,
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

    return <main className="app-shell">
        <header className="topbar">
            <a className="brand" href="#game" aria-label="Knightfall home"><img src="/knight.svg" alt="" width="34" height="38" /><strong>Knightfall</strong></a>
            <div className="top-actions">
                <button ref={helpButton} disabled={!!payout.sequence} className="text-button help-button" aria-label="How to play" aria-expanded={showRules} aria-controls="game-rules" onClick={() => setShowRules(value => !value)}>?</button>
                <button className="text-button" onClick={() => setFlipped(value => !value)}><RotateCw size={14} aria-hidden="true" /><span>Flip board</span></button>
                <button className="primary-small" disabled={!pool.length} onClick={beginRun}>New run</button>
            </div>
        </header>
        {showRules && !showingResult && !payout.sequence && <Modal className="rules-panel" titleId="game-rules" onClose={() => setShowRules(false)} returnFocus={helpButton}>
            <h2 id="game-rules">How to play</h2>
            <p>Match a colored square to its arrow. Tap once to select, again to play.</p>
            <p>Start with {activeRules.startingHealth} health. Health and score carry across levels.</p>
            <p>{BEST_MOVE_STREAK_LENGTH} Best in a row: +1 HP.</p>
            <p>Every run ends with a square multiplier. Complete all 10 levels to permanently upgrade one square.</p>
            <ul>{QUALITY_ORDER.map(quality => <li key={quality}><strong>{QUALITY_LABELS[quality]}</strong><span>+{activeRules.points[quality]} points / {activeRules.damage[quality]} health lost</span></li>)}</ul>
            <button className="primary-small" data-modal-focus autoFocus onClick={() => setShowRules(false)}>Got it</button>
        </Modal>}
        <section id="game" className="game-layout">
            <div className="board-column">
                <div className="board-wrap">
                    {fen && level ? <Chessboard options={boardOptions} /> : <div className="empty-board">No playable levels</div>}
                    {visibleNotice && <BoardNotification key={visibleNotice.id} notice={visibleNotice}
                        onComplete={payout.notice ? payout.advanceNotice : dismissBoardNotice} />}
                </div>
                {run && <div className="level-progress" role="progressbar" aria-label="Run progress"
                    aria-valuemin={1} aria-valuemax={run.levels.length} aria-valuenow={run.levelIndex + 1}
                    aria-valuetext={`Level ${run.levelIndex + 1} of ${run.levels.length}`}>
                    {run.levels.map((item, index) => <span key={item.id} aria-hidden="true"
                        className={index < run.levelIndex ? 'past' : index === run.levelIndex ? 'current' : 'future'} />)}
                </div>}
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
                    {!run && <div className="empty-state" role="status">No scored, playable levels.</div>}
                    {playing && <div className="move-picker"><div className="move-options" role="group" aria-label="Available moves">
                        {choices.map((choice, index) => {
                            const pending = pendingChoice === choice.playerMove.uci;
                            return <button className={`move-option${pending ? ' pending' : ''}`} key={choice.playerMove.uci}
                                onClick={() => selectMove(choice.playerMove.uci)}
                                onMouseEnter={() => setPreview(choice.playerMove.uci)} onMouseLeave={() => setPreview(null)}
                                onFocus={() => setPreview(choice.playerMove.uci)} onBlur={() => setPreview(null)}
                                aria-pressed={pending}
                                aria-label={pending ? `Confirm ${choice.playerMove.san}. Tap again to play this move.` : `Option ${index + 1}: ${choice.playerMove.san}, ${moveDescription(choice, run!.node.fen)}. Tap twice to play.`}
                                style={{ '--option-color': OPTION_COLORS[index] } as CSSProperties}>
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
                    {!payout.sequence && run?.phase === 'level-ended' && <div className="finished-card"><h2>{currentOutcome?.status === 'completed' ? 'Level completed' : 'Level lost'}</h2><button className="primary-small" onClick={() => { setPreview(null); setPendingChoice(null); setRun(current => current ? nextLevel(current) : current); }}>Next level</button></div>}
                    {!payout.sequence && run?.phase === 'finished' && <div className="finished-card"><button ref={scoreButton} disabled={!payout.result} className="primary-small" onClick={() => setResultDismissed(false)}>View score</button></div>}
                </div>
                <section className="history-section">
                    <div className="section-title">Move history</div>
                    <div className="history-list" tabIndex={0} aria-label="Move history">
                        {rows.map(row => <div className="history-row" key={row.number}><span>{row.number}.</span><strong>{row.white}</strong><strong>{row.black}</strong></div>)}
                    </div>
                </section>
            </aside>
        </section>
        {showingResult && <RunSummary run={run!} payout={payout.result!} restart={beginRun} onClose={() => { setResultDismissed(true); setShowRules(false); }} returnFocus={scoreButton} />}
        {levelWarnings.length > 0 && <details className="catalog-warnings"><summary>{levelWarnings.length} level file(s) could not be loaded</summary><ul>{levelWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    </main>;
}
