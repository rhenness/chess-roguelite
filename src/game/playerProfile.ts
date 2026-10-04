export const PLAYER_PROFILE_STORAGE_KEY = 'knightfall.player-profile.v1';
export const DISPLAY_NAME_LIMIT = 24;
export const DEFAULT_DISPLAY_NAME = 'Massive Pawn';

export const AVATARS = [
    { id: 'knight', name: 'Knight' },
    { id: 'rook', name: 'Rook' },
    { id: 'bishop', name: 'Bishop' },
    { id: 'queen', name: 'Queen' },
    { id: 'king', name: 'King' },
    { id: 'pawn', name: 'Pawn' },
    { id: 'sentinel', name: 'Sentinel' },
    { id: 'swords', name: 'Crossed swords' },
] as const;

export const BANNERS = [
    { id: 'checkered', name: 'Checkered' },
    { id: 'crimson', name: 'Crimson court' },
    { id: 'verdant', name: 'Verdant hall' },
    { id: 'celestial', name: 'Celestial' },
    { id: 'ivory', name: 'Ivory mosaic' },
    { id: 'steel', name: 'Steel fortress' },
] as const;

export const AVATAR_COLORS = [
    { color: '#234b40', name: 'Forest' },
    { color: '#345d85', name: 'Sapphire' },
    { color: '#913d52', name: 'Crimson' },
    { color: '#71558b', name: 'Amethyst' },
    { color: '#986927', name: 'Bronze' },
    { color: '#337b7c', name: 'Teal' },
    { color: '#44474d', name: 'Charcoal' },
    { color: '#b77b71', name: 'Rose' },
] as const;

export interface PlayerProfile {
    version: 1;
    displayName: string;
    avatarId: (typeof AVATARS)[number]['id'];
    avatarBackgroundColor: string;
    bannerId: (typeof BANNERS)[number]['id'];
}

export const initialPlayerProfile = (): PlayerProfile => ({
    version: 1,
    displayName: DEFAULT_DISPLAY_NAME,
    avatarId: 'knight',
    avatarBackgroundColor: AVATAR_COLORS[0].color,
    bannerId: 'checkered',
});

export const normalizeDisplayName = (name: string): string =>
    name.trim().replace(/\s+/g, ' ');

export function displayNameError(name: string): string | null {
    const normalized = normalizeDisplayName(name);
    if (!normalized) return 'Enter a display name.';
    if (normalized.length > DISPLAY_NAME_LIMIT)
        return `Use ${DISPLAY_NAME_LIMIT} characters or fewer.`;
    if (/[\u0000-\u001f\u007f]/.test(normalized))
        return 'Remove special control characters.';
    return null;
}

export const profileAsset = (kind: 'avatars' | 'banners', id: string): string =>
    `${import.meta.env.BASE_URL}profile/${kind}/${id}.svg`;

export function loadPlayerProfile(): PlayerProfile {
    const fallback = initialPlayerProfile();
    try {
        const source = window.localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);
        if (!source) return fallback;
        const saved: unknown = JSON.parse(source);
        if (
            !saved ||
            typeof saved !== 'object' ||
            !('version' in saved) ||
            saved.version !== 1
        )
            return fallback;
        const value = saved as Record<string, unknown>;
        return {
            version: 1,
            displayName:
                typeof value.displayName === 'string' &&
                !displayNameError(value.displayName)
                    ? normalizeDisplayName(value.displayName)
                    : fallback.displayName,
            avatarId:
                AVATARS.find((avatar) => avatar.id === value.avatarId)?.id ??
                fallback.avatarId,
            avatarBackgroundColor:
                typeof value.avatarBackgroundColor === 'string' &&
                /^#[\da-f]{6}$/i.test(value.avatarBackgroundColor)
                    ? value.avatarBackgroundColor.toLowerCase()
                    : fallback.avatarBackgroundColor,
            bannerId:
                BANNERS.find((banner) => banner.id === value.bannerId)?.id ??
                fallback.bannerId,
        };
    } catch {
        return fallback;
    }
}

export function savePlayerProfile(profile: PlayerProfile): boolean {
    try {
        window.localStorage.setItem(
            PLAYER_PROFILE_STORAGE_KEY,
            JSON.stringify(profile),
        );
        return true;
    } catch {
        return false;
    }
}
