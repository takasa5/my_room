// Notion の Paper Diary（紙の日記を 1 ページずつ撮った写真のギャラリー）を取ってきて diary.js に書き出す。
// 公開している Notion サイト（*.notion.site）が使う API を、トークンなしで読む（fetch-posts.mjs と同じ）。
// 公式の API ではないので、Notion 側が変わると取れなくなることがある。そのときは前日の diary.js のまま残る。
//   使い方: node scripts/fetch-diary.mjs [画像の幅（px）]
import { writeFileSync } from "node:fs";

const SITE = "https://abstracted-lancer-5f0.notion.site";
const COLLECTION = "18d8baf3-c04b-80fd-8d2e-000b84bc6617";     // Paper Diary のデータソース
const VIEW = "18d8baf3-c04b-8086-ac9a-000cfd4fe4d2";           // ギャラリーのビュー（Start の古い順）
const LIST = `${SITE}/18d8baf3c04b805e985edbd3783acc22?v=18d8baf3c04b8086ac9a000cfd4fe4d2`;
const width = Number(process.argv[2]) || 800;

async function api(endpoint, body) {
  const res = await fetch(`${SITE}/api/v3/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "my_room" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion ${endpoint}: HTTP ${res.status}`);
  return res.json();
}
// recordMap の値は { value: {...} } か { value: { value: {...} } } のどちらかで来る
const unwrap = (r) => (r && r.value && r.value.value) || (r && r.value);
const text = (prop) => (prop || []).map((seg) => seg[0]).join("");

const body = await api("queryCollection", {
  collection: { id: COLLECTION },
  collectionView: { id: VIEW },
  loader: {
    type: "reducer",
    reducers: { collection_group_results: { type: "results", limit: 500 } },
    searchQuery: "",
    userTimeZone: "Asia/Tokyo",
  },
});
const ids = body.result?.reducerResults?.collection_group_results?.blockIds;
if (!Array.isArray(ids)) throw new Error("Notion: 一覧が返ってこなかった");
const schema = unwrap(body.recordMap?.collection?.[COLLECTION])?.schema;
if (!schema) throw new Error("Notion: データベースの列の定義が返ってこなかった");
const START = Object.keys(schema).find((k) => schema[k].name === "Start");
if (!START) throw new Error("Notion: Start の列が見つからない");

// Start（日記のその見開きの始まりの日）。無ければ作った日で代わりにする
const startOf = (b) => {
  const d = (b.properties?.[START] || []).flatMap((seg) => seg[1] || []).find((f) => f[0] === "d");
  return d?.[1]?.start_date || new Date(b.created_time + 9 * 3600e3).toISOString().slice(0, 10);
};
const pages = ids
  .map((id) => unwrap(body.recordMap.block?.[id]))
  .filter((b) => b && b.alive !== false && b.type === "page")
  .map((b) => ({ b, start: startOf(b) }))
  .sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : x.b.created_time - y.b.created_time));

// 各ページの中の最初の画像。ページの中身は一覧では返ってこないので 1 件ずつ読む（数件ずつ並べて）
async function firstImage(page) {
  const chunk = await api("loadPageChunk", {
    pageId: page.id, limit: 30, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false,
  });
  const blocks = chunk.recordMap?.block || {};
  for (const id of page.content || []) {
    const b = unwrap(blocks[id]);
    if (b && b.alive !== false && b.type === "image") return b;
  }
  return null;
}
const images = [];
for (let i = 0; i < pages.length; i += 5) {
  images.push(...await Promise.all(pages.slice(i, i + 5).map(({ b }) => firstImage(b))));
}

const entries = [];
pages.forEach(({ b, start }, i) => {
  const img = images[i];
  const src = img && (img.format?.display_source || text(img.properties?.source));
  if (!src) { console.warn(`画像がないので飛ばす: ${text(b.properties?.title)}`); return; }
  // 公開サイトの画像の入口。開くたびに Notion が署名つきの URL へ転送するので、この URL は変わらない
  const image = `${SITE}/image/${encodeURIComponent(src)}?table=block&id=${img.id}&spaceId=${img.space_id}&width=${width}&cache=v2`;
  const ratio = img.format?.block_aspect_ratio;   // 高さ ÷ 幅
  entries.push({
    title: text(b.properties?.title).trim() || start,
    url: `${SITE}/${b.id.replaceAll("-", "")}`,
    date: start,
    image,
    ratio: typeof ratio === "number" && ratio > 0 ? Math.round(ratio * 1000) / 1000 : 1,
  });
});
if (!entries.length) throw new Error("Notion: 日記のページが 1 件も取れなかった");

writeFileSync(new URL("../diary.js", import.meta.url),
  "// scripts/fetch-diary.mjs が生成。手で編集しない。\n" +
  `window.DIARY = ${JSON.stringify({ url: LIST, pages: entries }, null, 2)};\n`);
console.log(`日記 ${entries.length} ページを diary.js に書いた`);
