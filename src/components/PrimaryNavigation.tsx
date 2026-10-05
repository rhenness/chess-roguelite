import { DoorOpen, House, LockKeyhole, Trophy, UserRound } from 'lucide-react';
import type { Page, PageLocation } from '../game/usePageNavigation';
import './PrimaryNavigation.css';

const destinations = [
    { page: 'play', label: 'Home', Icon: House },
    { page: 'daily', label: 'Dungeon', Icon: DoorOpen },
    { page: 'leaderboards', label: 'Leaderboards', Icon: Trophy },
    { page: 'profile', label: 'Profile', Icon: UserRound },
] as const;

export function PrimaryNavigation({ active, onNavigate, locked = false }: { active: Page; onNavigate: (location: PageLocation) => void; locked?: boolean }) {
    return <nav className="primary-navigation" aria-label="Main navigation">
        {destinations.map(({ page, label, Icon }) => {
            const disabled = locked && page !== 'play';
            return <a key={page} href={disabled ? undefined : `#/${page}`} role={disabled ? 'link' : undefined}
                aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined}
                title={disabled ? 'Finish your first regular run to unlock' : undefined}
                aria-current={active === page ? 'page' : undefined} onClick={event => {
                    if (disabled) { event.preventDefault(); return; }
                    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onNavigate({ page });
                }}>{disabled ? <LockKeyhole size={22} aria-hidden="true" /> : <Icon size={22} aria-hidden="true" />}<span>{label}</span></a>;
        })}
    </nav>;
}
