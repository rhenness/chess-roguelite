import type { MoveQuality } from '../types/level';
import { QUALITY_LABELS } from '../game/run';

interface MoveGradeProps {
    quality: MoveQuality;
}

export function MoveGrade({ quality }: MoveGradeProps) {
    return <span className="move-grade"><strong>{QUALITY_LABELS[quality]}</strong></span>;
}

export function MoveFeedback({ quality }: MoveGradeProps) {
    return <div className={`reveal-card quality-${quality}`} role="status" aria-label="Move quality">
        <MoveGrade quality={quality} />
    </div>;
}
