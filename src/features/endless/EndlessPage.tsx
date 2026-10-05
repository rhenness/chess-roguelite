import type { ItemInventory } from '../../game/items';
import type { UserProgression } from '../../game/progression';
import type { PageLocation } from '../../game/usePageNavigation';
import { EndlessGame } from './EndlessGame';
import { EndlessSetup } from './EndlessSetup';
import type { EndlessController } from './useEndlessSession';
import './Endless.css';

export function EndlessPage({ page, controller, active, profile, buyLoadout, navigate }: {
    page: 'endless' | 'endless-items' | 'endless-game'; controller: EndlessController; active: boolean;
    profile: UserProgression; buyLoadout: (items: ItemInventory) => boolean; navigate: (location: PageLocation) => void;
}) {
    return page === 'endless-game' ? <EndlessGame controller={controller} active={active} navigate={navigate} />
        : <EndlessSetup page={page} controller={controller} profile={profile} buyLoadout={buyLoadout} navigate={navigate} />;
}
