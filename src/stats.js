// Turning a list of commands into a recap: what you ran, when, how often you
// mistyped it, and what that says about you.

import { redact, safe } from "./redact.js";

/** Commands common enough that a near miss is surely a typo of them. */
export const KNOWN = new Set(
  (
    "git ls cd cat echo grep rg find sed awk sort uniq head tail less more man mkdir rmdir rm cp mv touch " +
    "chmod chown ln pwd clear exit history which whoami sudo ssh scp rsync curl wget ping tar zip unzip gzip " +
    "make cmake gcc clang go cargo rustc rustup python python3 pip pip3 uv poetry node npm npx yarn pnpm bun deno " +
    "ruby gem bundle java javac mvn gradle kotlin swift docker podman kubectl helm terraform aws gcloud az " +
    "brew apt apt-get dnf yum pacman snap code vim nvim vi nano emacs hx micro subl tmux screen top htop btop " +
    "ps kill killall df du free open xdg-open pbcopy pbpaste diff patch export source alias unalias env set " +
    "jq yq fzf bat eza exa tree watch time date cal bc gh glab fd zsh bash fish sh dig nslookup lsof netstat " +
    "systemctl journalctl service mount umount chsh ssh-keygen gpg openssl psql mysql sqlite3 redis-cli mongosh " +
    "flutter dart php composer perl lua julia R conda jupyter pytest tox black ruff mypy eslint prettier tsc " +
    "vercel netlify heroku fly firebase supabase ollama ffmpeg convert magick yt-dlp nmap " +
    // real tools that sit one keystroke from another command
    "kubectx kubens k9s uvx pnpx gt lazygit tig zoxide z ll la nvm fnm pyenv rbenv asdf mise direnv just task"
  ).split(" "),
);

const PREFIXES = new Set(["sudo", "doas", "time", "nohup", "command", "builtin", "exec", "noglob", "nice", "caffeinate", "env"]);

const GROUPS = {
  git: ["git", "gh", "glab", "lazygit", "tig"],
  containers: ["docker", "docker-compose", "podman", "kubectl", "k9s", "helm", "minikube", "kind", "terraform"],
  navigation: ["cd", "ls", "ll", "la", "pwd", "tree", "eza", "exa", "z", "zoxide"],
  python: ["python", "python3", "pip", "pip3", "uv", "uvx", "poetry", "pytest", "jupyter", "conda", "ipython", "pipx"],
  javascript: ["node", "npm", "npx", "yarn", "pnpm", "bun", "deno", "tsc", "vite", "next"],
  rust: ["cargo", "rustc", "rustup"],
  go: ["go"],
  remote: ["ssh", "scp", "rsync", "mosh", "sftp"],
  editors: ["vim", "nvim", "vi", "nano", "emacs", "code", "subl", "hx", "micro", "cursor", "zed"],
};

const EDITORS = {
  vim: ["vim", "nvim", "vi"],
  nano: ["nano"],
  emacs: ["emacs"],
  "VS Code": ["code", "cursor"],
  Helix: ["hx"],
  Sublime: ["subl"],
  Zed: ["zed"],
  micro: ["micro"],
};

const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun", "pip", "pip3", "uv", "poetry", "brew", "apt", "apt-get", "dnf", "pacman", "cargo", "gem", "composer", "conda"];

