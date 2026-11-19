import { parseRemoteSuggestions, suggestReplyJson, suggestRequestUrl, type RemoteSite, type RemoteSuggestions, type SearchEngine } from "./engines.ts";

type FetchResponse = { ok: boolean; text(): Promise<string> };
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponse>;

export type SuggestFetcher = {
  request(engine: SearchEngine, query: string, onResult: (suggestions: string[], sites: RemoteSite[]) => void): void;
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
  const cache = new Map<string, RemoteSuggestions>();
  const none: RemoteSuggestions = { queries: [], sites: [] };
  let pending: PendingRequest = { phase: "idle" };
  let generation = 0;

  const cancel = () => {
    generation++;
    if (pending.phase === "waiting") clearTimeout(pending.timer);
    if (pending.phase === "fetching") pending.controller.abort();
    pending = { phase: "idle" };
  };

  const remember = (url: string, suggestions: RemoteSuggestions) => {
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
        void Promise.resolve().then(() => current === generation && onResult(cached.queries, cached.sites));
        return;
      }
      const timer = setTimeout(() => {
        const controller = new AbortController();
        pending = { phase: "fetching", controller };
        fetch(url, { signal: controller.signal })
          .then(async (res): Promise<RemoteSuggestions | null> => {
            if (!res.ok) return null;
            try {
              return parseRemoteSuggestions(suggestReplyJson(await res.text()));
            } catch {
              return null;
            }
          })
          .then(
            (suggestions) => {
              if (controller.signal.aborted) return;
              if (suggestions) remember(url, suggestions);
              if (current === generation) {
                pending = { phase: "idle" };
                const answer = suggestions ?? none;
                onResult(answer.queries, answer.sites);
              }
            },
            () => {
              if (current === generation) pending = { phase: "idle" };
            },
          );
      }, delay);
      pending = { phase: "waiting", timer };
    },
  };
}
