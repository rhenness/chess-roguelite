import { DoorOpen, House, Trophy, UserRound } from 'lucide-react';
import type { Page, PageLocation } from '../game/usePageNavigation';
import './PrimaryNavigation.css';

const destinations = [
    { page: 'play', label: 'Home', Icon: House },
    { page: 'daily', label: 'Dungeon', Icon: DoorOpen },
    { page: 'leaderboards', label: 'Leaderboards', Icon: Trophy },
    { page: 'profile', label: 'Profile', Icon: UserRound },
] as const;

export function PrimaryNavigation({ active, onNavigate }: { active: Page; onNavigate: (location: PageLocation) => void }) {
    return <nav className="primary-navigation" aria-label="Main navigation">
        {destinations.map(({ page, label, Icon }) => <a key={page} href={`#/${page}`}
            aria-current={active === page ? 'page' : undefined} onClick={event => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onNavigate({ page });
            }}><Icon size={20} aria-hidden="true" /><span>{label}</span></a>)}
    </nav>;
}
