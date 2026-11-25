// The player's "Effects opacity" setting (drawing only): every effect's own opacity is multiplied by it.
export const FXO = { global: 1 };
export function setEffectsOpacity(v) { FXO.global = Math.max(0, Math.min(1, Number(v) || 0)); }
