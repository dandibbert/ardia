const LITTLE_ARDIA_LINK_PAGE = "chrome-extension://dlgbgbembiiiodfifcoggapmacjghalf/open.html#";

export function littleArdiaLinkOf(url: string): string | null {
  if (!url.startsWith(LITTLE_ARDIA_LINK_PAGE)) return null;
  try {
    const link = decodeURIComponent(url.slice(LITTLE_ARDIA_LINK_PAGE.length));
    return /^https?:\/\//i.test(link) ? link : null;
  } catch {
    return null;
  }
}
