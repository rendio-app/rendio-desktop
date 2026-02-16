import { z } from "zod";

export const settingsSchema = z.object({
  apiEndpoint: z
    .string()
    .url("API Endpoint must be a valid URL")
    .default("https://api.openai.com/v1/chat/completions"),
  apiKey: z.string().min(1, "API Key is required").default(""),
  model: z.string().min(1, "Model is required").default("gpt-4o"),
  systemPrompt: z
    .string()
    .default(
      "You are a professional translator. Translate the text considering context, idiomatic expressions, and common usage patterns. Produce natural, fluent output as a native speaker of the target language would express it. Do not translate word-by-word; convey the intended meaning. Output only the translated text.",
    ),
  shortcutKey: z.string().default("CommandOrControl+J"),
});

export type Settings = z.infer<typeof settingsSchema>;

export type TranslationDirection = "ja-to-en" | "en-to-ja";

export interface TranslateRequest {
  text: string;
  direction: TranslationDirection;
}

export const IpcChannels = {
  TRANSLATE_START: "translate:start",
  TRANSLATE_CHUNK: "translate:chunk",
  TRANSLATE_DONE: "translate:done",
  TRANSLATE_ERROR: "translate:error",
  TRANSLATE_CANCEL: "translate:cancel",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SELECTION_TEXT: "selection:text",
  CLIPBOARD_COPY: "clipboard:copy",
  SHORTCUT_SUSPEND: "shortcut:suspend",
  SHORTCUT_RESUME: "shortcut:resume",
  MODELS_GET: "models:get",
} as const;

export type ModelInfo = {
  id: string;
  owned_by: string;
};
