// Reading shell history files: zsh, bash, fish and PowerShell.
// Each parser returns [{ cmd, time }] where time is a Date or null.

/**
 * zsh "metafies" bytes it treats specially: 0x83 followed by a byte
 * XOR 32. Undo that before decoding UTF-8, or non-ASCII text turns to junk.
 */
export function unmetafy(bytes) {
  const out = new Uint8Array(bytes.length);
  let j = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x83 && i + 1 < bytes.length) {
      out[j++] = bytes[++i] ^ 32;
    } else {
      out[j++] = bytes[i];
    }
  }
  return out.subarray(0, j);
}

export function decode(bytes, shell) {
  const data = shell === "zsh" ? unmetafy(bytes) : bytes;
  return new TextDecoder("utf-8").decode(data);
}

/** Join lines that end in `continuation` with the line after them. */
function joinContinued(lines, continuation) {
  const out = [];
  let current = null;
  for (const line of lines) {
    current = current === null ? line : `${current}\n${line}`;
    if (!current.endsWith(continuation)) {
      out.push(current);
      current = null;
    }
  }
  if (current !== null) out.push(current);
  return out;
}

const seconds = (s) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

/** zsh: plain lines, or the extended form ": 1700000000:0;command". */
export function parseZsh(text) {
  text = text.replace(/\r\n/g, "\n");
  const out = [];
  for (const entry of joinContinued(text.split("\n"), "\\")) {
    const m = /^: (\d+):\d+;([\s\S]*)$/.exec(entry);
    if (m) out.push({ cmd: m[2], time: seconds(m[1]) });
    else if (entry.trim()) out.push({ cmd: entry, time: null });
  }
  return out;
}

/** bash: plain lines, each optionally preceded by "#1700000000" (HISTTIMEFORMAT). */
export function parseBash(text) {
  text = text.replace(/\r\n/g, "\n");
  const out = [];
  let time = null;
  for (const line of text.split("\n")) {
    const stamp = /^#(\d{9,11})$/.exec(line);
    if (stamp) {
      time = seconds(stamp[1]);
      continue;
    }
    if (line.trim()) out.push({ cmd: line, time });
    time = null;
  }
  return out;
}

/** fish: a YAML-like list of "- cmd: ..." entries with "when:" stamps. */
export function parseFish(text) {
  text = text.replace(/\r\n/g, "\n");
  const out = [];
  let current = null;
  for (const line of text.split("\n")) {
    const cmd = /^- cmd: (.*)$/.exec(line);
    if (cmd) {
      if (current) out.push(current);
      const unescaped = cmd[1].replace(/\\(n|\\)/g, (_, c) => (c === "n" ? "\n" : "\\"));
      current = { cmd: unescaped, time: null };
      continue;
    }
    const when = /^ {2}when: (\d+)$/.exec(line);
    if (when && current) current.time = seconds(when[1]);
  }
  if (current) out.push(current);
  return out;
}

/** PowerShell (PSReadLine): plain lines, with a trailing backtick continuing a line. */
export function parsePowerShell(text) {
  return joinContinued(text.replace(/\r\n/g, "\n").split("\n"), "`")
    .filter((l) => l.trim())
    .map((cmd) => ({ cmd, time: null }));
}

/** Guess the format from the contents. */
export function detect(text) {
  if (/^- cmd: /m.test(text)) return "fish";
  if (/^: \d+:\d+;/m.test(text)) return "zsh";
  if (/^#\d{9,11}$/m.test(text)) return "bash";
  return "plain";
}

export function parse(text, shell = detect(text)) {
  switch (shell) {
    case "fish":
      return parseFish(text);
    case "zsh":
      return parseZsh(text);
    case "powershell":
      return parsePowerShell(text);
    default:
      return parseBash(text);
  }
}
