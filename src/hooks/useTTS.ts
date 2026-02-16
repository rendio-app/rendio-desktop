import { useCallback, useRef, useState } from "react";
import { createTTSStream, SAMPLE_RATE, type TTSStream } from "@/lib/tts";

export type TTSState = "idle" | "loading" | "speaking";

export function useTTS() {
  const [state, setState] = useState<TTSState>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const ttsStreamRef = useRef<TTSStream | null>(null);
  const isStoppingRef = useRef(false);

  const stop = useCallback(() => {
    isStoppingRef.current = true;

    if (ttsStreamRef.current) {
      ttsStreamRef.current.abort();
      ttsStreamRef.current = null;
    }

    for (const source of sourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current = [];

    setState("idle");
  }, []);

  const play = useCallback(
    async (text: string, speed = 1) => {
      stop();
      isStoppingRef.current = false;
      setError(null);
      setState("loading");

      try {
        const ttsStream = createTTSStream(text, speed);
        ttsStreamRef.current = ttsStream;

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
        }
        const ctx = audioCtxRef.current;

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        let nextStartTime = 0;
        let isFirst = true;
        let lastSource: AudioBufferSourceNode | null = null;

        for await (const pcmData of ttsStream.stream) {
          if (isStoppingRef.current) return;

          const audioBuffer = ctx.createBuffer(1, pcmData.length, SAMPLE_RATE);
          audioBuffer.getChannelData(0).set(pcmData);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          sourcesRef.current.push(source);

          if (isFirst) {
            nextStartTime = ctx.currentTime + 0.05;
            setState("speaking");
            isFirst = false;
          }

          source.start(nextStartTime);
          nextStartTime += audioBuffer.duration;
          lastSource = source;
        }

        if (isStoppingRef.current) return;

        if (lastSource) {
          lastSource.onended = () => {
            sourcesRef.current = [];
            if (!isStoppingRef.current) {
              setState("idle");
            }
          };
        } else {
          // No chunks were generated
          setState("idle");
        }
      } catch (err) {
        if (isStoppingRef.current) return;
        setState("idle");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stop],
  );

  return { state, error, play, stop };
}
