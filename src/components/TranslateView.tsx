import { Copy, Loader2, Settings } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { SettingsDialog } from "@/components/SettingsView";
import { SpeakButton } from "@/components/SpeakButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WordDetailView } from "@/components/WordDetailView";
import { useTTS } from "@/hooks/useTTS";
import type { TranslationDirection, WordDetailResult } from "@/types";

const SINGLE_WORD_REGEX = /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/;

const DIRECTION_STORAGE_KEY = "rendio-translation-direction";

// The order here is the on-screen order; `key` is the ⌘/Ctrl + digit shortcut.
const DIRECTION_OPTIONS: readonly {
  value: TranslationDirection;
  label: string;
  key: string;
}[] = [
  { value: "en-to-ja", label: "English → Japanese", key: "1" },
  { value: "ja-to-en", label: "Japanese → English", key: "2" },
];

function isTranslationDirection(value: unknown): value is TranslationDirection {
  return DIRECTION_OPTIONS.some((option) => option.value === value);
}

type TranslationState = {
  sourceText: string;
  resultText: string;
  wordDetail: WordDetailResult | null;
  direction: TranslationDirection;
  isTranslating: boolean;
  error: string;
};

function initTranslationState(): TranslationState {
  const saved = localStorage.getItem(DIRECTION_STORAGE_KEY);
  return {
    sourceText: "",
    resultText: "",
    wordDetail: null,
    direction: isTranslationDirection(saved) ? saved : "en-to-ja",
    isTranslating: false,
    error: "",
  };
}

type TranslationAction =
  | { type: "SET_SOURCE"; text: string }
  | { type: "START"; text: string; direction: TranslationDirection }
  | { type: "CHUNK"; chunk: string }
  | { type: "DONE" }
  | { type: "ERROR"; error: string }
  | { type: "WORD_DETAIL"; detail: WordDetailResult }
  | { type: "CANCEL" }
  | { type: "SET_DIRECTION"; direction: TranslationDirection };

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
    case "SET_DIRECTION":
      // A previous result no longer matches the new direction.
      return {
        ...state,
        direction: action.direction,
        resultText: "",
        wordDetail: null,
        error: "",
      };
  }
}

export function TranslateView() {
  const [state, dispatch] = useReducer(
    translationReducer,
    undefined,
    initTranslationState,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ttsSpeedRef = useRef(1);
  // Id of the translation whose events are currently accepted.
  const requestIdRef = useRef(0);
  const tts = useTTS();

  useEffect(() => {
    window.electronAPI.settingsGet().then((s) => {
      ttsSpeedRef.current = s.ttsSpeed;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(DIRECTION_STORAGE_KEY, state.direction);
  }, [state.direction]);

  const startTranslation = useCallback(
    (text: string, direction: TranslationDirection) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const mode =
        direction === "en-to-ja" && SINGLE_WORD_REGEX.test(trimmed)
          ? "word-detail"
          : "normal";

      requestIdRef.current += 1;
      dispatch({ type: "START", text, direction });
      window.electronAPI.translateStart({
        id: requestIdRef.current,
        text: trimmed,
        direction,
        mode,
      });
    },
    [],
  );

  const handleCancel = () => {
    // Ignore any events still in flight from the cancelled request.
    requestIdRef.current += 1;
    window.electronAPI.translateCancel();
    dispatch({ type: "CANCEL" });
  };

  // Re-translates in the new direction if a translation is already shown
  // (or running); otherwise only the direction changes.
  const changeDirection = (direction: TranslationDirection) => {
    if (direction === state.direction) return;

    const hasTranslation =
      state.isTranslating ||
      state.resultText !== "" ||
      state.wordDetail !== null ||
      state.error !== "";

    if (hasTranslation && state.sourceText.trim()) {
      startTranslation(state.sourceText, direction);
      return;
    }

    // The input was cleared while translating: stop the stale translation.
    if (state.isTranslating) handleCancel();
    dispatch({ type: "SET_DIRECTION", direction });
  };

  const onSelectionText = useEffectEvent((text: string) => {
    startTranslation(text, state.direction);
  });

  useEffect(() => {
    const isCurrent = (requestId: number) => requestId === requestIdRef.current;

    const unsubChunk = window.electronAPI.onTranslateChunk(
      (requestId, chunk) => {
        if (isCurrent(requestId)) dispatch({ type: "CHUNK", chunk });
      },
    );

    const unsubDone = window.electronAPI.onTranslateDone((requestId) => {
      if (isCurrent(requestId)) dispatch({ type: "DONE" });
    });

    const unsubError = window.electronAPI.onTranslateError((requestId, err) => {
      if (isCurrent(requestId)) dispatch({ type: "ERROR", error: err });
    });

    const unsubWordDetail = window.electronAPI.onTranslateWordDetail(
      (requestId, result) => {
        if (isCurrent(requestId)) {
          dispatch({ type: "WORD_DETAIL", detail: result });
        }
      },
    );

    const unsubSelection = window.electronAPI.onSelectionText((text) => {
      onSelectionText(text);
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
      unsubWordDetail();
      unsubSelection();
    };
  }, []);

  const onWindowKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;

    if (e.key === ",") {
      e.preventDefault();
      setSettingsOpen(true);
      return;
    }

    // While Settings is open, digits may be part of a shortcut being recorded.
    if (settingsOpen || e.altKey || e.shiftKey || e.repeat) return;
    const option = DIRECTION_OPTIONS.find((o) => o.key === e.key);
    if (option) {
      e.preventDefault();
      changeDirection(option.value);
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => onWindowKeyDown(e);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      startTranslation(state.sourceText, state.direction);
    }
  };

  return (
    <div className="flex h-screen flex-col p-4 gap-3">
      <Textarea
        placeholder="Enter text to translate... (Cmd+Enter to translate)"
        value={state.sourceText}
        onChange={(e) => dispatch({ type: "SET_SOURCE", text: e.target.value })}
        onKeyDown={handleKeyDown}
        className="min-h-24 flex-1 resize-none"
      />

      <div className="flex items-center justify-center">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Translation direction"
          value={state.direction}
          onValueChange={(value) => {
            // Radix reports "" when the active item is clicked again; keep it.
            if (isTranslationDirection(value)) changeDirection(value);
          }}
        >
          {DIRECTION_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              title={`${option.label} (⌘${option.key})`}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
              onClick={() =>
                startTranslation(state.sourceText, state.direction)
              }
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
