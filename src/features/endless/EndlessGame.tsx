import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { Coins, Flame, RotateCw, Trophy } from 'lucide-react';
import { MoveOptions, OPTION_COLORS, CONFIRM_COLOR } from '../../components/MoveOptions';
import { orderMovesLeftToRight } from '../../game/moveOptionOrder';
import { BOARD_APPEARANCE } from '../../components/boardAppearance';
import { usePointerBoard } from '../../game/usePointerBoard';
import { RunBoardFrame, RunGate, RunHearts, RunScenery, RunScorePlaque, TERRAIN_BOARD_APPEARANCE } from '../../components/RunEnvironment';
import { RunItems } from '../../components/RunItems';
import { PIECE_RENDERERS } from '../../components/pieces/pieceRenderers';
import { BoardNotification } from '../../components/BoardNotification';
import { MoveFeedback, MoveGrade } from '../../components/MoveFeedback';
import { endlessMoveXp } from '../../game/playerLeveling';
import { ShareRunButton } from '../../components/ShareRunButton';
import { shareEndlessRun, type ShareRunHandler } from '../../game/shareRun';
import type { PageLocation } from '../../game/usePageNavigation';
import { createChess } from './chess';
import { canUseItem, coinReward } from './session';
import type { EndlessController } from './useEndlessSession';

const PIECE_NAMES: Record<string, string> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
const completeNotice = () => undefined;

