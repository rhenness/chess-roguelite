import { useCallback, useState, type CSSProperties } from 'react';
import type { Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { Coins, Sparkles } from 'lucide-react';
import { BoardNotification, type BoardNotice } from './BoardNotification';
import { applyPaidUpgrades, squareUpgradePrice } from '../game/economy';
import { formatMultiplier, type MultiplierBoard, type SquareUpgrade } from '../game/multipliers';
import { PIECE_SETS, type PieceSetId } from '../game/pieceSets';
import type { UserProgression } from '../game/progression';

const EMPTY_POSITION = {};
let nextPurchaseNotice = 0;

export function MultiplierUpgrades({ set, profile, baseBoard, onBuy }: {
    set: PieceSetId;
    profile: UserProgression;
    baseBoard: MultiplierBoard;
    onBuy: (set: PieceSetId, square: Square, baseBoard: MultiplierBoard) => SquareUpgrade | null;
}) {
    const [selected, setSelected] = useState<Square | null>(null);
    const [notice, setNotice] = useState<BoardNotice | null>(null);
    const dismissNotice = useCallback(() => setNotice(null), []);
    const board = applyPaidUpgrades(baseBoard, profile.paidUpgrades[set]);
    const price = selected ? squareUpgradePrice(profile.paidUpgrades[set], selected) : null;
    const affordable = selected !== null && price !== null && profile.coins >= price
        && board[selected] < Number.MAX_SAFE_INTEGER;

    function buy() {
        if (!selected || !affordable) return;
        const upgrade = onBuy(set, selected, baseBoard);
        if (!upgrade) return;
        setNotice({
            id: `purchase-${++nextPurchaseNotice}`, visual: <Sparkles />, label: '+0.1x',
            caption: upgrade.square.toUpperCase(),
            announcement: `${upgrade.square} upgraded to ${formatMultiplier(upgrade.after)}`,
            tone: 'reward', durationMs: 1100,
        });
    }

    const options: ChessboardOptions = {
        id: `upgrades-${set}`, position: EMPTY_POSITION, boardOrientation: 'white',
        allowDragging: false, allowDrawingArrows: false, showAnimations: false, showNotation: true,
        darkSquareStyle: { backgroundColor: '#41665b' }, lightSquareStyle: { backgroundColor: '#e9e3d4' },
        boardStyle: { borderRadius: '6px' },
        // The board handles touch taps itself and suppresses the synthetic click.
        onSquareClick: ({ square }) => setSelected(square as Square),
        squareRenderer: ({ square }) => {
            const coordinate = square as Square;
            const multiplier = board[coordinate];
            return <button className={`upgrade-square${selected === coordinate ? ' selected' : ''}${multiplier > 10 ? ' boosted' : ''}`}
                style={{ '--multiplier-strength': Math.min(.8, (multiplier - 10) * .08) } as CSSProperties}
                aria-label={`${square}: ${formatMultiplier(multiplier)}`} aria-pressed={selected === coordinate}
                data-modal-focus={square === 'a8' ? true : undefined} onClick={event => {
                    event.stopPropagation();
                    setSelected(coordinate);
                }}>
                <span>{formatMultiplier(multiplier)}</span>
            </button>;
        },
    };

    return <>
        <div className="upgrade-heading">
            <h2 id="multiplier-upgrade-title">{PIECE_SETS[set].name}</h2>
            <span className="coin-balance" role="status" aria-label={`Coins: ${profile.coins}`}>
                <Coins size={17} aria-hidden="true" /><strong>{profile.coins.toLocaleString()}</strong>
            </span>
        </div>
        <div className="upgrade-content">
            <div className="board-wrap upgrade-board" role="group" aria-label={`${PIECE_SETS[set].name} multipliers`}>
                <Chessboard options={options} />
                {notice && <BoardNotification key={notice.id} notice={notice} onComplete={dismissNotice} />}
            </div>
            <div className="upgrade-checkout">
                <div className="upgrade-change" aria-live="polite" aria-atomic="true">
                    {selected && <><span className="upgrade-coordinate">{selected.toUpperCase()}</span>
                        <strong>{formatMultiplier(board[selected])} → {formatMultiplier(board[selected] + 1)}</strong></>}
                </div>
                <button className="primary-small upgrade-buy" disabled={!affordable} onClick={buy}
                    aria-label={selected ? `Upgrade ${selected} for ${price} coins${!affordable ? ' (unavailable)' : ''}` : 'Select a square to upgrade'}>
                    <Coins size={17} aria-hidden="true" /><span>{price?.toLocaleString() ?? '—'}</span>
                </button>
            </div>
        </div>
    </>;
}
