import { RawAudio } from "@huggingface/transformers";
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";
const SAMPLE_RATE = 24000;

let tts: KokoroTTS | null = null;
let initPromise: Promise<KokoroTTS> | null = null;

async function detectWebGPU(): Promise<boolean> {
  try {
    const gpu = (
      navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

function getTTS(): Promise<KokoroTTS> {
  if (tts) return Promise.resolve(tts);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const useWebGPU = await detectWebGPU();
    const device = useWebGPU ? "webgpu" : "wasm";
    const dtype = useWebGPU ? "fp32" : "q8";
    const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
    });
    tts = instance;
    return instance;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

// Preload model on module import
getTTS().catch(() => {});

export async function speak(text: string): Promise<ArrayBuffer> {
  const engine = await getTTS();

  // Work around kokoro-js v1.2.1 bug: stream(string) creates a
  // TextSplitterStream internally but never calls close(), causing
  // the for-await loop to hang forever. We create the splitter
  // ourselves and call close() explicitly.
  const splitter = new TextSplitterStream();
  const stream = engine.stream(splitter, { voice: DEFAULT_VOICE });

  splitter.push(text);
  splitter.close();

  const chunks: Float32Array[] = [];
  for await (const { audio } of stream) {
    chunks.push(audio.audio);
  }

  if (chunks.length === 0) {
    throw new Error("No audio generated");
  }

  // Concatenate all chunks into a single waveform
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const waveform = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    waveform.set(chunk, offset);
    offset += chunk.length;
  }

  return new RawAudio(waveform, SAMPLE_RATE).toWav();
}
