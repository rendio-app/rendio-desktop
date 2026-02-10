import { execFile } from "node:child_process";
import { clipboard, ipcMain, systemPreferences } from "electron";
import { IpcChannels } from "../types";

/**
 * Check if this process has macOS Accessibility permission.
 * On first call with `prompt: true`, macOS shows its native permission dialog.
 */
export function ensureAccessibility(): boolean {
  if (process.platform !== "darwin") return true;
  return systemPreferences.isTrustedAccessibilityClient(true);
}

function getSelectionText(): Promise<string> {
  if (
    process.platform === "darwin" &&
    !systemPreferences.isTrustedAccessibilityClient(false)
  ) {
    return Promise.resolve("");
  }

  return new Promise((resolve) => {
    const previousClipboard = clipboard.readText();
    // Clear clipboard so we can detect whether Cmd+C actually copied something
    clipboard.writeText("");

    const script = `
      tell application "System Events"
        keystroke "c" using command down
      end tell
      delay 0.2
    `;

    execFile("/usr/bin/osascript", ["-e", script], (error) => {
      if (error) {
        clipboard.writeText(previousClipboard);
        resolve("");
        return;
      }

      const selectedText = clipboard.readText();
      clipboard.writeText(previousClipboard);
      resolve(selectedText);
    });
  });
}

export { getSelectionText };

export function setupSelectionHandlers(): void {
  ipcMain.handle(IpcChannels.CLIPBOARD_COPY, (_event, text: string) => {
    clipboard.writeText(text);
  });
}
