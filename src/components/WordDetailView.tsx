import { Loader2 } from "lucide-react";
import type { WordDetailResult } from "@/types";

function HighlightWord({ text, word }: { text: string; word: string }) {
  const regex = new RegExp(`(${word.replace(/-/g, "\\-")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part) =>
        regex.test(part) ? (
          <span key={`bold-${part}`} className="font-bold">
            {part}
          </span>
        ) : (
          <span key={`text-${part}`}>{part}</span>
        ),
      )}
    </>
  );
}

export function WordDetailView({
  result,
  isLoading,
}: {
  result: WordDetailResult;
  isLoading?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
      {/* Translation header */}
      <div>
        <p className="text-2xl font-bold">{result.translation}</p>
        <p className="text-sm text-muted-foreground">{result.word}</p>
      </div>

      {/* Parts of speech */}
      {result.partsOfSpeech.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.partsOfSpeech.map((pos) => (
            <span
              key={pos.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm"
            >
              <span className="whitespace-nowrap font-medium">{pos.name}</span>
              <span className="text-muted-foreground">{pos.meaning}</span>
            </span>
          ))}
        </div>
      )}

      {/* Example sentences */}
      {result.examples.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.examples.map((ex) => (
            <div key={ex.en} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-sm">
                <HighlightWord text={ex.en} word={result.word} />
              </p>
              <p className="text-sm text-muted-foreground">{ex.ja}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
