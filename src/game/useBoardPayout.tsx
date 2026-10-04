import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';
import type { BoardNotice } from '../components/BoardNotification';
import { RUN_LEVEL_COUNT, type RunState } from './run';
import type { PieceSetId } from './pieceSets';
import { applyPaidUpgrades, type PaidUpgradeCounts } from './economy';
import {
    applyPayoutUpgrade, createPayout, formatMultiplier, loadMultiplierProfile, migrateMultiplierProfile, PAYOUT_NOTICE_DURATION,
    payoutHopDelay, payoutPath, saveMultiplierProfile, type MultiplierBoard, type MultiplierProfile, type PayoutResult,
} from './multipliers';

export interface PayoutPreviewOptions {
    score?: number;
    completed?: boolean;
}
interface PayoutSequence {
    setId: PieceSetId;
    outcome: PayoutResult;
    board: MultiplierBoard;
    path: ReturnType<typeof payoutPath>;
    step: number;
    phase: 'spinning' | 'landed' | 'upgrading' | 'done';
    preview: boolean;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const EMPTY_PAID_UPGRADES: PaidUpgradeCounts = {};

function makeSequence(setId: PieceSetId, board: MultiplierBoard, score: number, completed: boolean, preview: boolean): PayoutSequence {
    const outcome = createPayout(board, score, completed);
    const reducedMotion = prefersReducedMotion();
    return {
        setId, outcome, board: { ...board }, path: reducedMotion ? [outcome.square] : payoutPath(outcome.square),
        step: 0, phase: reducedMotion ? 'landed' : 'spinning', preview,
    };
}

/** The payout presentation has its own lifecycle; gameplay totals stay unchanged. */
export function useBoardPayout(run: RunState | null, waitingForNotice: boolean, setId: PieceSetId = 'default', paused = false,
    paidUpgrades: PaidUpgradeCounts = EMPTY_PAID_UPGRADES) {
    // Cache each set so upgrades also survive switching when browser storage is unavailable.
    const profiles = useRef<Partial<Record<PieceSetId, MultiplierProfile>>>({});
    const [profile, setProfile] = useState(() => {
        const initial = loadMultiplierProfile(setId);
        profiles.current[setId] = initial;
        return initial;
    });
    const [result, setResult] = useState<PayoutResult | null>(null);
    const [sequence, setSequence] = useState<PayoutSequence | null>(null);
    const started = useRef(false);
    const committedUpgrade = useRef<string | null>(null);
    const finishedBoard = useRef<{ id: string; board: MultiplierBoard } | null>(null);
    const effectiveBoard = useMemo(() => applyPaidUpgrades(profile.board, paidUpgrades[setId]), [profile, paidUpgrades, setId]);

    useEffect(() => {
        // Purchases made while the payout is paused only affect later runs.
        if (run?.phase === 'finished' && finishedBoard.current?.id !== run.id) {
            finishedBoard.current = { id: run.id, board: effectiveBoard };
        }
    }, [run, effectiveBoard]);

    useEffect(() => {
        if (paused || run?.phase !== 'finished' || waitingForNotice || sequence || started.current) return;
        started.current = true;
        const completed = run.result === 'complete' && run.levelsCompleted === RUN_LEVEL_COUNT;
        setSequence(makeSequence(setId, finishedBoard.current!.board, run.score, completed, false));
    }, [run, waitingForNotice, sequence, effectiveBoard, setId, paused]);

    useEffect(() => {
        if (!sequence || sequence.preview || !sequence.outcome.upgrade || committedUpgrade.current === sequence.outcome.id) return;
        // Save the earned upgrade once, even if New run skips the remaining animation.
        // The sequence's board snapshot keeps this payout on the old multipliers.
        committedUpgrade.current = sequence.outcome.id;
        const upgraded = applyPayoutUpgrade(profiles.current[sequence.setId]!, sequence.outcome);
        profiles.current[sequence.setId] = upgraded;
        saveMultiplierProfile(upgraded, sequence.setId);
        setProfile(upgraded);
    }, [sequence, profile]);

    useEffect(() => {
        if (paused || sequence?.phase !== 'spinning') return;
        if (prefersReducedMotion()) {
            setSequence({ ...sequence, step: sequence.path.length - 1, phase: 'landed' });
            return;
        }
        const timer = window.setTimeout(() => {
            setSequence(current => {
                if (!current || current.outcome.id !== sequence.outcome.id) return current;
                return current.step === current.path.length - 1 ? { ...current, phase: 'landed' }
                    : { ...current, step: current.step + 1 };
            });
        }, payoutHopDelay(sequence.step));
        return () => window.clearTimeout(timer);
    }, [sequence, paused]);

    useEffect(() => {
        if (paused || sequence?.phase !== 'done') return;
        if (!sequence.preview) setResult(sequence.outcome);
        setSequence(null);
    }, [sequence, paused]);

    const advanceNotice = useCallback(() => {
        setSequence(current => {
            if (!current || current.phase === 'spinning' || current.phase === 'done') return current;
            return { ...current, phase: current.phase === 'landed' && current.outcome.upgrade ? 'upgrading' : 'done' };
        });
    }, []);

    const profileFor = useCallback((set: PieceSetId) => {
        const cached = profiles.current[set];
        const nextProfile = cached ? migrateMultiplierProfile(cached, set) : loadMultiplierProfile(set);
        profiles.current[set] = nextProfile;
        return nextProfile;
    }, []);

    const reset = useCallback((nextSet: PieceSetId = 'default') => {
        started.current = false;
        committedUpgrade.current = null;
        finishedBoard.current = null;
        setSequence(null);
        setResult(null);
        setProfile(profileFor(nextSet));
    }, [profileFor]);

    const preview = useCallback((options: PayoutPreviewOptions = {}) => {
        if (sequence || paused) return;
        setSequence(makeSequence(setId, effectiveBoard, options.score ?? 1200, options.completed ?? true, true));
    }, [sequence, effectiveBoard, setId, paused]);

    const notice = useMemo<BoardNotice | null>(() => {
        if (!sequence || sequence.phase === 'spinning' || sequence.phase === 'done') return null;
        const { outcome } = sequence;
        const upgrade = sequence.phase === 'upgrading' ? outcome.upgrade : null;
        return {
            id: `${outcome.id}-${sequence.phase}`,
            visual: upgrade ? <Sparkles /> : <Trophy />,
            label: upgrade ? `${formatMultiplier(upgrade.before)} → ${formatMultiplier(upgrade.after)}` : formatMultiplier(outcome.multiplier),
            caption: upgrade ? upgrade.square.toUpperCase() : `${outcome.baseScore.toLocaleString()} → ${outcome.finalScore.toLocaleString()}`,
            announcement: upgrade ? `${upgrade.square}: multiplier upgraded from ${formatMultiplier(upgrade.before)} to ${formatMultiplier(upgrade.after)}`
                : `${outcome.square}: ${formatMultiplier(outcome.multiplier)}. Final score ${outcome.finalScore}`,
            tone: 'reward', durationMs: PAYOUT_NOTICE_DURATION,
        };
    }, [sequence]);

    const upgrade = sequence?.phase === 'upgrading' || sequence?.phase === 'done' ? sequence.outcome.upgrade : null;
    const board = sequence ? (upgrade ? { ...sequence.board, [upgrade.square]: upgrade.after } : sequence.board) : effectiveBoard;
    const highlightedSquare = sequence ? (upgrade?.square ?? sequence.path[sequence.step]!) : result?.square;
    return { result, sequence, board, highlightedSquare, notice, advanceNotice, reset, preview, profileFor };
}
