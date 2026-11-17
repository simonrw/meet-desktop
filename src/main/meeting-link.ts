/**
 * The custom URL scheme that opens a meeting in the app, as in `meet-desktop://abc-defg-hij`.
 */
export const URL_SCHEME = "meet-desktop";

const MEET_HOST = "meet.google.com";
const CODE = /^([a-z]{3})-?([a-z]{4})-?([a-z]{3})$/i;

/**
 * Reads the meeting code, as `abc-defg-hij`, from a bare meeting code, a Meet link or a URL in the app's own scheme.
 * Returns `undefined` for anything else.
 */
export function parseMeetingCode(input: string): string | undefined {
  const text = input.trim();

  return normalisedCode(text) ?? codeFromUrl(text);
}

function codeFromUrl(text: string): string | undefined {
  const url = parseUrl(text) ?? parseUrl(`https://${text}`);
  if (url === undefined) {
    return undefined;
  }

  if (url.protocol === `${URL_SCHEME}:`) {
    return normalisedCode(url.host + url.pathname.replace(/\/$/, ""));
  }

  if ((url.protocol === "https:" || url.protocol === "http:") && url.host === MEET_HOST) {
    return normalisedCode(url.pathname.replace(/^\//, "").replace(/\/$/, ""));
  }

  return undefined;
}

function normalisedCode(text: string): string | undefined {
  const match = CODE.exec(text);

  return match ? match.slice(1).join("-").toLowerCase() : undefined;
}

function parseUrl(text: string): URL | undefined {
  return URL.canParse(text) ? new URL(text) : undefined;
}
