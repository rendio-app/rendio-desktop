import { ArrowRightLeft, Copy, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsDialog } from "@/components/SettingsView";
import { SpeakButton } from "@/components/SpeakButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTTS } from "@/hooks/useTTS";
import type { TranslationDirection } from "@/types";

const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

function detectDirection(text: string): TranslationDirection {
  return JAPANESE_REGEX.test(text) ? "ja-to-en" : "en-to-ja";
}

export function TranslateView() {
  const [sourceText, setSourceText] = useState("");
  const [resultText, setResultText] = useState("");
  const [direction, setDirection] = useState<TranslationDirection>("en-to-ja");
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const resultRef = useRef("");
  const ttsSpeedRef = useRef(1);
  const tts = useTTS();

  useEffect(() => {
    window.electronAPI.settingsGet().then((s) => {
      ttsSpeedRef.current = s.ttsSpeed;
    });
  }, []);

  const startTranslation = useCallback(
    (text?: string) => {
      const input = text ?? sourceText;
      if (!input.trim()) return;

      setIsTranslating(true);
      setResultText("");
      setError("");
      resultRef.current = "";

      const dir = detectDirection(input);
      setDirection(dir);

      window.electronAPI.translateStart({ text: input, direction: dir });
    },
    [sourceText],
  );

  useEffect(() => {
    const unsubChunk = window.electronAPI.onTranslateChunk((chunk) => {
      resultRef.current += chunk;
      setResultText(resultRef.current);
    });

    const unsubDone = window.electronAPI.onTranslateDone(() => {
      setIsTranslating(false);
    });

    const unsubError = window.electronAPI.onTranslateError((err) => {
      setIsTranslating(false);
      setError(err);
    });

    const unsubSelection = window.electronAPI.onSelectionText((text) => {
      setSourceText(text);
      setResultText("");
      setError("");
      resultRef.current = "";
      setIsTranslating(true);

      const dir = detectDirection(text);
      setDirection(dir);
      window.electronAPI.translateStart({ text, direction: dir });
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
      unsubSelection();
    };
  }, []);

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
    setIsTranslating(false);
  };

  const handleCopy = () => {
    if (resultText) {
      window.electronAPI.clipboardCopy(resultText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      startTranslation();
    }
  };

  const toggleDirection = () => {
    setDirection((prev) => (prev === "ja-to-en" ? "en-to-ja" : "ja-to-en"));
  };

  const directionLabel =
    direction === "ja-to-en" ? "Japanese → English" : "English → Japanese";

  return (
    <div className="flex h-screen flex-col p-4 gap-3">
      <Textarea
        placeholder="Enter text to translate... (Cmd+Enter to translate)"
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-24 flex-1 resize-none"
      />

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={toggleDirection}>
          <ArrowRightLeft className="size-4" />
          {directionLabel}
        </Button>
      </div>

      <Textarea
        placeholder="Translation will appear here..."
        value={resultText}
        readOnly
        className="min-h-24 flex-1 resize-none"
      />

      {(error || tts.error) && (
        <p className="text-sm text-destructive">
          {error || tts.error}{" "}
          {error?.includes("API Key") && (
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
          {isTranslating ? (
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
              onClick={() => startTranslation()}
              disabled={!sourceText.trim()}
            >
              Translate
            </Button>
          )}
          <SpeakButton
            state={tts.state}
            onPlay={() =>
              tts.play(
                direction === "en-to-ja" ? sourceText : resultText,
                ttsSpeedRef.current,
              )
            }
            onStop={tts.stop}
            disabled={
              direction === "en-to-ja" ? !sourceText.trim() : !resultText
            }
          />
          <Button variant="outline" onClick={handleCopy} disabled={!resultText}>
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
