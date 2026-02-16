import { Eye, EyeOff, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getKeyLabel,
  MODIFIER_ORDER,
  parseAccelerator,
} from "@/lib/shortcut-keys";
import type { ModelInfo } from "@/types";
import { type Settings, settingsSchema } from "@/types";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const MODIFIER_KEYS = new Set([
  "Control",
  "Alt",
  "Shift",
  "Meta",
  "CapsLock",
  "Tab",
  "Escape",
]);

function toAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  if (!MODIFIER_KEYS.has(e.key)) {
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }

  return parts.join("+");
}

export function SettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<Settings>({
    apiEndpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o",
    systemPrompt:
      "You are a professional translator. Translate the text considering context, idiomatic expressions, and common usage patterns. Produce natural, fluent output as a native speaker of the target language would express it. Do not translate word-by-word; convey the intended meaning. Output only the translated text.",
    shortcutKey: "CommandOrControl+J",
    ttsSpeed: 1,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pressedModifiers, setPressedModifiers] = useState<Set<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const fetchModels = useCallback(async (endpoint: string, apiKey: string) => {
    if (!endpoint || !apiKey) return;
    setModelsLoading(true);
    setModelsError("");
    try {
      const result = await window.electronAPI.modelsGet(endpoint, apiKey);
      setModels(result);
    } catch (err) {
      setModels([]);
      setModelsError(
        err instanceof Error ? err.message : "Failed to fetch models",
      );
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      window.electronAPI.settingsGet().then((saved) => {
        setSettings(saved);
        fetchModels(saved.apiEndpoint, saved.apiKey);
      });
      setErrors({});
      setShowApiKey(false);
      setRecording(false);
      setPressedModifiers(new Set());
    } else {
      setModels([]);
    }
  }, [open, fetchModels]);

  useEffect(() => {
    if (!recording) return;

    window.electronAPI.shortcutSuspend();

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (MODIFIER_KEYS.has(e.key)) {
        setPressedModifiers((prev) => new Set(prev).add(e.key));
        return;
      }

      const accelerator = toAccelerator(e);
      setSettings((prev) => ({ ...prev, shortcutKey: accelerator }));
      setRecording(false);
      setPressedModifiers(new Set());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      setPressedModifiers((prev) => {
        const next = new Set(prev);
        next.delete(e.key);
        return next;
      });
    };

    const handleBlur = () => {
      setPressedModifiers(new Set());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.electronAPI.shortcutResume();
    };
  }, [recording]);

  const handleSave = async () => {
    const result = settingsSchema.safeParse(settings);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString();
        if (field) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await window.electronAPI.settingsSet(result.data);
    onOpenChange(false);
    onSaved();
  };

  const updateField = (field: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const activeDisplayKeys = MODIFIER_ORDER.filter((mod) =>
    pressedModifiers.has(mod),
  ).map(getKeyLabel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <Sun className="mr-2 inline size-4" />
                  Light
                </SelectItem>
                <SelectItem value="dark">
                  <Moon className="mr-2 inline size-4" />
                  Dark
                </SelectItem>
                <SelectItem value="system">
                  <Monitor className="mr-2 inline size-4" />
                  System
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiEndpoint">API Endpoint</Label>
            <Input
              id="apiEndpoint"
              value={settings.apiEndpoint}
              onChange={(e) => updateField("apiEndpoint", e.target.value)}
            />
            {errors.apiEndpoint && (
              <p className="text-sm text-destructive">{errors.apiEndpoint}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => updateField("apiKey", e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey((prev) => !prev)}
              >
                {showApiKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {errors.apiKey && (
              <p className="text-sm text-destructive">{errors.apiKey}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Model</Label>
            <div className="flex gap-2">
              <Select
                value={settings.model}
                onValueChange={(value) => updateField("model", value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  fetchModels(settings.apiEndpoint, settings.apiKey)
                }
                disabled={modelsLoading}
              >
                <RefreshCw
                  className={`size-4 ${modelsLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            {errors.model && (
              <p className="text-sm text-destructive">{errors.model}</p>
            )}
            {modelsError && (
              <p className="text-sm text-destructive">{modelsError}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={settings.systemPrompt}
              onChange={(e) => updateField("systemPrompt", e.target.value)}
              className="min-h-20 resize-none"
            />
            {errors.systemPrompt && (
              <p className="text-sm text-destructive">{errors.systemPrompt}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Speech Speed</Label>
            <Select
              value={String(settings.ttsSpeed)}
              onValueChange={(v) =>
                setSettings((prev) => ({ ...prev, ttsSpeed: Number(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.8">Slow</SelectItem>
                <SelectItem value="1">Normal</SelectItem>
                <SelectItem value="1.2">Fast</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Shortcut Key</Label>
            <div className="flex items-center gap-2">
              <div className="border-input flex h-9 flex-1 items-center rounded-md border px-3">
                {recording ? (
                  activeDisplayKeys.length > 0 ? (
                    <KbdGroup>
                      {activeDisplayKeys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </KbdGroup>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      Press a key combination...
                    </span>
                  )
                ) : (
                  <KbdGroup>
                    {parseAccelerator(settings.shortcutKey).map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                )}
              </div>
              <Button
                variant={recording ? "destructive" : "outline"}
                onClick={() => {
                  setRecording((prev) => !prev);
                  setPressedModifiers(new Set());
                }}
              >
                {recording ? "Cancel" : "Record"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
