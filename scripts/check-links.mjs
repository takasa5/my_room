// ページに載せている公開 Notion サイト（*.notion.site）へのリンクが、ログインなしで開けるかを確かめる。
// Notion サイトは画面を JavaScript で描くので、公開していないページでも HTTP 200 が返り、ステータスでは見分けられない。
// そこで、公開サイトが使う API（syncRecordValuesMain）にトークンなしでページを問い合わせる。
// 公開していない・削除したページはブロックの中身が返ってこない（fetch-lives.mjs などと同じ非公式の API）。
//   使い方: node scripts/check-links.mjs [壊れたリンクの一覧を書き出すファイル]
// 終了コード: 0 = すべて開ける / 1 = 開けないリンクがある（一覧を書き出す） / 2 = 確かめられなかった（通信の失敗など）
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const report = process.argv[2];

// ページが読むファイル（ルートの .js と index.html）から Notion サイトの URL を集める。
// 画像（/image/...）はページではないので見ない
const files = readdirSync(root).filter((f) => f.endsWith(".js") || f === "index.html").sort();
const URL_RE = /https:\/\/([a-z0-9-]+\.notion\.site)\/(?!image\/)[^\s"'`<>?#]*?([0-9a-f]{32})(?=[\s"'`<>?#]|$)/g;
const links = new Map();   // ブロックの ID（ハイフン付き）→ { host, url, files }
for (const f of files) {
  for (const m of readFileSync(new URL(f, root), "utf8").matchAll(URL_RE)) {
    const hex = m[2];
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const link = links.get(id) || { host: m[1], url: m[0], files: new Set() };
    link.files.add(f);
    links.set(id, link);
  }
}
if (!links.size) {
  console.error("Error: Notion サイトへのリンクが 1 つも見つからない（ファイルの形が変わった？）");
  process.exit(2);
}

// recordMap の値は { value: {...} } か { value: { value: {...} } } のどちらかで来る
const unwrap = (r) => (r && r.value && r.value.value) || (r && r.value);

const broken = [];
const byHost = Map.groupBy([...links], ([, l]) => l.host);
try {
  for (const [host, entries] of byHost) {
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      const res = await fetch(`https://${host}/api/v3/syncRecordValuesMain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "my_room" },
        body: JSON.stringify({ requests: chunk.map(([id]) => ({ pointer: { table: "block", id }, version: -1 })) }),
      });
      if (!res.ok) throw new Error(`Notion: HTTP ${res.status}`);
      const blocks = (await res.json()).recordMap?.block || {};
      for (const [id, link] of chunk) {
        // 公開していないページは { value: { role: "none" } } だけが返り、ブロックの中身（id など）がない
        const b = unwrap(blocks[id]);
        if (b?.id !== id || b.alive === false) broken.push(link);
      }
    }
  }
} catch (e) {
  console.error(`Error: リンクを確かめられなかった: ${e.message}`);
  process.exit(2);
}

console.log(`Notion サイトへのリンク ${links.size} 本のうち、開けないもの ${broken.length} 本`);
if (!broken.length) process.exit(0);

const lines = broken.map((l) => `- ${l.url}（${[...l.files].join("・")}）`);
for (const line of lines) console.log(line);
if (report) writeFileSync(report, lines.join("\n") + "\n");
process.exit(1);
