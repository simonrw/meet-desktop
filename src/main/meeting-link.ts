/**
 * The custom URL scheme that opens a meeting in the app, as in `meet-desktop://abc-defg-hij`.
 */
export const URL_SCHEME = "meet-desktop";

/**
 * A meeting to open: its Meeting Code, as `abc-defg-hij`, and the Google account to open it under, when a Meet link
 * picked one.
 */
export interface MeetingLink {
  code: string;
  authuser?: string;
}

const MEET_HOST = "meet.google.com";
const CODE = /^([a-z]{3})-?([a-z]{4})-?([a-z]{3})$/i;

/**
 * Reads the meeting from a bare Meeting Code, a Meet link or a URL in the app's own scheme. Returns `undefined` for
 * anything else.
 */
export function parseMeetingLink(input: string): MeetingLink | undefined {
  const text = input.trim();
  const code = normalisedCode(text);

  return code !== undefined ? { code } : linkFromUrl(text);
}

/**
 * Returns the URL of the meeting's page on the given Meet origin.
 */
export function meetingUrl(link: MeetingLink, meetOrigin: string): string {
  const url = new URL(link.code, meetOrigin);
  if (link.authuser !== undefined) {
    url.searchParams.set("authuser", link.authuser);
  }

  return url.href;
}

function linkFromUrl(text: string): MeetingLink | undefined {
  const url = parseUrl(text) ?? parseUrl(`https://${text}`);
  if (url === undefined) {
    return undefined;
  }

  let code: string | undefined;
  if (url.protocol === `${URL_SCHEME}:`) {
    code = normalisedCode(url.host + url.pathname.replace(/\/$/, ""));
  } else if ((url.protocol === "https:" || url.protocol === "http:") && url.host === MEET_HOST) {
    code = normalisedCode(url.pathname.replace(/^\//, "").replace(/\/$/, ""));
  }

  if (code === undefined) {
    return undefined;
  }

  const authuser = url.searchParams.get("authuser");
  return authuser === null ? { code } : { code, authuser };
}

function normalisedCode(text: string): string | undefined {
  const match = CODE.exec(text);

  return match ? match.slice(1).join("-").toLowerCase() : undefined;
}

function parseUrl(text: string): URL | undefined {
  return URL.canParse(text) ? new URL(text) : undefined;
}
