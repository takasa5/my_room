// Filmarks のマーク（観た作品）を取ってきて filmarks.js に書き出す。
// Filmarks には公開 API がなく、ページにも CORS / JSONP がないのでブラウザからは直接読めない。
// 代わりに GitHub Actions（または手元）でこのスクリプトを動かし、結果を静的ファイルとして置く。
//   使い方: node scripts/fetch-filmarks.mjs [ユーザー名] [件数]
import { writeFileSync } from "node:fs";

const user = process.argv[2] || "tks5";
const count = Number(process.argv[3]) || 8;
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const res = await fetch(`https://filmarks.com/users/${encodeURIComponent(user)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`Filmarks: HTTP ${res.status}`);
const html = await res.text();

const works = [];
for (const card of html.split('class="c-content-card"').slice(1)) {
  const a = card.match(/<a class="c-content__jacket" href="([^"#]+)[^"]*"><img alt="([^"]*)" src="([^"]+)"/);
  if (!a) continue;
  const rating = card.match(/c-rating__score">([\d.]+|-)</);
  works.push({
    url: new URL(a[1], "https://filmarks.com").href,
    title: decode(a[2]),
    image: a[3],
    rating: rating && rating[1] !== "-" ? Number(rating[1]) : null,
  });
  if (works.length >= count) break;
}
if (!works.length) throw new Error("作品が 1 件も取れなかった（ページ構造が変わった？）");

writeFileSync(new URL("../filmarks.js", import.meta.url),
  "// scripts/fetch-filmarks.mjs が生成。手で編集しない。\n" +
  `window.FILMARKS = ${JSON.stringify({ user, works }, null, 2)};\n`);
console.log(`${works.length} 件を filmarks.js に書いた`);
