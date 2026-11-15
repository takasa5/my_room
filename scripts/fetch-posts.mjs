// Notion の Posts（公開済みの新しいものから数件）を取ってきて posts.js に書き出す。
// 公開している Notion サイト（*.notion.site）が使う API を、トークンなしで読む。
// ブラウザから直接は読めない（CORS）ので、GitHub Actions（または手元）でこのスクリプトを動かし、結果を静的ファイルとして置く。
// 公式の API ではないので、Notion 側が変わると取れなくなることがある。そのときは前日の posts.js のまま残る。
//   使い方: node scripts/fetch-posts.mjs [件数]
import { writeFileSync } from "node:fs";

const SITE = "https://abstracted-lancer-5f0.notion.site";
const COLLECTION = "e7f45df4-2036-447b-82e7-ac638137d4fd";     // 📮 Posts のデータソース
const VIEW = "acd0eb82-5342-41a9-aa7f-becdef4dd8c7";           // 一覧のビュー（並び順は効くが、絞り込みは効かない）
const LIST = `${SITE}/eb09df3ad61a4adea8765eea005cacbe`;       // Posts の一覧ページ
const count = Number(process.argv[2]) || 5;

const res = await fetch(`${SITE}/api/v3/queryCollection`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "my_room" },
  body: JSON.stringify({
    collection: { id: COLLECTION },
    collectionView: { id: VIEW },
    loader: {
      type: "reducer",
      reducers: { collection_group_results: { type: "results", limit: 100 } },
      searchQuery: "",
      userTimeZone: "Asia/Tokyo",
    },
  }),
});
if (!res.ok) throw new Error(`Notion: HTTP ${res.status}`);
const body = await res.json();

// recordMap の値は { value: {...} } か { value: { value: {...} } } のどちらかで来る
const unwrap = (r) => (r && r.value && r.value.value) || (r && r.value);
const ids = body.result?.reducerResults?.collection_group_results?.blockIds;
if (!Array.isArray(ids)) throw new Error("Notion: 一覧が返ってこなかった");
const schema = unwrap(body.recordMap?.collection?.[COLLECTION])?.schema;
if (!schema) throw new Error("Notion: データベースの列の定義が返ってこなかった");
const keyOf = (name) => Object.keys(schema).find((k) => schema[k].name === name);
const TAG = keyOf("Tag"), PUBLISHED = keyOf("Published");
if (!PUBLISHED) throw new Error("Notion: Published の列が見つからない");

// この API はビューの条件（公開済みだけ）を効かせずに全部返すので、ここで絞る。
// Published は「Complete」グループの値（Done）なら公開済み。空欄は既定値（defaultOption）として扱う（Notion の画面と同じ）
const pub = schema[PUBLISHED];
const doneIds = new Set((pub.groups || []).filter((g) => g.name === "Complete").flatMap((g) => g.optionIds || []));
const doneValues = new Set((pub.options || []).filter((o) => doneIds.has(o.id)).map((o) => o.value));
if (!doneValues.size) throw new Error("Notion: Published の「公開済み」にあたる値が見つからない");
const isPublished = (b) => doneValues.has(text(b.properties?.[PUBLISHED]) || pub.defaultOption);

function text(prop) { return (prop || []).map((seg) => seg[0]).join(""); }
// 作った日（日本時間の YYYY-MM-DD）
const jstDate = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

const posts = ids
  .map((id) => unwrap(body.recordMap.block?.[id]))
  .filter((b) => b && b.alive !== false && b.type === "page")
  .filter(isPublished)
  .sort((a, b) => b.created_time - a.created_time)
  .slice(0, count)
  .map((b) => ({
    title: text(b.properties?.title).trim() || "（無題）",
    url: `${SITE}/${b.id.replaceAll("-", "")}`,
    date: jstDate(b.created_time),
    tags: TAG ? text(b.properties?.[TAG]).split(",").map((t) => t.trim()).filter(Boolean) : [],
  }));
if (!posts.length) throw new Error("Notion: 公開済みの投稿が 1 件も取れなかった");

writeFileSync(new URL("../posts.js", import.meta.url),
  "// scripts/fetch-posts.mjs が生成。手で編集しない。\n" +
  `window.POSTS = ${JSON.stringify({ url: LIST, posts }, null, 2)};\n`);
console.log(`投稿 ${posts.length} 件を posts.js に書いた`);
