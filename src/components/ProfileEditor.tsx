import { useState, type FormEvent } from 'react';
import { Check, Save, X } from 'lucide-react';
import {
    AVATARS, AVATAR_COLORS, BANNERS, DEFAULT_DISPLAY_NAME, DISPLAY_NAME_LIMIT, displayNameError,
    normalizeDisplayName, profileAsset, type PlayerProfile,
} from '../game/playerProfile';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerRow } from './PlayerRow';
import './ProfileEditor.css';

export function ProfileEditor({ profile, onSave, onCancel }: {
    profile: PlayerProfile;
    onSave: (profile: PlayerProfile) => void;
    onCancel: () => void;
}) {
    const [draft, setDraft] = useState(profile);
    const [nameTouched, setNameTouched] = useState(false);
    const error = displayNameError(draft.displayName);

    function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setNameTouched(true);
        if (!error) onSave({ ...draft, displayName: normalizeDisplayName(draft.displayName) });
    }

    return <form className="profile-editor" onSubmit={save} noValidate>
        <header className="profile-editor-header">
            <h2 id="profile-title">Edit profile</h2>
            <PlayerRow profile={{ ...draft, displayName: normalizeDisplayName(draft.displayName) || DEFAULT_DISPLAY_NAME }}
                rank={1} score={12500} label="Leaderboard appearance" />
        </header>
        <div className="profile-editor-body">
            <div className="profile-name-field">
                <label htmlFor="profile-name">Display name</label>
                <input id="profile-name" value={draft.displayName} maxLength={DISPLAY_NAME_LIMIT}
                    autoComplete="nickname" data-modal-focus aria-invalid={nameTouched && !!error}
                    aria-describedby={nameTouched && error ? 'profile-name-error' : undefined}
                    onBlur={() => setNameTouched(true)}
                    onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
                <span className="profile-name-count" aria-hidden="true">{draft.displayName.length}/{DISPLAY_NAME_LIMIT}</span>
                {nameTouched && error && <p id="profile-name-error" className="profile-field-error" role="alert">{error}</p>}
            </div>
            <fieldset className="profile-options">
                <legend>Avatar</legend>
                <div className="profile-avatar-grid">
                    {AVATARS.map(avatar => <button type="button" key={avatar.id} className="profile-avatar-option"
                        aria-label={`${avatar.name} avatar`} title={avatar.name} aria-pressed={draft.avatarId === avatar.id}
                        onClick={() => setDraft({ ...draft, avatarId: avatar.id })}>
                        <PlayerAvatar profile={{ ...draft, avatarId: avatar.id }} />
                        {draft.avatarId === avatar.id && <Check className="profile-option-check" size={14} aria-hidden="true" />}
                    </button>)}
                </div>
            </fieldset>
            <fieldset className="profile-options">
                <legend>Avatar background</legend>
                <div className="profile-color-options">
                    {AVATAR_COLORS.map(({ color, name }) => <button type="button" key={color} className="profile-color-swatch"
                        style={{ backgroundColor: color }} aria-label={`${name} avatar background`} title={name}
                        aria-pressed={draft.avatarBackgroundColor === color}
                        onClick={() => setDraft({ ...draft, avatarBackgroundColor: color })}>
                        {draft.avatarBackgroundColor === color && <Check size={16} aria-hidden="true" />}
                    </button>)}
                </div>
            </fieldset>
            <fieldset className="profile-options">
                <legend>Banner background</legend>
                <div className="profile-banner-grid">
                    {BANNERS.map(banner => <button type="button" key={banner.id} className="profile-banner-option"
                        aria-label={`${banner.name} banner`} title={banner.name} aria-pressed={draft.bannerId === banner.id}
                        onClick={() => setDraft({ ...draft, bannerId: banner.id })}>
                        <img src={profileAsset('banners', banner.id)} alt="" width="480" height="96" />
                        <span>{banner.name}</span>
                        {draft.bannerId === banner.id && <Check className="profile-option-check" size={14} aria-hidden="true" />}
                    </button>)}
                </div>
            </fieldset>
        </div>
        <footer className="profile-editor-actions">
            <button className="text-button" type="button" onClick={onCancel}><X size={16} aria-hidden="true" />Cancel</button>
            <button className="primary-small" type="submit"><Save size={16} aria-hidden="true" />Save changes</button>
        </footer>
    </form>;
}
