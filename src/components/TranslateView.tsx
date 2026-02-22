import { ArrowRightLeft, Copy, Loader2, Settings } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsDialog } from "@/components/SettingsView";
import { SpeakButton } from "@/components/SpeakButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WordDetailView } from "@/components/WordDetailView";
import { useTTS } from "@/hooks/useTTS";
import type { TranslationDirection, WordDetailResult } from "@/types";

const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const SINGLE_WORD_REGEX = /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/;

function detectDirection(text: string): TranslationDirection {
  return JAPANESE_REGEX.test(text) ? "ja-to-en" : "en-to-ja";
}

type TranslationState = {
  sourceText: string;
  resultText: string;
  wordDetail: WordDetailResult | null;
  direction: TranslationDirection;
  isTranslating: boolean;
  error: string;
};

type TranslationAction =
  | { type: "SET_SOURCE"; text: string }
  | { type: "START"; text: string; direction: TranslationDirection }
  | { type: "CHUNK"; chunk: string }
  | { type: "DONE" }
  | { type: "ERROR"; error: string }
  | { type: "WORD_DETAIL"; detail: WordDetailResult }
  | { type: "CANCEL" }
  | { type: "TOGGLE_DIRECTION" };

function translationReducer(
  state: TranslationState,
  action: TranslationAction,
): TranslationState {
  switch (action.type) {
    case "SET_SOURCE":
      return { ...state, sourceText: action.text };
    case "START":
      return {
        ...state,
        sourceText: action.text,
        resultText: "",
        wordDetail: null,
        error: "",
        isTranslating: true,
        direction: action.direction,
      };
    case "CHUNK":
      return { ...state, resultText: state.resultText + action.chunk };
    case "DONE":
      return { ...state, isTranslating: false };
    case "ERROR":
      return { ...state, isTranslating: false, error: action.error };
    case "WORD_DETAIL":
      return { ...state, wordDetail: action.detail };
    case "CANCEL":
      return { ...state, isTranslating: false };
    case "TOGGLE_DIRECTION":
      return {
        ...state,
        direction: state.direction === "ja-to-en" ? "en-to-ja" : "ja-to-en",
      };
  }
}

export function TranslateView() {
  const [state, dispatch] = useReducer(translationReducer, {
    sourceText: "",
    resultText: "",
    wordDetail: null,
    direction: "en-to-ja" as TranslationDirection,
    isTranslating: false,
    error: "",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ttsSpeedRef = useRef(1);
  const tts = useTTS();

  useEffect(() => {
    window.electronAPI.settingsGet().then((s) => {
      ttsSpeedRef.current = s.ttsSpeed;
    });
  }, []);

  const startTranslation = useCallback((text: string) => {
    if (!text.trim()) return;

    const dir = detectDirection(text);
    const trimmed = text.trim();
    const mode =
      dir === "en-to-ja" && SINGLE_WORD_REGEX.test(trimmed)
        ? "word-detail"
        : "normal";

    dispatch({ type: "START", text, direction: dir });
    window.electronAPI.translateStart({ text: trimmed, direction: dir, mode });
  }, []);

  useEffect(() => {
    const unsubChunk = window.electronAPI.onTranslateChunk((chunk) => {
      dispatch({ type: "CHUNK", chunk });
    });

    const unsubDone = window.electronAPI.onTranslateDone(() => {
      dispatch({ type: "DONE" });
    });

    const unsubError = window.electronAPI.onTranslateError((err) => {
      dispatch({ type: "ERROR", error: err });
    });

    const unsubWordDetail = window.electronAPI.onTranslateWordDetail(
      (result) => {
        dispatch({ type: "WORD_DETAIL", detail: result });
      },
    );

    const unsubSelection = window.electronAPI.onSelectionText((text) => {
      startTranslation(text);
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
      unsubWordDetail();
      unsubSelection();
    };
  }, [startTranslation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCancel = () => {
    window.electronAPI.translateCancel();
    dispatch({ type: "CANCEL" });
  };

  const handleCopy = () => {
    if (state.wordDetail) {
      const lines = [
        `${state.wordDetail.word} - ${state.wordDetail.translation}`,
      ];
      if (state.wordDetail.partsOfSpeech.length > 0) {
        lines.push(
          "",
          state.wordDetail.partsOfSpeech
            .map((p) => `【${p.name}】${p.meaning}`)
            .join("\n"),
        );
      }
      if (state.wordDetail.examples.length > 0) {
        lines.push(
          "",
          state.wordDetail.examples.map((e) => `${e.en}\n${e.ja}`).join("\n\n"),
        );
      }
      window.electronAPI.clipboardCopy(lines.join("\n"));
    } else if (state.resultText) {
      window.electronAPI.clipboardCopy(state.resultText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      startTranslation(state.sourceText);
    }
  };

  const directionLabel =
    state.direction === "ja-to-en"
      ? "Japanese → English"
      : "English → Japanese";

  return (
    <div className="flex h-screen flex-col p-4 gap-3">
      <Textarea
        placeholder="Enter text to translate... (Cmd+Enter to translate)"
        value={state.sourceText}
        onChange={(e) => dispatch({ type: "SET_SOURCE", text: e.target.value })}
        onKeyDown={handleKeyDown}
        className="min-h-24 flex-1 resize-none"
      />

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "TOGGLE_DIRECTION" })}
        >
          <ArrowRightLeft className="size-4" />
          {directionLabel}
        </Button>
      </div>

      {state.isTranslating && !state.resultText && !state.wordDetail ? (
        <div className="flex min-h-24 flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : state.wordDetail ? (
        <WordDetailView
          result={state.wordDetail}
          isLoading={state.isTranslating}
        />
      ) : (
        <Textarea
          placeholder="Translation will appear here..."
          value={state.resultText}
          readOnly
          className="min-h-24 flex-1 resize-none"
        />
      )}

      {(state.error || tts.error) && (
        <p className="text-sm text-destructive">
          {state.error || tts.error}{" "}
          {state.error?.includes("API Key") && (
            <button
              type="button"
              className="underline"
              onClick={() => setSettingsOpen(true)}
            >
              Open Settings
            </button>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-5" />
        </Button>
        <div className="flex flex-1 gap-2">
          {state.isTranslating ? (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={() => startTranslation(state.sourceText)}
              disabled={!state.sourceText.trim()}
            >
              Translate
            </Button>
          )}
          <SpeakButton
            state={tts.state}
            onPlay={() =>
              tts.play(
                state.direction === "en-to-ja"
                  ? state.sourceText
                  : state.resultText,
                ttsSpeedRef.current,
              )
            }
            onStop={tts.stop}
            disabled={
              state.direction === "en-to-ja"
                ? !state.sourceText.trim()
                : !state.resultText
            }
          />
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={!state.resultText && !state.wordDetail}
          >
            <Copy className="size-4" />
            Copy
          </Button>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => {
          window.electronAPI.settingsGet().then((s) => {
            ttsSpeedRef.current = s.ttsSpeed;
          });
          toast.success("Settings saved");
        }}
      />
    </div>
  );
}
