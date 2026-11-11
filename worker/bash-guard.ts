export const BASH_DEFAULT_SECONDS = 20;
export const BASH_MAX_SECONDS = 600;

const SECRET_KEY = "access_token|refresh_token|id_token|accessToken|refreshToken|idToken";

/** Drop credential material from shell commands and output. Authorization links stay. */
export function hideSecrets(text: string) {
  return text
    .replace(new RegExp(`("?(?:${SECRET_KEY})"?\\s*[=:]\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi"), '$1"[已隐藏]"')
    .replace(new RegExp(`("?(?:${SECRET_KEY})"?\\s*[=:]\\s*)[^\\s,}\\]"']+`, "gi"), "$1[已隐藏]")
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [已隐藏]")
    .replace(/(访问令牌|刷新令牌)\s*[:：]\s*\S+/g, "$1：[已隐藏]");
}

/** Seconds for a bash run. Empty means the default. Null means the value is unusable. */
export function bashSeconds(input: unknown) {
  if (input === undefined || input === null || input === "") return BASH_DEFAULT_SECONDS;
  const seconds = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > BASH_MAX_SECONDS) return null;
  return seconds;
}
