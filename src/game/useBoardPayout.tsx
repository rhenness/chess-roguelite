import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';
import type { BoardNotice } from '../components/BoardNotification';
import { RUN_LEVEL_COUNT, type RunState } from './run';
import {
    applyPayoutUpgrade, createPayout, formatMultiplier, loadMultiplierProfile, PAYOUT_NOTICE_DURATION,
    payoutHopDelay, payoutPath, saveMultiplierProfile, type MultiplierBoard, type PayoutResult,
} from './multipliers';

export interface PayoutPreviewOptions {
    score?: number;
    completed?: boolean;
}
interface PayoutSequence {
    outcome: PayoutResult;
    board: MultiplierBoard;
    path: ReturnType<typeof payoutPath>;
    step: number;
    phase: 'spinning' | 'landed' | 'upgrading' | 'done';
    preview: boolean;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function makeSequence(board: MultiplierBoard, score: number, completed: boolean, preview: boolean): PayoutSequence {
    const outcome = createPayout(board, score, completed);
    const reducedMotion = prefersReducedMotion();
    return {
        outcome, board: { ...board }, path: reducedMotion ? [outcome.square] : payoutPath(outcome.square),
        step: 0, phase: reducedMotion ? 'landed' : 'spinning', preview,
    };
}

/** The payout presentation has its own lifecycle; gameplay totals stay unchanged. */
export function useBoardPayout(run: RunState | null, waitingForNotice: boolean) {
    const [profile, setProfile] = useState(loadMultiplierProfile);
    const [result, setResult] = useState<PayoutResult | null>(null);
    const [sequence, setSequence] = useState<PayoutSequence | null>(null);
    const started = useRef(false);
    const committedUpgrade = useRef<string | null>(null);

    useEffect(() => {
        if (run?.phase !== 'finished' || waitingForNotice || sequence || started.current) return;
        started.current = true;
        const completed = run.result === 'complete' && run.levelsCompleted === RUN_LEVEL_COUNT;
        setSequence(makeSequence(profile.board, run.score, completed, false));
    }, [run, waitingForNotice, sequence, profile]);

    useEffect(() => {
        if (!sequence || sequence.preview || !sequence.outcome.upgrade || committedUpgrade.current === sequence.outcome.id) return;
        // Save the earned upgrade once, even if New run skips the remaining animation.
        // The sequence's board snapshot keeps this payout on the old multipliers.
        committedUpgrade.current = sequence.outcome.id;
        const upgraded = applyPayoutUpgrade(profile, sequence.outcome);
        saveMultiplierProfile(upgraded);
        setProfile(upgraded);
    }, [sequence, profile]);

    useEffect(() => {
        if (sequence?.phase !== 'spinning') return;
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
    }, [sequence]);

    useEffect(() => {
        if (sequence?.phase !== 'done') return;
        if (!sequence.preview) setResult(sequence.outcome);
        setSequence(null);
    }, [sequence]);

    const advanceNotice = useCallback(() => {
        setSequence(current => {
            if (!current || current.phase === 'spinning' || current.phase === 'done') return current;
            return { ...current, phase: current.phase === 'landed' && current.outcome.upgrade ? 'upgrading' : 'done' };
        });
    }, []);

    const reset = useCallback(() => {
        started.current = false;
        committedUpgrade.current = null;
        setSequence(null);
        setResult(null);
    }, []);

    const preview = useCallback((options: PayoutPreviewOptions = {}) => {
        if (sequence) return;
        setSequence(makeSequence(profile.board, options.score ?? 1200, options.completed ?? true, true));
    }, [sequence, profile]);

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
    const board = sequence ? (upgrade ? { ...sequence.board, [upgrade.square]: upgrade.after } : sequence.board) : profile.board;
    const highlightedSquare = sequence ? (upgrade?.square ?? sequence.path[sequence.step]!) : result?.square;
    return { result, sequence, board, highlightedSquare, notice, advanceNotice, reset, preview };
}
