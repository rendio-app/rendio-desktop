import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  IpcChannels,
  type TranslateRequest,
  type TranslationDirection,
} from "../types";
import { getSettings } from "./store";

let abortController: AbortController | null = null;

function buildSystemPrompt(
  base: string,
  direction: TranslationDirection,
): string {
  const directionHint =
    direction === "ja-to-en"
      ? "Translate from Japanese to English."
      : "Translate from English to Japanese.";
  return `${base}\n${directionHint}`;
}

async function translate(
  win: BrowserWindow,
  request: TranslateRequest,
): Promise<void> {
  const settings = getSettings();

  if (!settings.apiKey) {
    win.webContents.send(
      IpcChannels.TRANSLATE_ERROR,
      "API Key is not configured. Please open Settings to set your API key.",
    );
    return;
  }

  abortController = new AbortController();

  try {
    const response = await fetch(settings.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(
              settings.systemPrompt,
              request.direction,
            ),
          },
          { role: "user", content: request.text },
        ],
        stream: true,
        temperature: 0.2,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      win.webContents.send(
        IpcChannels.TRANSLATE_ERROR,
        `API error (${response.status}): ${body}`,
      );
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      win.webContents.send(IpcChannels.TRANSLATE_ERROR, "No response body");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            win.webContents.send(IpcChannels.TRANSLATE_CHUNK, content);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    win.webContents.send(IpcChannels.TRANSLATE_DONE);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return;
    }
    win.webContents.send(
      IpcChannels.TRANSLATE_ERROR,
      err instanceof Error ? err.message : "Unknown error",
    );
  } finally {
    abortController = null;
  }
}

export function setupTranslatorHandlers(
  getWin: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    IpcChannels.TRANSLATE_START,
    (_event, request: TranslateRequest) => {
      const win = getWin();
      if (win) {
        translate(win, request);
      }
    },
  );

  ipcMain.handle(IpcChannels.TRANSLATE_CANCEL, () => {
    abortController?.abort();
    abortController = null;
  });
}
