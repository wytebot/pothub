/** Compatibility helper: Pothub is intentionally text-only. Every request is a text task. */
export type TaskName = 'text';
export interface IntentOptions { hasFiles?: boolean; hasImageFile?: boolean; code?: { afterCode?: boolean; hasFiles?: boolean }; }
export function interpret(_prompt: string, _options: IntentOptions = {}): { task: TaskName } { return { task: 'text' }; }
