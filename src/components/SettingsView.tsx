import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getKeyLabel,
  MODIFIER_ORDER,
  parseAccelerator,
} from "@/lib/shortcut-keys";
import { type Settings, settingsSchema } from "@/types";

interface SettingsViewProps {
  onBack: () => void;
}

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

export function SettingsView({ onBack }: SettingsViewProps) {
  const [settings, setSettings] = useState<Settings>({
    apiEndpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    model: "gpt-4o",
    systemPrompt:
      "You are a professional translator. Translate the given text accurately and naturally. Output only the translation without any explanation.",
    shortcutKey: "CommandOrControl+J",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pressedModifiers, setPressedModifiers] = useState<Set<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    window.electronAPI.settingsGet().then((saved) => {
      setSettings(saved);
    });
  }, []);

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
    onBack();
  };

  const updateField = (field: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const activeDisplayKeys = MODIFIER_ORDER.filter((mod) =>
    pressedModifiers.has(mod),
  ).map(getKeyLabel);

  return (
    <div className="flex h-screen flex-col p-4 gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
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
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={settings.model}
            onChange={(e) => updateField("model", e.target.value)}
          />
          {errors.model && (
            <p className="text-sm text-destructive">{errors.model}</p>
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

      <Button onClick={handleSave}>Save</Button>
    </div>
  );
}
