import type { ItemId } from '../game/items';

/** Faceted item silhouettes for the reward screen, with no tile or pedestal. */
export function RewardItemArt({ id }: { id: ItemId }) {
    return <svg className="reward-item-art" viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
        {id === 'triple-crown' && <g>
            <path d="M12 34 38 52 60 12 82 52 108 34 100 94 60 108 20 94Z" fill="#e8b34e" />
            <path d="M12 34 24 64 38 52Z M60 12 44 42 60 55Z M108 34 96 64 82 52Z" fill="#ffe19a" />
            <path d="M60 12 76 42 60 55Z M24 64 38 52 44 76Z" fill="#f4c869" />
            <path d="M38 52 44 42 60 55 60 89 44 76Z M82 52 96 64 76 76Z" fill="#f6ce75" />
            <path d="M60 55 76 42 82 52 76 76 60 89Z" fill="#dba340" />
            <path d="M24 64 44 76 60 89 20 94Z" fill="#e6b451" />
            <path d="M96 64 100 94 60 89 76 76Z" fill="#edbf5c" />
            <path d="M20 94 60 89 60 108Z" fill="#f5cc70" />
            <path d="M60 89 100 94 60 108Z" fill="#c68c32" />
        </g>}
        {id === 'kings-guard' && <g>
            <path d="M60 7 78 19 106 29 104 70 93 91 60 114 27 91 16 70 14 29 42 19Z" fill="#efbe5d" />
            <path d="M60 7V20L43 30 24 37 14 29 42 19Z" fill="#ffe19a" />
            <path d="M60 7 78 19 106 29 96 37 77 30 60 20Z" fill="#f5cd78" />
            <path d="M14 29 24 37 26 68 35 85 60 104V114L27 91 16 70Z" fill="#e5ad49" />
            <path d="M106 29 104 70 93 91 60 114V104L85 85 94 68 96 37Z" fill="#c89035" />
            <path d="M60 20 77 30 96 37 94 68 85 85 60 104 35 85 26 68 24 37 43 30Z" fill="#3c5946" />
            <path d="M24 37 43 30 60 20V61Z" fill="#66795a" />
            <path d="M60 20 77 30 96 37 60 61Z" fill="#4e6850" />
            <path d="M24 37 60 61 35 85 26 68Z" fill="#526b4e" />
            <path d="M60 61 96 37 94 68 85 85 60 104Z" fill="#2e493b" />
            <path d="M56 36H64V43H71V50H64V57H56V50H49V43H56Z" fill="#f1c363" />
            <path d="M48 59 53 55H67L72 59 67 70H53Z M53 73H67V78H53Z M55 80H65L72 95H48Z" fill="#e9b451" />
            <path d="M48 59H60V70H53Z M53 73H60V78H53Z M55 80H60V95H48Z" fill="#ffda85" />
        </g>}
        {id === 'healing-potion' && <g>
            <path d="M47 30H73V43L94 56 105 75 106 90 98 104 81 114H39L22 104 14 90 15 75 26 56 47 43Z" fill="#eadcc0" />
            <path d="M47 30H60V48L31 63 22 80 21 93 32 105 43 110H39L22 104 14 90 15 75 26 56 47 43Z" fill="#fff0d1" />
            <path d="M73 30V43L94 56 105 75 106 90 98 104 81 114H60L83 105 96 92 97 77 85 60 65 48 60 30Z" fill="#cebc9e" />
            <path d="M29 64 60 58 91 64 99 80 98 92 89 104 77 109H43L31 104 22 92 21 80Z" fill="#f26d6c" />
            <path d="M29 64 60 58 91 64 82 72H38Z" fill="#ff9290" />
            <path d="M21 80 38 72 42 92 31 104 22 92Z" fill="#ff8580" />
            <path d="M82 72 99 80 98 92 89 104 77 109 72 94Z" fill="#dd5158" />
            <path d="M42 92 60 100 77 109H43L31 104Z" fill="#ec5d63" />
            <path d="M60 81 53 74H44L38 80V88L60 102 82 88V80L76 74H67Z" fill="#ae3948" />
            <path d="M44 74H53L60 81V102L38 88V80Z" fill="#c54551" />
            <path d="M29 80 34 71 44 67 47 71 39 76 35 86Z" fill="#fff0d1" />
            <path d="M39 24 46 19H74L81 24V34L73 38H47L39 34Z" fill="#f7e9cb" />
            <path d="M39 24 47 28H73L81 24V34L73 38H47L39 34Z" fill="#dfceae" />
            <path d="M43 11 49 7H71L77 11 74 27H46Z" fill="#ba7f42" />
            <path d="M43 11 49 7H71L77 11 69 16H51Z" fill="#e3ae6b" />
            <path d="M43 11 51 16 54 27H46Z" fill="#d99b56" />
            <path d="M69 16 77 11 74 27H66Z" fill="#a46b37" />
        </g>}
    </svg>;
}
