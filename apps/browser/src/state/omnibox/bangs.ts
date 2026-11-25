import { bangDocument, bangTable, checkedBangTable, findBang, joinBangTables, readBangDocument, slimBangs, type BangTable } from "@ardia/core";
import { fetchBangList, readDocument, saveDocument, writeDocument } from "../../platform/documents";
import { useEffect, useSyncExternalStore } from "react";
import { loadBundledBangs, refreshesBangs } from "./bangPlatform";
import { parseSaved, unchanged, versionedJson, type Migrations } from "../../lib/savedDocument";

const LIST_DOC = "bangs.txt";
const STATE_DOC = "bangs-state.json";
const STATE_VERSION = 1;
const STATE_MIGRATIONS: Migrations = { 0: unchanged };
const REFRESH_EVERY_MS = 86_400_000;

type RefreshState = { checkedAt: number };
type BangRefresh = { at: number; status: number | "skipped" | "failed"; result: "updated" | "unchanged" | "failed" | "fresh" };

type Loaded = { phase: "empty" } | { phase: "loaded"; table: BangTable; source: "bundled" } | { phase: "loaded"; table: BangTable; source: "stored" | "fetched"; etag: string | null };

let bangs: Loaded = { phase: "empty" };
let loading: Promise<BangTable> | null = null;
let refreshing: Promise<BangRefresh> | null = null;
const refreshes: BangRefresh[] = [];
const listeners = new Set<() => void>();

function setTable(next: Exclude<Loaded, { phase: "empty" }>) {
  bangs = next;
  for (const listener of listeners) listener();
}

const loadedTable = () => (bangs.phase === "loaded" ? bangs.table : null);

function readState(): RefreshState | null {
  try {
    const state = parseSaved(readDocument(STATE_DOC), STATE_VERSION, STATE_MIGRATIONS) as Partial<RefreshState> | null;
    return state && typeof state.checkedAt === "number" ? { checkedAt: state.checkedAt } : null;
  } catch {
    return null;
  }
}

function writeState(state: RefreshState) {
  try {
    writeDocument(STATE_DOC, versionedJson(state, STATE_VERSION));
  } catch {}
}

function storedList(): { etag: string | null; table: BangTable } | null {
  try {
    return readBangDocument(readDocument(LIST_DOC));
  } catch {
    return null;
  }
}

export function loadBangs(): Promise<BangTable> {
  const ready = loadedTable();
  if (ready) return Promise.resolve(ready);
  return (loading ??= (async () => {
    const stored = storedList();
    if (stored) {
      if (bangs.phase === "empty") setTable({ phase: "loaded", table: stored.table, source: "stored", etag: stored.etag });
      return loadedTable()!;
    }
    const { BANG_LIST, BANG_LIST_UNICODE } = await loadBundledBangs();
    if (bangs.phase === "empty") setTable({ phase: "loaded", table: joinBangTables([bangTable(BANG_LIST), bangTable(BANG_LIST_UNICODE)]), source: "bundled" });
    return loadedTable()!;
  })());
}

export function bangsFor(text: string): BangTable | null {
  if (bangs.phase === "empty" && text.includes("!")) void loadBangs();
  return loadedTable();
}

const BANG_WORD = /^![^\s!]+$/;

export function mayBeBang(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.includes("!") || trimmed.startsWith("?")) return false;
  const words = trimmed.split(/\s+/);
  return BANG_WORD.test(words[0]!) || BANG_WORD.test(words[words.length - 1]!);
}

const BANG_ENTER_TIMEOUT_MS = 1500;

type BangSubmitter = { submit(text: string, commit: (url: string | null) => void): void; cancel(): void };

export function createBangSubmitter(load: () => Promise<BangTable> = loadBangs, timeoutMs = BANG_ENTER_TIMEOUT_MS): BangSubmitter {
  let current = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    current++;
    clearTimeout(timer);
  };
  return {
    cancel,
    submit(text, commit) {
      cancel();
      const mine = current;
      const finish = (url: string | null) => {
        if (mine !== current) return;
        cancel();
        commit(url);
      };
      timer = setTimeout(() => finish(null), timeoutMs);
      let loaded: Promise<BangTable>;
      try {
        loaded = load();
      } catch {
        return finish(null);
      }
      loaded.then(
        (table) => finish(findBang(text, table)?.url ?? null),
        () => finish(null),
      );
    },
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const currentTable = loadedTable;

export function useBangs(typed: boolean): BangTable | null {
  const current = useSyncExternalStore(subscribe, currentTable);
  useEffect(() => {
    if (!typed) return;
    void loadBangs();
    void refreshBangsOnce();
  }, [typed]);
  return typed ? current : null;
}

export function refreshBangsOnce(): Promise<BangRefresh> {
  return (refreshing ??= refreshBangs());
}

export async function refreshBangs(): Promise<BangRefresh> {
  const now = Date.now();
  const note = (status: BangRefresh["status"], result: BangRefresh["result"]): BangRefresh => {
    const entry = { at: now, status, result };
    refreshes.push(entry);
    return entry;
  };
  if (!refreshesBangs) return note("skipped", "fresh");
  const stored = readState();
  if (stored && now >= stored.checkedAt && now - stored.checkedAt < REFRESH_EVERY_MS) return note("skipped", "fresh");
  try {
    await loadBangs();
    const etag = bangs.phase !== "loaded" ? null : bangs.source === "bundled" ? (await loadBundledBangs()).BANG_LIST_ETAG : bangs.etag;
    const request = fetchBangList(etag);
    writeState({ checkedAt: now });
    const reply = await request;
    if (reply.status === 304) return note(304, "unchanged");
    if (reply.status !== 200 || !reply.body || !/json/i.test(reply.contentType ?? "")) return note(reply.status, "failed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const slim = slimBangs(reply.body);
    const next = slim && checkedBangTable(slim);
    if (!slim || !next) return note(reply.status, "failed");
    await saveDocument(LIST_DOC, bangDocument(reply.etag, slim));
    setTable({ phase: "loaded", table: next, source: "fetched", etag: reply.etag });
    return note(reply.status, "updated");
  } catch {
    return note("failed", "failed");
  }
}

export const bangStatus = () => ({
  loaded: bangs.phase === "loaded",
  source: bangs.phase === "loaded" ? bangs.source : null,
  size: loadedTable()?.size ?? 0,
  etag: bangs.phase === "loaded" && bangs.source !== "bundled" ? bangs.etag : null,
  refreshes: refreshes.slice(),
  state: readState(),
});

export function resetBangsForTests() {
  bangs = { phase: "empty" };
  loading = null;
  refreshing = null;
  refreshes.length = 0;
}
