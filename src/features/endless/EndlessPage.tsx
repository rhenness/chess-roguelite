import type { ItemInventory } from '../../game/items';
import type { UserProgression } from '../../game/progression';
import type { PageLocation } from '../../game/usePageNavigation';
import type { ShareRunHandler } from '../../game/shareRun';
import { EndlessGame } from './EndlessGame';
import { EndlessSetup } from './EndlessSetup';
import type { EndlessController } from './useEndlessSession';
import './Endless.css';

export function EndlessPage({ page, controller, active, profile, buyLoadout, navigate, onShare }: {
    page: 'endless' | 'endless-items' | 'endless-game'; controller: EndlessController; active: boolean;
    profile: UserProgression; buyLoadout: (items: ItemInventory) => boolean; navigate: (location: PageLocation) => void;
    onShare?: ShareRunHandler;
}) {
    return page === 'endless-game' ? <EndlessGame controller={controller} active={active} navigate={navigate} onShare={onShare} />
        : <EndlessSetup page={page} controller={controller} profile={profile} buyLoadout={buyLoadout} navigate={navigate} />;
}