export function EndlessGame({ controller, active, navigate, onShare }: {
    controller: EndlessController; active: boolean; navigate: (location: PageLocation) => void;
    onShare?: ShareRunHandler;
}) {
    const { session, error } = controller;
    const [pending, setPending] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [destination, setDestination] = useState<string | null>(null);
    const [orientation, setOrientation] = useState<'white' | 'black'>('white');
    // Keep move colors tied to the starting perspective when the board is flipped.
    const options = useMemo(() => orderMovesLeftToRight(session?.options ?? [], option => option.uci, 'white'), [session?.options]);
    const group = useRef<HTMLDivElement>(null);
    const pointerBoard = usePointerBoard();
    const resultTitle = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        setPending(null); setPreview(null); setSource(null); setDestination(null);
    }, [session?.id, session?.phase, session?.pgn, active]);
    useEffect(() => { if (session?.phase === 'finished') resultTitle.current?.focus(); }, [session?.phase]);
    const commit = useCallback((uci: string) => {
        if (!active) return;
        controller.play(uci);
    }, [active, controller.play]);
    const ready = active && session?.phase === 'ready';
    const sourceOptions = source ? session?.options.filter(option => option.from === source && (!destination || option.to === destination)) : [];
    const preferred = pending ?? (sourceOptions?.length === 1 ? sourceOptions[0]!.uci : null);
    useEffect(() => { controller.prioritize(ready ? preferred : null); }, [controller.prioritize, ready, preferred]);
    const select = (uci: string) => {
        if (!ready) return;
        if (pending === uci) commit(uci);
        else { setPending(uci); setSource(null); setDestination(null); setPreview(null); }
    };
    useEffect(() => {
        if (!ready) return;
        const handle = (event: KeyboardEvent) => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('dialog,input,textarea,select,[contenteditable="true"]')) return;
            if (event.key === 'Escape') { setPending(null); setSource(null); setDestination(null); setPreview(null); return; }
            if (target?.closest('button,a') && !group.current?.contains(target)) return;
            const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
            const activate = event.key === 'Enter' || event.key === ' ';
            if (!direction && !activate) return;
            event.preventDefault();
            if (activate && event.repeat) return;
            const buttons = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
            if (!buttons.length) return;
            const current = buttons.findIndex(button => button === document.activeElement);
            const index = direction ? (current < 0 ? direction > 0 ? 0 : buttons.length - 1 : (current + direction + buttons.length) % buttons.length) : Math.max(0, current);
            if (direction) { setPending(null); setSource(null); setDestination(null); }
            buttons[index]!.focus();
            if (activate) select(options[index]!.uci);
        };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    });
    if (!session) return <section className="empty-state"><p>No Endless attempt in progress.</p>
        <button className="primary-small" onClick={() => navigate({ page: 'endless' })}>Start endless</button></section>;
    if (session.phase === 'finished') return <section className="summary result-page" aria-labelledby="endless-result-title">
        <h1 id="endless-result-title" ref={resultTitle} tabIndex={-1} data-page-focus>Endless over</h1>
        <span className="summary-score-label">{session.mode === 'hardcore' ? 'Hardcore streak' : 'Standard score'}</span>
        <strong className="summary-score">{session.score.toLocaleString()}</strong>
        <span className="coin-balance summary-coins" aria-label={`Earned ${coinReward(session)} coins`}><Coins size={17} aria-hidden="true" />+{coinReward(session)}</span>
        <span className="summary-xp" aria-label={`Earned ${endlessMoveXp(session.moves)} XP`}>+{endlessMoveXp(session.moves)} XP</span>
        <dl className="summary-stats">
            <div><dt>Longest streak</dt><dd>{session.longestStreak}</dd></div>
            <div><dt>Moves played</dt><dd>{session.moves}</dd></div>
        </dl>
        {session.lastMove && <p className="endless-final-move" role="status" aria-label="Move quality"><MoveGrade quality={session.lastMove.quality} /></p>}
        <div className="result-actions"><button className="primary-small" onClick={() => navigate({ page: 'endless' })}>Play again</button>
            <ShareRunButton result={shareEndlessRun(session)} onShare={onShare} /></div>
    </section>;

    const chess = createChess(session.pgn);
    const lastMove = chess.history({ verbose: true }).at(-1);
    const highlight = pending ?? preview ?? (session.phase === 'reveal' ? session.lastMove?.uci : null);
    const colorIndex = options.findIndex(option => option.uci === highlight);
    const color = pending ? CONFIRM_COLOR : OPTION_COLORS[Math.max(0, colorIndex)]!;
    const squareStyles: Record<string, CSSProperties> = {};
    if (lastMove) for (const square of [lastMove.from, lastMove.to]) squareStyles[square] = { backgroundColor: 'rgba(209,184,116,.4)' };
    if (highlight) for (const square of [highlight.slice(0, 2), highlight.slice(2, 4)]) squareStyles[square] = { boxShadow: `inset 0 0 0 5px ${color}` };
    if (source && ready) {
        squareStyles[source] = { boxShadow: `inset 0 0 0 5px ${CONFIRM_COLOR}` };
        options.forEach((option, index) => {
            if (option.from === source) squareStyles[option.to] = { boxShadow: `inset 0 0 0 4px ${OPTION_COLORS[index]}` };
        });
    }
    const onSquareClick = (square: string) => {
        if (!ready) return;
        if (source) {
            const matches = session.options.filter(option => option.from === source && option.to === square);
            if (matches.length === 1) { commit(matches[0]!.uci); return; }
            if (matches.length > 1) { setDestination(square); return; }
            if (source === square) { setSource(null); setDestination(null); return; }
        }
        if (session.options.some(option => option.from === square)) {
            setSource(square); setDestination(null); setPending(null); setPreview(null);
        }
    };
    const boardOptions: ChessboardOptions = {
        ...BOARD_APPEARANCE,
        ...TERRAIN_BOARD_APPEARANCE,
        id: 'endless-board', position: chess.fen(), boardOrientation: orientation,
        pieces: PIECE_RENDERERS[session.set], squareStyles, onSquareClick: ({ square }) => onSquareClick(square),
        squareStyle: ready ? { cursor: 'pointer' } : undefined,
        arrows: ready ? options.map((option, index) => ({ startSquare: option.from, endSquare: option.to,
            color: pending === option.uci ? CONFIRM_COLOR : OPTION_COLORS[index]! })) : [],
    };
    const history = chess.history();
    return <section className="game-layout endless-game run-stage" aria-label={`${session.mode === 'hardcore' ? 'Hardcore' : 'Standard'} Endless game`} tabIndex={-1} data-page-focus>
        <RunScenery />
        <div className="board-column">
            <div className="endless-gate">
                <RunGate heading="Endless" subtitle={`${session.mode === 'hardcore' ? 'Hardcore' : 'Standard'} · Game ${session.gamesCompleted + 1}`} />
                <div className="endless-game-controls">
                    <button className="text-button" aria-label="Flip board" onClick={() => setOrientation(value => value === 'white' ? 'black' : 'white')}><RotateCw size={16} aria-hidden="true" /></button></div>
            </div>
            <div className="board-wrap" ref={pointerBoard}><RunBoardFrame /><Chessboard options={boardOptions} />
                {session.phase === 'between-games' && <BoardNotification key={`${session.id}-${session.gamesCompleted}`} onComplete={completeNotice}
                    notice={{ id: `${session.id}-${session.gamesCompleted}`, visual: <Trophy />, label: session.boardResult?.startsWith('Checkmate') ? 'Checkmate' : 'Draw',
                        caption: `Game ${session.gamesCompleted + 1} starting`, announcement: `${session.boardResult}. Game ${session.gamesCompleted + 1} starting.`, durationMs: 1500 }} />}
            </div>
            <div className="endless-progress"><span>Move {session.moves + 1}</span></div>
        </div>
        <aside className="play-panel">
            <div className="run-details">
                <div className="run-stats" aria-label="Endless statistics"><div className="health-stats">
                    {session.mode === 'standard' && <RunHearts health={session.health} maxHealth={session.rules.startingHealth} />}
                    <span className="streak-count" aria-label={`Streak: ${session.streak}`}><Flame size={15} aria-hidden="true" /><strong>{session.streak}</strong></span>
                </div><span className="move-count" aria-label={`Score: ${session.score}`}><RunScorePlaque /><span>{session.mode === 'hardcore' ? 'Streak' : 'Score'}</span><strong>{session.score.toLocaleString()}</strong></span></div>
                {session.mode === 'standard' && <RunItems items={session.items} activeEffects={session.activeEffects} enabled={!!ready}
                    canUse={id => canUseItem(session, id)} onUse={id => { controller.use(id); setPending(null); setSource(null); setDestination(null); setPreview(null); }} />}
            </div>
        <div className="options-area">
            {ready && <MoveOptions immersive groupRef={group} pending={pending} onPreview={setPreview}
                onSelect={uci => destination && uci.slice(0, 2) === source && uci.slice(2, 4) === destination ? commit(uci) : select(uci)}
                options={options.map((option, index) => {
                    const choosingPromotion = !!option.promotion && source === option.from && destination === option.to;
                    const Piece = choosingPromotion ? PIECE_RENDERERS[session.set][`${chess.turn()}${option.promotion!.toUpperCase()}`] : undefined;
                    return { uci: option.uci, content: Piece && <Piece />,
                        label: choosingPromotion ? `Promote to ${PIECE_NAMES[option.promotion!]}: ${option.san}.`
                            : pending === option.uci ? `Confirm ${option.san}. Tap again to play this move.`
                                : `Option ${index + 1}: ${option.san}, ${option.description}. Tap twice to play.` };
                })} />}
            {session.phase === 'analyzing' && !error && <div className="endless-thinking" role="status">Finding your moves…</div>}
            {session.phase === 'analyzing' && error && <div className="endless-engine-error" role="alert"><strong>Engine unavailable</strong><p>{error}</p>
                <button className="primary-small" onClick={controller.retry}>Retry analysis</button></div>}
            {session.phase === 'reveal' && session.lastMove && <MoveFeedback quality={session.lastMove.quality} />}
            {session.phase === 'between-games' && <div className="endless-thinking" role="status">Starting game {session.gamesCompleted + 1}…</div>}
        </div><section className="history-section"><div className="section-title">Move history</div><div className="history-list" tabIndex={0} aria-label="Move history">
            {history.filter((_, index) => index % 2 === 0).map((move, index) => <div className="history-row" key={index}><span>{index + 1}.</span><strong>{move}</strong><strong>{history[index * 2 + 1]}</strong></div>)}
        </div></section></aside>
        {!controller.persisted && <p className="endless-storage-message" role="status">Your attempt is available in this tab. Saving is unavailable.</p>}
    </section>;
}
