import { Loader2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TTSState } from "@/hooks/useTTS";

interface SpeakButtonProps {
  state: TTSState;
  onPlay: () => void;
  onStop: () => void;
  disabled: boolean;
}

export function SpeakButton({
  state,
  onPlay,
  onStop,
  disabled,
}: SpeakButtonProps) {
  if (state === "loading") {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (state === "speaking") {
    return (
      <Button variant="outline" onClick={onStop}>
        <Square className="size-4" />
        Stop
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={onPlay} disabled={disabled}>
      <Volume2 className="size-4" />
      Speak
    </Button>
  );
}
