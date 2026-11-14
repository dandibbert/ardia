import { parseSuggestions, suggestReplyJson, suggestRequestUrl, type SearchEngine } from "./engines.ts";

type FetchResponse = { ok: boolean; text(): Promise<string> };
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponse>;

export type SuggestFetcher = {
  request(engine: SearchEngine, query: string, onResult: (suggestions: string[]) => void): void;
  cancel(): void;
};

type PendingRequest =
  | { phase: "idle" }
  | { phase: "waiting"; timer: ReturnType<typeof setTimeout> }
  | { phase: "fetching"; controller: AbortController };

export function createSuggestFetcher({
  fetch,
  delay = 120,
  cacheSize = 64,
}: {
  fetch: FetchLike;
  delay?: number;
  cacheSize?: number;
}): SuggestFetcher {
  const cache = new Map<string, string[]>();
  let pending: PendingRequest = { phase: "idle" };
  let generation = 0;

  const cancel = () => {
    generation++;
    if (pending.phase === "waiting") clearTimeout(pending.timer);
    if (pending.phase === "fetching") pending.controller.abort();
    pending = { phase: "idle" };
  };

  const remember = (url: string, suggestions: string[]) => {
    cache.delete(url);
    cache.set(url, suggestions);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
  };

  return {
    cancel,
    request(engine, query, onResult) {
      cancel();
      const url = suggestRequestUrl(engine, query);
      if (!url) return;
      const current = generation;
      const cached = cache.get(url);
      if (cached) {
        void Promise.resolve().then(() => current === generation && onResult(cached));
        return;
      }
      const timer = setTimeout(() => {
        const controller = new AbortController();
        pending = { phase: "fetching", controller };
        fetch(url, { signal: controller.signal })
          .then(async (res) => {
            if (!res.ok) return [];
            try {
              return parseSuggestions(suggestReplyJson(await res.text()));
            } catch {
              return [];
            }
          })
          .then(
            (suggestions) => {
              if (controller.signal.aborted) return;
              remember(url, suggestions);
              if (current === generation) {
                pending = { phase: "idle" };
                onResult(suggestions);
              }
            },
            () => {},
          );
      }, delay);
      pending = { phase: "waiting", timer };
    },
  };
}
