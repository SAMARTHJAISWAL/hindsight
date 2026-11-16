// Removing secrets from commands before anything is shown or shared.
// Shell history is full of tokens, passwords and keys. hindsight only ever
// displays a few short snippets, and every one goes through redact() first.

const HIDE = "•••";

const PATTERNS = [
  // credentials inside URLs: https://user:password@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${HIDE}@`],
  // Authorization headers and bearer tokens
  [/(authorization\s*:\s*)(bearer|basic|token)?\s*[^\s'"]+/gi, `$1${HIDE}`],
  [/\b(bearer)\s+[a-z0-9._~+/=-]{8,}/gi, `$1 ${HIDE}`],
  // well-known token formats
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, HIDE], // GitHub
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, HIDE],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, HIDE], // OpenAI, Anthropic and others
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, HIDE], // AWS access key ids
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, HIDE], // Slack
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, HIDE], // Google API keys
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g, HIDE], // Stripe
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, HIDE], // JWT
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, HIDE],
  // NAME=value where the name sounds secret
  [/\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASS(?:WORD)?|PWD|AUTH|CREDENTIALS?|PRIVATE|SESSION|COOKIE)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi, `$1=${HIDE}`],
  // --password X, --token=X, --api-key X, --secret X ...
  [/(--?(?:password|passwd|pass|token|secret|api[-_]?key|access[-_]?key|auth|client[-_]?secret|private[-_]?key)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, `$1${HIDE}`],
  // mysql -pPASSWORD (no space)
  [/(\bmysql\b[^|;&]*\s-p)(\S+)/gi, `$1${HIDE}`],
  // e-mail addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, HIDE],
  // long random-looking strings (hex, base64): likely keys or hashes
  [/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g, HIDE],
];

/** Home folders reveal your username: /Users/alex/code -> ~/code */
const HOME = /(?:\/Users|\/home)\/[^/\s'"]+|C:\\Users\\[^\\\s'"]+/gi;

export function redact(cmd) {
  let out = cmd.replace(HOME, "~");
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}

/** Shorten for display, cutting at a word boundary when possible. */
export function shorten(text, max = 64) {
  const one = text.replace(/\s*\n\s*/g, " ⏎ ");
  if (one.length <= max) return one;
  const cut = one.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** A command made safe to show: secrets removed, then shortened. */
export function safe(cmd, max = 64) {
  return shorten(redact(cmd), max);
}
