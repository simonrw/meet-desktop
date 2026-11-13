const GOOGLE_SIGN_IN_ORIGIN = "https://accounts.google.com";

/**
 * Decides whether a URL belongs in the Meeting Window (Meet or Google sign-in) rather than the default browser.
 */
export function isInAppUrl(url: string, meetOrigin: string): boolean {
  return isMeetUrl(url, meetOrigin) || originOf(url) === GOOGLE_SIGN_IN_ORIGIN;
}

/**
 * Reports whether a URL is on the Meet origin.
 */
export function isMeetUrl(url: string, meetOrigin: string): boolean {
  return originOf(url) === meetOrigin;
}

function originOf(url: string): string | undefined {
  return URL.canParse(url) ? new URL(url).origin : undefined;
}
