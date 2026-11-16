// The hindsight page: draw a card from a link, or from pasted history.
// Everything happens in this browser tab; nothing is sent anywhere.
import { decode, detect, parse } from "./parse.js";
import { recap } from "./stats.js";
import { drawCard } from "./card.js";
import { cardOf, pack, unpack } from "./share.js";

const $ = (id) => document.getElementById(id);
const n = (x) => x.toLocaleString("en-US");

function summary(card) {
  const parts = [`My ${card.y || "life"} in the terminal: ${n(card.c)} commands`];
  if (card.top[0]) parts.push(`top command ${card.top[0][0]}`);
  if (card.ty?.length) parts.push(`typed ${card.ty[0].typo} ${n(card.ty[0].n)}×`);
  return `${parts.join(", ")}. I'm ${card.p.name}. Get yours: npx github:SAMARTHJAISWAL/hindsight`;
}

function show(card, own) {
  $("card-view").hidden = false;
  $("paste-view").hidden = !own;
  drawCard($("card"), card);
  const link = `${location.origin}${location.pathname}`;
  $("post").href = `https://x.com/intent/post?text=${encodeURIComponent(summary(card))}&url=${encodeURIComponent(link)}`;
  $("mine").hidden = own;
  $("card-view").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------

$("download").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "hindsight.png";
  a.href = $("card").toDataURL("image/png");
  a.click();
});

let current = null;

$("copy-text").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(summary(current));
    $("copy-text").textContent = "Copied";
  } catch {
    $("copy-text").textContent = "Couldn't copy";
  }
});

$("copy-cmd").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("cmd").textContent);
    $("copy-cmd").textContent = "Copied";
  } catch {
    // select it so it can be copied by hand
    getSelection().selectAllChildren($("cmd"));
  }
});

function status(text, bad = false) {
  $("status").textContent = text;
  $("status").classList.toggle("bad", bad);
}

function makeFrom(text, shell) {
  const entries = parse(text, shell);
  if (!entries.length) {
    status("That doesn't look like a shell history. Paste the contents of your history file.", true);
    return;
  }
  const year = new Date().getFullYear();
  let stats = recap(entries, { year });
  if (stats.hasTime && stats.commands === 0) stats = recap(entries, { year: null });
  current = cardOf(stats);
  // a link to this card, with the data after the # (never sent to a server)
  ownHash = `#${pack(stats)}`;
  history.replaceState(null, "", ownHash);
  status(`${n(stats.commands)} commands read${stats.hasTime ? "" : " (no timestamps, so this covers all your history)"}.`);
  show(current, true);
}

$("make").addEventListener("click", () => makeFrom($("paste").value));

async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const asText = new TextDecoder().decode(bytes);
  const shell = /zsh/i.test(file.name) ? "zsh" : /ConsoleHost/i.test(file.name) ? "powershell" : detect(asText);
  makeFrom(decode(bytes, shell), shell);
}

$("file").addEventListener("change", (e) => e.target.files[0] && readFile(e.target.files[0]));
const area = $("paste");
area.addEventListener("dragover", (e) => {
  e.preventDefault();
  area.classList.add("over");
});
area.addEventListener("dragleave", () => area.classList.remove("over"));
area.addEventListener("drop", (e) => {
  e.preventDefault();
  area.classList.remove("over");
  if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
});

// a card link: hindsight.../#<data>
let ownHash = "";
function fromHash() {
  if (location.hash.length <= 1 || location.hash === ownHash) return;
  try {
    current = unpack(location.hash.slice(1));
    show(current, false);
  } catch {
    status("That card link looks broken. Make a new one below.", true);
  }
}
window.addEventListener("hashchange", fromHash);
fromHash();
