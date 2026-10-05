import { ExternalLink } from 'lucide-react';
import type { ShareRunData, ShareRunHandler } from '../game/shareRun';

export function ShareRunButton({ result, onShare }: { result: ShareRunData; onShare?: ShareRunHandler }) {
    if (!onShare) return null;
    return <button className="text-button share-run-button" onClick={event => onShare(result, event.currentTarget)}>
        <ExternalLink size={17} aria-hidden="true" />Share run
    </button>;
}
