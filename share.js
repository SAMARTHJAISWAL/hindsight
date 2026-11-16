// Packing a recap into a link. The recap goes in the URL fragment (after
// "#"), which browsers never send to the server: the card page reads it
// locally. Only aggregate numbers and already-redacted snippets are packed.

export function pack(stats) {
  const card = {
    v: 1,
    y: stats.year,
    c: stats.commands,
    u: stats.unique,
    top: stats.top.slice(0, 5),
    git: stats.git.slice(0, 3),
    ty: stats.typos.slice(0, 1),
    tt: stats.typoTotal,
    t: stats.time && {
      h: stats.time.busiestHour,
      w: stats.time.busiestWeekday,
      s: stats.time.longestStreak,
      d: stats.time.activeDays,
      n: Math.round(stats.time.nightShare * 100),
      hs: stats.time.hours,
    },
    f: { sb: stats.sudoBang, rr: stats.rmrf, cl: stats.clears },
    ed: stats.editors[0] || null,
    p: stats.persona,
  };
  const json = JSON.stringify(card);
  const b64 = typeof Buffer !== "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unpack(fragment) {
  const b64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const card = JSON.parse(new TextDecoder().decode(bytes));
  if (card.v !== 1) throw new Error("unknown card version");
  return card;
}

/** The card's shape from a full recap (used by the page itself). */
export function cardOf(stats) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pack(stats).replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0))));
}
