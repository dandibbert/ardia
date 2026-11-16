const RECORDABLE_CONTROL_KEYS = new Set(["\u0003", "\b", "\t", "\r", "\u001b", "\u007f"]);

export function isRecordableShortcut(override: unknown): boolean {
  if (!Array.isArray(override) || typeof override[0] !== "string" || !override[0]) return false;
  return [...override[0]].every((c) => c >= " " || RECORDABLE_CONTROL_KEYS.has(c));
}

function withoutBrokenShortcuts(shortcuts: Record<string, string[]>): Record<string, string[]> {
  if (Object.values(shortcuts).every(isRecordableShortcut)) return shortcuts;
  return Object.fromEntries(Object.entries(shortcuts).filter(([, o]) => isRecordableShortcut(o)));
}

export const withRecordableShortcuts = <S extends { shortcuts: Record<string, string[]> }>(settings: S): S => {
  const shortcuts = withoutBrokenShortcuts(settings.shortcuts);
  return shortcuts === settings.shortcuts ? settings : { ...settings, shortcuts };
};
