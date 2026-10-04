import { dirname, resolve } from 'node:path';

/** A fixed-width score sorts naturally; the level's stable GUID keeps names unique. */
export function scoredLevelPath(file: string, difficulty: number, id: string): string {
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 100) {
        throw new Error('Difficulty must be an integer from 0 to 100.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('Level ID must be a GUID to name its scored file.');
    }
    return resolve(dirname(file), `${String(difficulty).padStart(3, '0')}-${id}.json`);
}
