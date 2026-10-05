import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Heart } from 'lucide-react';
import type { PlayTutorialStep } from '../game/playTutorial';
import { BEST_MOVE_STREAK_LENGTH, QUALITY_LABELS, RUN_LEVEL_COUNT, type RunState } from '../game/run';
import './PlayTutorial.css';

function HealthExample({ damage }: { damage: number }) {
    const [showDamage, setShowDamage] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setShowDamage(true),
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 700);
        return () => window.clearTimeout(timer);
    }, []);
    const remaining = Math.max(0, 3 - damage);
    return <div className="tutorial-health-example" role="img"
        aria-label={`Example only: an Inaccuracy changes three hearts to ${remaining}. Your run health stays unchanged.`}>
        <span aria-hidden="true">{[0, 1, 2].map(index => <Heart key={index} size={19}
            className={showDamage && index >= remaining ? 'lost' : ''} fill="currentColor" />)}</span>
        <small>Example only · Inaccuracy: −{damage} {damage === 1 ? 'heart' : 'hearts'}</small>
    </div>;
}

export function PlayTutorial({ step, run, selectedFrom, targetSquare, targetMove, pendingMove, onNext, onSkip }: {
    step: PlayTutorialStep; run: RunState; selectedFrom: string | undefined; pendingMove: boolean;
    targetSquare: string | undefined;
    targetMove: string | undefined;
    onNext: () => void; onSkip: () => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const tooltip = useRef<HTMLElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; side: string; arrowTop: number; arrowLeft: number;
        targetTop: number; targetLeft: number; targetWidth: number; targetHeight: number } | null>(null);
    const hasNext = ['welcome', 'feedback', 'health', 'healing', 'carryover', 'ready', 'item'].includes(step);
    useEffect(() => { if (hasNext && step !== 'item') heading.current?.focus({ preventScroll: true }); }, [step, hasNext]);
    useLayoutEffect(() => {
        const selectors: Record<PlayTutorialStep, string> = {
            welcome: '.board-wrap', piece: `.move-option[data-move="${targetMove}"]`,
            destination: pendingMove ? '.move-option.pending' : `[data-square="${targetSquare}"], [aria-label="Square ${targetSquare}"]`,
            feedback: '.reveal-card', health: '.health-count', healing: '.health-stats', carryover: '.level-progress',
            'waiting-checkpoint': '.level-progress', item: '.item-confirmation .item-confirm, .run-items', ready: '.active-effects, .health-count',
        };
        const findTarget = () => selectors[step].split(', ').map(selector => document.querySelector<HTMLElement>(`#game ${selector}`)).find(Boolean)
            ?? document.querySelector<HTMLElement>('#game .board-wrap');
        let target = findTarget();
        const bubble = tooltip.current;
        if (!target || !bubble) return;
        if (step !== 'welcome') target.classList.add('tutorial-target');
        let observer: ResizeObserver | null = null;
        const reposition = () => {
            const nextTarget = findTarget();
            if (nextTarget && nextTarget !== target) {
                if (target) { observer?.unobserve(target); target.classList.remove('tutorial-target'); }
                target = nextTarget;
                if (step !== 'welcome') target.classList.add('tutorial-target');
                observer?.observe(target);
            }
            if (!target) return;
            const box = target.getBoundingClientRect();
            // Keep the entire move row clear while pointing at the individual option.
            const moveRow = target.closest('.move-options');
            const placementBox = moveRow?.getBoundingClientRect() ?? box;
            const width = bubble.getBoundingClientRect().width;
            const height = bubble.getBoundingClientRect().height;
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const viewportHeight = window.innerHeight;
            const gap = 12;
            const clamp = (value: number, maximum: number) => Math.max(12, Math.min(value, Math.max(12, maximum)));
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            let side = 'bottom';
            let left = clamp(centerX - width / 2, viewportWidth - width - 12);
            let top = placementBox.bottom + gap;
            if (step === 'welcome') {
                side = 'center'; left = clamp(centerX - width / 2, viewportWidth - width - 12);
                top = clamp(centerY - height / 2, viewportHeight - height - 12);
            } else if (moveRow && placementBox.top - height - gap >= 12) {
                side = 'top'; top = placementBox.top - height - gap;
            } else if (moveRow && top + height <= viewportHeight - 12) {
                side = 'bottom';
            } else if (placementBox.right + gap + width <= viewportWidth - 12) {
                side = 'right'; left = placementBox.right + gap; top = clamp(centerY - height / 2, viewportHeight - height - 12);
            } else if (placementBox.left - gap - width >= 12) {
                side = 'left'; left = placementBox.left - gap - width; top = clamp(centerY - height / 2, viewportHeight - height - 12);
            } else if (top + height > viewportHeight - 12) {
                side = 'top'; top = placementBox.top - height - gap;
                if (top < 12) { side = 'floating'; top = clamp(viewportHeight - height - 12, viewportHeight - height - 12); }
            }
            if (box.bottom < 0 || box.top > viewportHeight) side = 'floating';
            top = clamp(top, viewportHeight - height - 12);
            const arrow = side === 'left' || side === 'right' ? clamp(centerY - top, height - 12) : clamp(centerX - left, width - 12);
            const arrowTop = side === 'left' || side === 'right' ? top + arrow - 5 : side === 'bottom' ? top - 5 : top + height - 5;
            const arrowLeft = side === 'right' ? left - 5 : side === 'left' ? left + width - 5 : left + arrow - 5;
            const inset = step === 'destination' && !pendingMove ? 1 : -4;
            const targetLeft = Math.max(2, box.left + inset);
            const targetTop = Math.max(2, box.top + inset);
            const next = { top: Math.round(top), left: Math.round(left), side,
                arrowTop: Math.round(arrowTop), arrowLeft: Math.round(arrowLeft), targetLeft, targetTop,
                targetWidth: Math.max(0, Math.min(viewportWidth - 2, box.right - inset) - targetLeft),
                targetHeight: Math.max(0, Math.min(viewportHeight - 2, box.bottom - inset) - targetTop) };
            setPosition(before => before && Object.keys(next).every(key => before[key as keyof typeof next] === next[key as keyof typeof next]) ? before : next);
        };
        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
        observer?.observe(target);
        observer?.observe(bubble);
        const mutations = new MutationObserver(reposition);
        const game = document.querySelector('#game');
        if (game) mutations.observe(game, { childList: true, subtree: true });
        return () => { mutations.disconnect(); target?.classList.remove('tutorial-target'); observer?.disconnect();
            window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
    }, [step, targetSquare, targetMove, pendingMove]);
    const quality = run.lastChoice?.quality;
    const points = run.lastMoveResolution?.awardedPoints ?? 0;
    const healthFeedback = [run.lastMoveResolution?.damageTaken ? `lost ${run.lastMoveResolution.damageTaken} ${run.lastMoveResolution.damageTaken === 1 ? 'heart' : 'hearts'}` : '',
        run.lastMoveResolution?.healthBonus ? `restored ${run.lastMoveResolution.healthBonus} ${run.lastMoveResolution.healthBonus === 1 ? 'heart' : 'hearts'}` : '']
        .filter(Boolean).join(' and ') || 'kept your hearts';
    const copy: Record<PlayTutorialStep, { title: string; text: string }> = {
        welcome: { title: 'Your first run', text: `Survive ${RUN_LEVEL_COUNT} rounds and build your score. Your hearts show how much health you have. The run ends when they reach zero.` },
        piece: { title: 'Choose a move', text: 'Tap the highlighted colored square to select a move, then tap it again to play. You can also use the board: tap a piece, then one of its colored destinations.' },
        destination: pendingMove ? { title: 'Confirm your move', text: 'Tap the selected colored option again to play it. Colors identify options; move quality is revealed afterward.' }
            : { title: 'Choose a destination', text: `Tap a colored destination${selectedFrom ? ` for the piece on ${selectedFrom}` : ''} to play your move. Colors identify options; move quality is revealed afterward.` },
        feedback: { title: 'Read your move', text: `${quality ? QUALITY_LABELS[quality] : 'Move played'}: you earned ${points} points and ${healthFeedback}. Any opponent reply plays automatically.` },
        health: { title: 'Keep an eye on your hearts', text: `Best and Good moves keep your health. Inaccuracy costs ${run.rules.damage.inaccuracy}; Bad costs ${run.rules.damage.bad}. This example shows what damage looks like.` },
        healing: { title: 'Build a Best streak', text: `${BEST_MOVE_STREAK_LENGTH} consecutive Best moves restore one heart. A different move quality resets the streak. The flame beside your hearts tracks your progress.` },
        carryover: { title: 'Keep going between rounds', text: 'Hearts, score, items, and active effects carry into the next round. The bars under the board track your progress; the dots mark rewards after rounds 3 and 6.' },
        'waiting-checkpoint': { title: '', text: '' },
        item: { title: 'Try your item', text: 'Tap an item below the board, then tap its green check to activate it before your move. The red X cancels. You can also save it for later.' },
        ready: { title: 'You’re ready', text: `Your item has been used. Keep choosing moves, watch your hearts, and use your supplies when they help.${run.daily ? '' : ' You can replay this guide from Help.'}` },
    };
    return createPortal(<>{step !== 'welcome' && position && position.targetWidth > 0 && position.targetHeight > 0
        && <div className="tutorial-highlight" aria-hidden="true" style={{ top: position.targetTop, left: position.targetLeft,
            width: position.targetWidth, height: position.targetHeight }} />}
        <section ref={tooltip} className="play-tutorial" data-placement={position?.side}
        style={{ top: position?.top, left: position?.left, visibility: position ? 'visible' : 'hidden' } as CSSProperties}
        aria-labelledby="play-tutorial-title">
        <span className="tutorial-arrow" aria-hidden="true" style={{ top: position?.arrowTop, left: position?.arrowLeft }} />
        <span className="tutorial-eyebrow">Learn to play</span>
        <h2 id="play-tutorial-title" ref={heading} tabIndex={-1}>{copy[step].title}</h2>
        <p>{copy[step].text}</p>
        {step === 'health' && <HealthExample damage={run.rules.damage.inaccuracy} />}
        <div className="tutorial-actions">
            <button className="text-button" onClick={onSkip}>Skip tutorial</button>
            {hasNext && <button className="primary-small" onClick={onNext}>
                {step === 'item' ? 'Keep for later' : step === 'carryover' || step === 'ready' ? 'Continue playing' : 'Next'}</button>}
        </div>
    </section></>, document.body);
}
