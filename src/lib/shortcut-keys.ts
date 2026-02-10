const KEY_LABELS: Record<string, string> = {
  Meta: "\u2318",
  Control: "\u2303",
  Alt: "\u2325",
  Shift: "\u21E7",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  Backspace: "\u232B",
  Delete: "\u2326",
  Enter: "\u21A9",
  Escape: "\u238B",
  Tab: "\u21E5",
  " ": "Space",
};

const MODIFIER_KEYS = new Set([
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "CapsLock",
  "Tab",
  "Escape",
]);

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Meta"] as const;

const ACCELERATOR_LABELS: Record<string, string> = {
  CommandOrControl: "\u2318",
  Command: "\u2318",
  Cmd: "\u2318",
  Control: "\u2303",
  Ctrl: "\u2303",
  Alt: "\u2325",
  Option: "\u2325",
  Shift: "\u21E7",
};

export function getKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function parseAccelerator(accelerator: string): string[] {
  return accelerator.split("+").map((part) => {
    const trimmed = part.trim();
    return ACCELERATOR_LABELS[trimmed] ?? trimmed;
  });
}

export { MODIFIER_ORDER };
