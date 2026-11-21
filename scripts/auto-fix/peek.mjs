// データ更新の失敗を Claude が調べるときに、取得先の生の応答を見るための道具（.github/workflows/auto-fix-update-data.yml が使う）。
// 取得先として決まっているホストにしか繋がない。リダイレクトも 1 つずつ確かめてから辿る。
// 応答の本文は .auto-fix/peek/ に保存し、標準出力にはステータス・ヘッダー・保存先だけを出す。
//   使い方: node scripts/auto-fix/peek.mjs <URL> [--post '<JSON>']
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";

// scripts/fetch-*.mjs が読む先。GitHub API（トークンが要る）と Google（Secret が要る）は入れない
const HOSTS = new Set(["filmarks.com", "abstracted-lancer-5f0.notion.site"]);
const MAX_REDIRECTS = 5;
const MAX_BYTES = 2_000_000;

const [, , first, flag, data] = process.argv;
if (!first || (flag && flag !== "--post")) {
  console.error("使い方: node scripts/auto-fix/peek.mjs <URL> [--post '<JSON>']");
  process.exit(2);
}

function allowed(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    throw new Error(`繋げない URL: ${raw}（使えるのは https://${[...HOSTS].join(", https://")} だけ）`);
  }
  return url;
}

let url = allowed(first);
const init = flag === "--post"
  ? { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "my_room" }, body: JSON.stringify(JSON.parse(data)) }
  : { method: "GET", headers: { "User-Agent": "Mozilla/5.0" } };

let res;
for (let i = 0; ; i++) {
  res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) break;
  if (i >= MAX_REDIRECTS) throw new Error("リダイレクトが多すぎる");
  console.log(`${res.status} → ${location}`);
  url = allowed(new URL(location, url).href);
  if (res.status === 303) Object.assign(init, { method: "GET", body: undefined });
}

const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BYTES);
mkdirSync(".auto-fix/peek", { recursive: true });
const file = `.auto-fix/peek/${String(readdirSync(".auto-fix/peek").length + 1).padStart(2, "0")}.txt`;
writeFileSync(file, buf);

console.log(`${init.method} ${url.href}`);
console.log(`HTTP ${res.status} ${res.statusText}`);
for (const [k, v] of res.headers) if (k !== "set-cookie") console.log(`${k}: ${v}`);
console.log(`本文 ${buf.length} バイト → ${file}`);
