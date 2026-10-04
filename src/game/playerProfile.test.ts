import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    displayNameError, initialPlayerProfile, loadPlayerProfile, PLAYER_PROFILE_STORAGE_KEY,
    savePlayerProfile,
} from './playerProfile';

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(PLAYER_PROFILE_STORAGE_KEY);
});

describe('player profile storage', () => {
    it('restores all appearance choices independently and normalizes the saved name', () => {
        const profile = { ...initialPlayerProfile(), displayName: '  Castle   Keeper  ', avatarId: 'rook' as const,
            avatarBackgroundColor: '#123ABC', bannerId: 'crimson' as const };
        expect(savePlayerProfile(profile)).toBe(true);
        expect(loadPlayerProfile()).toEqual({ ...profile, displayName: 'Castle Keeper', avatarBackgroundColor: '#123abc' });
    });

    it('repairs invalid appearance fields while preserving a valid name', () => {
        window.localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({
            version: 1, displayName: 'Keeper', avatarId: '../../invalid',
            avatarBackgroundColor: 'url(invalid)', bannerId: 'missing',
        }));
        expect(loadPlayerProfile()).toEqual({ ...initialPlayerProfile(), displayName: 'Keeper' });
    });

    it.each(['{broken', 'null', '[]', '{"version":2}', '{"version":1,"displayName":"   "}'])
        ('recovers from invalid or unsupported saves: %s', source => {
            window.localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, source);
            expect(loadPlayerProfile()).toEqual(initialPlayerProfile());
        });

    it('reports unavailable storage without preventing an in-memory profile', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        expect(loadPlayerProfile()).toEqual(initialPlayerProfile());
        expect(savePlayerProfile(initialPlayerProfile())).toBe(false);
    });

    it('rejects empty, overlong, and control-character names', () => {
        expect(displayNameError('  ')).toBe('Enter a display name.');
        expect(displayNameError('a'.repeat(25))).toBe('Use 24 characters or fewer.');
        expect(displayNameError('Name\u0000')).toBe('Remove special control characters.');
        expect(displayNameError('  Castle Keeper  ')).toBeNull();
    });
});
