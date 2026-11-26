// Notion の Lives（今まで行ったライブの記録）を取ってきて lives.js に書き出す。
// 公開している Notion サイト（*.notion.site）が使う API を、トークンなしで読む（fetch-posts.mjs と同じ）。
// 公式の API ではないので、Notion 側が変わると取れなくなることがある。そのときは前日の lives.js のまま残る。
//   使い方: node scripts/fetch-lives.mjs [最近のライブの件数] [よく行くアーティストの数]
import { writeFileSync } from "node:fs";

const SITE = "https://abstracted-lancer-5f0.notion.site";
const COLLECTION = "3b83cdf7-c025-4d48-ae56-0f3baef5e50d";     // 🎤 ライブ履歴 のデータソース
const VIEW = "0666f93a-02f6-4773-90ae-3652a2a49244";           // 表のビュー（Date の新しい順）
const LIST = `${SITE}/960831bc5b6c4d47bfbb3ac81fdbc52f`;       // Lives のページ（🎤 ライブ履歴）
const count = Number(process.argv[2]) || 3;
const topCount = Number(process.argv[3]) || 3;

const res = await fetch(`${SITE}/api/v3/queryCollection`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "my_room" },
  body: JSON.stringify({
    collection: { id: COLLECTION },
    collectionView: { id: VIEW },
    loader: {
      type: "reducer",
      reducers: { collection_group_results: { type: "results", limit: 1000 } },
      searchQuery: "",
      userTimeZone: "Asia/Tokyo",
    },
  }),
});
if (!res.ok) throw new Error(`Notion: HTTP ${res.status}`);
const body = await res.json();

// recordMap の値は { value: {...} } か { value: { value: {...} } } のどちらかで来る
const unwrap = (r) => (r && r.value && r.value.value) || (r && r.value);
const text = (prop) => (prop || []).map((seg) => seg[0]).join("");
const ids = body.result?.reducerResults?.collection_group_results?.blockIds;
if (!Array.isArray(ids)) throw new Error("Notion: 一覧が返ってこなかった");
const schema = unwrap(body.recordMap?.collection?.[COLLECTION])?.schema;
if (!schema) throw new Error("Notion: データベースの列の定義が返ってこなかった");
const keyOf = (name) => Object.keys(schema).find((k) => schema[k].name === name);
const DATE = keyOf("Date"), ARTISTS = keyOf("Artists"), VENUE = keyOf("Venue");
if (!DATE) throw new Error("Notion: Date の列が見つからない");

// Date（行った日）。無いもの（予定だけ書いたものなど）は数えない
const dateOf = (b) => (b.properties?.[DATE] || []).flatMap((seg) => seg[1] || []).find((f) => f[0] === "d")?.[1]?.start_date;
const lives = ids
  .map((id) => unwrap(body.recordMap.block?.[id]))
  .filter((b) => b && b.alive !== false && b.type === "page" && dateOf(b))
  .map((b) => ({ b, date: dateOf(b) }))
  .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
if (!lives.length) throw new Error("Notion: ライブが 1 件も取れなかった");

const artistsOf = (b) => ARTISTS ? text(b.properties?.[ARTISTS]).split(",").map((t) => t.trim()).filter(Boolean) : [];

// 年ごとの本数（いちばん古い年から今年まで、行かなかった年は 0）
const thisYear = Number(lives[0].date.slice(0, 4));
const firstYear = Number(lives.at(-1).date.slice(0, 4));
const perYear = new Map();
for (const { date } of lives) perYear.set(Number(date.slice(0, 4)), (perYear.get(Number(date.slice(0, 4))) || 0) + 1);
const years = [];
for (let y = firstYear; y <= thisYear; y++) years.push([y, perYear.get(y) || 0]);

// よく行くアーティスト（本数の多い順。同じなら最近行ったほうを先に）
const seen = new Map();
for (const { b } of lives) for (const a of artistsOf(b)) seen.set(a, (seen.get(a) || 0) + 1);
const top = [...seen].sort((x, y) => y[1] - x[1]).slice(0, topCount).map(([name, n]) => ({ name, count: n }));

// 最近のライブ。カバー写真（その日に撮ったもの）があれば公開サイトの画像の入口を使う（この URL は変わらない）
const recent = lives.slice(0, count).map(({ b, date }) => {
  const cover = b.format?.page_cover;
  const live = {
    title: text(b.properties?.title).trim() || "（無題）",
    url: `${SITE}/${b.id.replaceAll("-", "")}`,
    date,
    artists: artistsOf(b),
    venue: VENUE ? text(b.properties?.[VENUE]).trim() : "",
  };
  if (cover && cover.startsWith("attachment:")) {
    live.image = `${SITE}/image/${encodeURIComponent(cover)}?table=block&id=${b.id}&spaceId=${b.space_id}&width=400&cache=v2`;
    const pos = b.format?.page_cover_position;     // カバーの縦の位置（0 = 上、1 = 下）
    live.position = typeof pos === "number" && pos >= 0 && pos <= 1 ? Math.round(pos * 100) / 100 : 0.5;
  }
  return live;
});

writeFileSync(new URL("../lives.js", import.meta.url),
  "// scripts/fetch-lives.mjs が生成。手で編集しない。\n" +
  `window.LIVES = ${JSON.stringify({ url: LIST, total: lives.length, years, top, lives: recent }, null, 2)};\n`);
console.log(`ライブ ${lives.length} 本（最近の ${recent.length} 本）を lives.js に書いた`);
