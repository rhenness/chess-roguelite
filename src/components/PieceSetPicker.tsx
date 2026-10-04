import { PIECE_SET_IDS, PIECE_SETS, type PieceSetId } from '../game/pieceSets';
import { formatMultiplier } from '../game/multipliers';
import { PIECE_RENDERERS } from './pieces/pieceRenderers';
import { Coins, Lock, Sparkles } from 'lucide-react';
import { isPieceSetUnlocked, type UserProgression } from '../game/progression';

const PREVIEW_PIECES = [
    'wK',
    'wQ',
    'wN',
    'bK',
    'bQ',
    'bN',
    'wR',
    'wB',
    'wP',
    'bR',
    'bB',
    'bP',
];

export function PieceSetPicker({
    onSelect,
    onUpgrade,
    progression,
    title = 'Choose your set',
    selectionOnly = false,
    selectedSet,
    hideSets = false,
    showHeading = true,
    defaultStartingHealth = PIECE_SETS.default.startingHealth,
}: {
    onSelect: (set: PieceSetId) => void;
    onUpgrade: (set: PieceSetId, button: HTMLButtonElement) => void;
    progression: UserProgression;
    title?: string;
    selectionOnly?: boolean;
    selectedSet?: PieceSetId;
    hideSets?: boolean;
    showHeading?: boolean;
    defaultStartingHealth?: number;
}) {
    return (
        <>
            {showHeading && <div className="piece-set-heading">
                <h2 id="piece-set-title">{title}</h2>
                <div className="piece-set-heading-actions"><span className="coin-balance" aria-label={`Coins: ${progression.coins}`}>
                    <Coins size={17} aria-hidden="true" /><strong>{progression.coins.toLocaleString()}</strong>
                </span></div>
            </div>}
            {!hideSets && <div className="piece-set-options">
                {PIECE_SET_IDS.map((id, index) => {
                    const pieces = PIECE_RENDERERS[id];
                    const set = PIECE_SETS[id];
                    const locked = !isPieceSetUnlocked(id, progression);
                    const lockId = `piece-set-${id}-lock`;
                    const health =
                        id === 'default'
                            ? defaultStartingHealth
                            : set.startingHealth;
                    const benefitsId = `piece-set-${id}-benefits`;
                    const bonus = set.initialBonusSquares
                        ? `Limited ${formatMultiplier(set.initialMultiplier)} multis`
                        : `${formatMultiplier(set.initialMultiplier)} multis`;
                    return (
                        <div key={id} className={`piece-set-option piece-set-option-${id}`}>
                        <button
                            className={`piece-set-card piece-set-${id}${locked ? ' locked' : ''}`}
                            aria-label={PIECE_SETS[id].name}
                            aria-pressed={selectionOnly ? selectedSet === id : undefined}
                            aria-describedby={locked ? `${benefitsId} ${lockId}` : benefitsId}
                            disabled={locked}
                            data-modal-focus={index === 0 ? true : undefined}
                            onClick={() => { if (!locked) onSelect(id); }}>
                            <div
                                className="piece-set-preview"
                                aria-hidden="true">
                                {PREVIEW_PIECES.map((piece) => {
                                    const Piece = pieces[piece]!;
                                    return (
                                        <span key={piece}>
                                            <Piece />
                                        </span>
                                    );
                                })}
                            </div>
                            <span className="piece-set-info">
                                <span className="piece-set-name">
                                    {set.name}
                                    {locked && <span id={lockId} className="piece-set-lock"
                                        aria-label={`Locked: ${progression.finishedRuns} of ${set.unlockAfterRuns} runs finished`}>
                                        <Lock size={12} aria-hidden="true" />
                                        <span aria-hidden="true">{progression.finishedRuns}/{set.unlockAfterRuns}</span>
                                    </span>}
                                </span>
                                <span
                                    id={benefitsId}
                                    className="piece-set-benefits">
                                    {health} hearts · {bonus}
                                </span>
                            </span>
                        </button>
                        {!locked && <button className="piece-set-upgrade" aria-label={`Upgrade ${set.name}`} title="Upgrade"
                            onClick={event => onUpgrade(id, event.currentTarget)}><Sparkles size={18} aria-hidden="true" /></button>}
                        </div>
                    );
                })}
            </div>}
        </>
    );
}
