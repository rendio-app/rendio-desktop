import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  IpcChannels,
  type TranslateRequest,
  type TranslationDirection,
  type WordDetailResult,
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

function buildWordDetailPrompt(): string {
  return `You are an English-Japanese dictionary. Given a single English word, respond with a JSON object in the following format (no markdown fences, raw JSON only):
{
  "word": "<the input word>",
  "translation": "<primary Japanese translation>",
  "partsOfSpeech": [
    { "name": "<part of speech in Japanese, e.g. 名詞, 自動詞, 他動詞, 形容詞>", "meaning": "<meaning in Japanese>" }
  ],
  "examples": [
    { "en": "<example sentence in English>", "ja": "<Japanese translation of the example>" }
  ]
}
For verbs, distinguish between 自動詞 (intransitive) and 他動詞 (transitive). If a word can be used as both, list them as separate entries in partsOfSpeech.
Include 2-4 parts of speech if the word has multiple usages, and some example sentences. Output ONLY valid JSON, nothing else.`;
}

function extractJsonArray(
  text: string,
  fieldName: string,
): { items: unknown[]; complete: boolean } {
  const fieldPattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[`);
  const match = fieldPattern.exec(text);
  if (!match) return { items: [], complete: false };

  const startIdx = match.index + match[0].length - 1; // position of '['
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth++;
    if (ch === "]") {
      depth--;
      if (depth === 0) {
        // Array is complete
        const arrayStr = text.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(arrayStr);
          return { items: Array.isArray(parsed) ? parsed : [], complete: true };
        } catch {
          return { items: [], complete: false };
        }
      }
    }
  }

  // Array not yet complete — extract individually completed objects at depth 1
  const inner = text.slice(startIdx + 1); // after the opening '['
  const items: unknown[] = [];
  let objDepth = 0;
  let objStart = -1;
  let objInString = false;
  let objEscaped = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (objEscaped) {
      objEscaped = false;
      continue;
    }
    if (ch === "\\") {
      objEscaped = true;
      continue;
    }
    if (ch === '"') {
      objInString = !objInString;
      continue;
    }
    if (objInString) continue;
    if (ch === "{") {
      if (objDepth === 0) objStart = i;
      objDepth++;
    }
    if (ch === "}") {
      objDepth--;
      if (objDepth === 0 && objStart >= 0) {
        const objStr = inner.slice(objStart, i + 1);
        try {
          items.push(JSON.parse(objStr));
        } catch {
          // skip malformed
        }
        objStart = -1;
      }
    }
  }

  return { items, complete: false };
}

function extractPartialWordDetail(
  accumulated: string,
  word: string,
): WordDetailResult {
  // Strip markdown code fences
  let text = accumulated.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // Extract translation
  const translationMatch = text.match(
    /"translation"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  );
  const translation = translationMatch
    ? translationMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : "";

  // Extract partsOfSpeech
  const pos = extractJsonArray(text, "partsOfSpeech");
  const partsOfSpeech = pos.items as { name: string; meaning: string }[];

  // Extract examples
  const ex = extractJsonArray(text, "examples");
  const examples = ex.items as { en: string; ja: string }[];

  return { word, translation, partsOfSpeech, examples };
}

function hasNewData(
  current: WordDetailResult,
  last: WordDetailResult | null,
): boolean {
  if (!last) return current.translation !== "";
  return (
    current.translation !== last.translation ||
    current.partsOfSpeech.length !== last.partsOfSpeech.length ||
    current.examples.length !== last.examples.length
  );
}

function parseWordDetailResponse(raw: string, word: string): WordDetailResult {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      word: parsed.word ?? word,
      translation: parsed.translation ?? "",
      partsOfSpeech: Array.isArray(parsed.partsOfSpeech)
        ? parsed.partsOfSpeech
        : [],
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    };
  } catch {
    // Fallback: treat raw text as translation
    return {
      word,
      translation: raw.trim(),
      partsOfSpeech: [],
      examples: [],
    };
  }
}

async function translateWordDetail(
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
          { role: "system", content: buildWordDetailPrompt() },
          { role: "user", content: request.text },
        ],
        stream: true,
        temperature: 0.3,
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
    let accumulated = "";
    let lastSent: WordDetailResult | null = null;

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
            accumulated += content;
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }

      const partial = extractPartialWordDetail(accumulated, request.text);
      if (hasNewData(partial, lastSent)) {
        win.webContents.send(IpcChannels.TRANSLATE_WORD_DETAIL, partial);
        lastSent = partial;
      }
    }

    // Final parse for completeness guarantee
    const finalResult = parseWordDetailResponse(accumulated, request.text);
    win.webContents.send(IpcChannels.TRANSLATE_WORD_DETAIL, finalResult);
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

async function translate(
  win: BrowserWindow,
  request: TranslateRequest,
): Promise<void> {
  if (request.mode === "word-detail") {
    return translateWordDetail(win, request);
  }

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
