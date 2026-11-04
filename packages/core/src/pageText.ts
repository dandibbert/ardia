import { hostOf, urlForDisplay } from "./omnibox.ts";

export function displayUrl(url: string): string {
  return urlForDisplay(url).replace(/\/$/, "");
}

export const pageKey = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "");

export type PageText = {
  url: string;
  key: string;
  shown: string;
  shownLower: string;
  titleLower: string;
  titleWords: string;
  shownWords?: string;
  shownBlank?: boolean;
  host?: string;
  origin?: string | null;
  hostLower?: string;
};

const PAGE_TEXT = Symbol("pageText");
type WithPageText = { [PAGE_TEXT]?: PageText };
const frozenPageTexts = new WeakMap<object, PageText>();

const cachedPageText = (row: object): PageText | undefined => (row as WithPageText)[PAGE_TEXT] ?? frozenPageTexts.get(row);

export const hasPageText = (row: object) => cachedPageText(row) !== undefined;

function rememberPageText(row: object, text: PageText) {
  if (Object.isExtensible(row)) Object.defineProperty(row, PAGE_TEXT, { value: text, configurable: true });
  else frozenPageTexts.set(row, text);
}

const logVisitsOf: number[] = [];
export const logVisits = (visits: number) => (visits >= 0 && visits < 1024 && (visits | 0) === visits ? (logVisitsOf[visits] ??= Math.log2(1 + visits) * 8) : Math.log2(1 + visits) * 8);

const NOT_WORD = /[^a-z0-9]+/g;
const PLAIN_WORDS = /^[a-z0-9]+(?: [a-z0-9]+)*$/;
const wordsOf = (lower: string) => (PLAIN_WORDS.test(lower) ? ` ${lower}` : ` ${lower}`.replace(NOT_WORD, " "));
export const shownWordsOf = (t: PageText) => (t.shownWords ??= wordsOf(t.shownLower));

export function pageText(row: { url: string; title: string }): PageText {
  let text = cachedPageText(row);
  if (!text) {
    const shown = displayUrl(row.url);
    const shownLower = shown.toLowerCase();
    const titleLower = row.title.toLowerCase();
    text = { url: row.url, key: pageKey(row.url), shown, shownLower, titleLower, titleWords: wordsOf(titleLower) };
    rememberPageText(row, text);
  }
  return text;
}

export const hostOfPage = (t: PageText) => (t.host ??= hostOf(t.url));
export const hostPart = (shown: string) => /^[^/?#]*/.exec(shown)![0];
export const hostLowerOfPage = (t: PageText) => (t.hostLower ??= hostPart(t.shownLower));
export const originOfPage = (t: PageText) => (t.origin === undefined ? (t.origin = /^https?:\/\/[^/?#]+/i.exec(t.url)?.[0] ?? null) : t.origin);
