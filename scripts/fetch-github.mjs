// GitHub の草（直近の活動）と、最近いじったリポジトリを取ってきて github.js に書き出す。
// 草は GraphQL API でしか取れず、API にはトークンが要るのでブラウザからは読めない。
// 代わりに GitHub Actions（または手元）でこのスクリプトを動かし、結果を静的ファイルとして置く。
//   使い方: GITHUB_TOKEN=... node scripts/fetch-github.mjs [ユーザー名] [リポジトリの件数] [草の週数]
//   手元なら GITHUB_TOKEN=$(gh auth token) でよい
import { writeFileSync } from "node:fs";

const user = process.argv[2] || "takasa5";
const count = Number(process.argv[3]) || 4;
const weeks = Number(process.argv[4]) || 26;   // 草に出す週数（API は 1 年分返すので、新しい方から切り出す）
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN がない");

// contributionLevel を 0〜4 の濃さにする（GitHub の草と同じ 5 段階）
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const query = `query($login: String!, $n: Int!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { date contributionLevel contributionCount } }
      }
    }
    repositories(first: $n, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { name url openGraphImageUrl pushedAt isArchived }
    }
  }
}`;

// プロフィール用の README リポジトリ（ユーザー名と同じ名前）とアーカイブ済みを省くので、多めに取る
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "my_room" },
  body: JSON.stringify({ query, variables: { login: user, n: count + 5 } }),
});
if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
const body = await res.json();
if (body.errors) throw new Error("GitHub: " + body.errors.map((e) => e.message).join(" / "));
const u = body.data.user;
if (!u) throw new Error(`ユーザー ${user} が見つからない`);

const cal = u.contributionsCollection.contributionCalendar;
// 濃さ（level）は GitHub が 1 年分を見て決めたものをそのまま使う
const days = cal.weeks.slice(-weeks).flatMap((w) => w.contributionDays);
const repos = u.repositories.nodes
  .filter((r) => !r.isArchived && r.name.toLowerCase() !== user.toLowerCase())
  .slice(0, count)
  .map((r) => ({ name: r.name, url: r.url, image: r.openGraphImageUrl, pushedAt: r.pushedAt }));
if (!days.length) throw new Error("草が 1 日分も取れなかった");

const out = {
  user,
  url: `https://github.com/${user}`,
  weeks,                                                // 草の週数（列の数）
  total: days.reduce((n, d) => n + d.contributionCount, 0),   // その間の contributions
  start: days[0].date,                                   // levels[0] の日付（日曜日）
  levels: days.map((d) => LEVELS[d.contributionLevel] ?? 0),
  repos,
};
writeFileSync(new URL("../github.js", import.meta.url),
  "// scripts/fetch-github.mjs が生成。手で編集しない。\n" +
  `window.GITHUB = ${JSON.stringify(out, null, 2).replace(/"levels": \[[^\]]*\]/, `"levels": ${JSON.stringify(out.levels)}`)};\n`);
console.log(`草 ${days.length} 日分とリポジトリ ${repos.length} 件を github.js に書いた`);
