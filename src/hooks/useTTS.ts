import { useCallback, useRef, useState } from "react";
import { speak } from "@/lib/tts";

export type TTSState = "idle" | "loading" | "speaking";

export function useTTS() {
  const [state, setState] = useState<TTSState>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setState("idle");
  }, []);

  const play = useCallback(
    async (text: string) => {
      stop();
      setError(null);
      setState("loading");

      try {
        const wavBuffer = await speak(text);

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const audioBuffer = await ctx.decodeAudioData(wavBuffer.slice(0));

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          sourceRef.current = null;
          setState("idle");
        };
        sourceRef.current = source;
        setState("speaking");
        source.start();
      } catch (err) {
        setState("idle");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stop],
  );

  return { state, error, play, stop };
}
