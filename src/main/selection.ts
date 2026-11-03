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

// How long to wait for the frontmost app to put the copied text on the
// clipboard after Cmd+C is sent. Polling returns as soon as text appears.
const COPY_TIMEOUT_MS = 250;
const COPY_POLL_INTERVAL_MS = 10;

function waitForClipboardText(): Promise<string> {
  const deadline = Date.now() + COPY_TIMEOUT_MS;
  return new Promise((resolve) => {
    const poll = () => {
      const text = clipboard.readText();
      if (text || Date.now() >= deadline) {
        resolve(text);
        return;
      }
      setTimeout(poll, COPY_POLL_INTERVAL_MS);
    };
    poll();
  });
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
    `;

    execFile("/usr/bin/osascript", ["-e", script], async (error) => {
      if (error) {
        clipboard.writeText(previousClipboard);
        resolve("");
        return;
      }

      const selectedText = await waitForClipboardText();
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