/** Split a command line into the simple commands it runs. */
export function segments(cmd) {
  // a backslash at the end of a line continues the same command
  cmd = cmd.replace(/\s*\\\r?\n\s*/g, " ");
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === "|" || c === ";" || c === "\n" || (c === "&" && cmd[i + 1] === "&")) {
      if (c === "&" || (c === "|" && cmd[i + 1] === "|")) i++;
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The program a simple command runs, skipping `sudo`, `FOO=1` and the like. */
export function program(segment) {
  const words = segment.split(/\s+/);
  let i = 0;
  while (i < words.length && (PREFIXES.has(words[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i++;
  const word = words[i] || "";
  // flags, history expansion (!!, !$), and stray output pasted back ("cd:")
  if (!word || /^[-!#(){}[\]<>|&;=]/.test(word) || /[:'"`]$/.test(word)) return null;
  // /usr/bin/git -> git, but keep ./script.sh recognisable
  return word.startsWith("./") ? word : word.split("/").pop();
}

/** Damerau-Levenshtein distance (with adjacent swaps), capped for speed. */
export function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** What a mistyped program was meant to be, or null. */
export function typoOf(word, frequent) {
  if (KNOWN.has(word) || word.length < 2 || !/^[a-z][a-z0-9.-]*$/.test(word)) return null;
  let best = null;
  for (const target of [...KNOWN, ...frequent]) {
    if (target === word || target.length < 2) continue;
    const limit = target.length >= 6 ? 2 : 1;
    const d = distance(word, target);
    if (d <= limit && (!best || d < best.d)) best = { target, d };
  }
  return best ? best.target : null;
}

function count(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function top(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

const DAY = 86_400_000;

function localDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Build the recap. `year` limits it to one calendar year when the history
 * has timestamps; without timestamps everything is used.
 */
export function recap(entries, { year = null } = {}) {
  const timed = entries.filter((e) => e.time);
  const hasTime = entries.length > 0 && timed.length / entries.length >= 0.5;
  const scope = hasTime && year ? entries.filter((e) => e.time && e.time.getFullYear() === year) : entries;

  const programs = new Map();
  const gitSubs = new Map();
  const typos = new Map();
  let segmentsTotal = 0;
  let sudoBang = 0;
  let rmrf = 0;
  let clears = 0;
  let helps = 0;
  let longestPipe = { n: 0, cmd: "" };
  let longest = { n: 0, cmd: "" };

  for (const { cmd } of scope) {
    const segs = segments(cmd);
    const pipes = (cmd.match(/(^|[^|])\|(?!\|)/g) || []).length;
    if (pipes > longestPipe.n) longestPipe = { n: pipes, cmd };
    if (cmd.length > longest.n) longest = { n: cmd.length, cmd };
    if (/\bsudo\s+!!/.test(cmd)) sudoBang++;
    if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)\b/.test(cmd)) rmrf++;
    if (/(^|\s)(--help|-h)(\s|$)/.test(cmd) || /^man\s/.test(cmd)) helps++;
    for (const seg of segs) {
      const p = program(seg);
      if (!p) continue;
      segmentsTotal++;
      count(programs, p);
      if (p === "clear" || p === "cls") clears++;
      if (p === "git") {
        const sub = seg.split(/\s+/).slice(1).find((w) => !w.startsWith("-"));
        if (sub) count(gitSubs, sub);
      }
    }
  }

  // typos: rare words one keystroke away from something you use a lot
  const frequent = top(programs, 40).filter(([, n]) => n >= 3).map(([p]) => p);
  let typoTotal = 0;
  for (const [p, n] of programs) {
    const meant = typoOf(p, frequent);
    // a typo is occasional: something run often is a tool, not a slip
    const intended = programs.get(meant) || 0;
    if (meant && (n <= 2 ? intended >= n : n * 5 <= intended)) {
      typos.set(p, { meant, n });
      typoTotal += n;
    }
  }

  const share = (names) => names.reduce((s, p) => s + (programs.get(p) || 0), 0) / Math.max(1, segmentsTotal);
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([g, names]) => [g, share(names)]));

  const editorCounts = Object.entries(EDITORS)
    .map(([name, cmds]) => [name, cmds.reduce((s, c) => s + (programs.get(c) || 0), 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const packageManagers = PACKAGE_MANAGERS.map((p) => [p, programs.get(p) || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  // time of day, days of the week, streaks
  let time = null;
  const stamped = scope.filter((e) => e.time);
  if (hasTime && stamped.length) {
    const hours = Array(24).fill(0);
    const weekdays = Array(7).fill(0);
    const days = new Map();
    for (const { time: t } of stamped) {
      hours[t.getHours()]++;
      weekdays[t.getDay()]++;
      count(days, localDay(t));
    }
    const dayList = [...days.keys()].sort((a, b) => a - b);
    let streak = 1;
    let run = 1;
    for (let i = 1; i < dayList.length; i++) {
      run = dayList[i] - dayList[i - 1] === DAY ? run + 1 : 1;
      streak = Math.max(streak, run);
    }
    const [busiestDay, busiestCount] = top(days, 1)[0];
    const night = hours.slice(0, 5).reduce((a, b) => a + b, 0) / stamped.length;
    time = {
      hours,
      weekdays,
      busiestHour: hours.indexOf(Math.max(...hours)),
      busiestWeekday: weekdays.indexOf(Math.max(...weekdays)),
      nightShare: night,
      activeDays: days.size,
      longestStreak: streak,
      busiestDay: new Date(busiestDay).toISOString().slice(0, 10),
      busiestDayCount: busiestCount,
      first: new Date(dayList[0]).toISOString().slice(0, 10),
      last: new Date(dayList[dayList.length - 1]).toISOString().slice(0, 10),
    };
  }

  const stats = {
    year: hasTime && year ? year : null,
    hasTime,
    commands: scope.length,
    programsRun: segmentsTotal,
    unique: programs.size,
    // a pasted token run as a "command" must never reach the top list
    top: top(new Map([...programs].filter(([p]) => p.length <= 30 && redact(p) === p)), 10),
    git: top(gitSubs, 5),
    typos: [...typos.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([typo, { meant, n }]) => ({ typo, meant, n })),
    typoTotal,
    sudoBang,
    rmrf,
    clears,
    helps,
    longestPipe: longestPipe.n ? { pipes: longestPipe.n, cmd: safe(longestPipe.cmd, 70) } : null,
    longestLength: longest.n,
    editors: editorCounts,
    packageManagers,
    groups,
    time,
  };
  stats.persona = persona(stats);
  return stats;
}

const PERSONAS = [
  // [name, tagline, score (>= 1 qualifies; highest wins)]
  ["The Git Whisperer", "You and version control have an understanding.", (s) => s.groups.git / 0.2],
  ["The Container Captain", "If it doesn't run in a container, does it even run?", (s) => s.groups.containers / 0.1],
  ["The Night Owl", "Your best commits happen after midnight.", (s) => (s.time ? s.time.nightShare / 0.2 : 0)],
  ["The Pythonista", "import antigravity, probably.", (s) => s.groups.python / 0.15],
  ["The JavaScript Juggler", "node_modules is your second home.", (s) => s.groups.javascript / 0.15],
  ["The Rustacean", "Fighting the borrow checker, and winning.", (s) => s.groups.rust / 0.08],
  ["The Gopher", "if err != nil { keep going }", (s) => s.groups.go / 0.08],
  ["The Remote Operator", "Half your life is on someone else's machine.", (s) => s.groups.remote / 0.08],
  ["The Speed Typist", "Your fingers are faster than your spelling.", (s) => (s.typoTotal / Math.max(1, s.programsRun)) / 0.015],
  ["The Wanderer", "You explore the file system like it's a new city.", (s) => s.groups.navigation / 0.35],
];

export function persona(stats) {
  const scored = PERSONAS.map(([name, tagline, score]) => ({ name, tagline, score: score(stats) }))
    .filter((p) => p.score >= 1)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? { name: scored[0].name, tagline: scored[0].tagline } : { name: "The Generalist", tagline: "A little bit of everything, a master of the prompt." };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "3 pm", "midnight" */
export function hourName(h) {
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}
