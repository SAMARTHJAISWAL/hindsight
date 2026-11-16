// Assemble the static site in _site/: the page plus the same modules the
// command line uses. No bundler: the browser loads the ES modules directly.
import { cp, mkdir, rm } from "node:fs/promises";

const out = new URL("../_site/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ["index.html", "style.css", "app.js", "card.js", "og.png", "vercel.json"]) {
  await cp(new URL(`../web/${f}`, import.meta.url), new URL(f, out)).catch((e) => {
    if (!["og.png", "vercel.json"].includes(f)) throw e;
  });
}
for (const f of ["parse.js", "stats.js", "redact.js", "share.js"]) {
  await cp(new URL(`../src/${f}`, import.meta.url), new URL(f, out));
}
console.log("built _site/");
