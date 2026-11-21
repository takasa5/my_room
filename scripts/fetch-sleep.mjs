// Google Health API（旧 Fitbit）の睡眠の記録を取ってきて sleep.js に書き出す。
// API には本人の OAuth トークンが要るのでブラウザからは読めない。GitHub Actions（または手元）でこのスクリプトを動かし、結果を静的ファイルとして置く。
//   使い方: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_HEALTH_REFRESH_TOKEN=... node scripts/fetch-sleep.mjs [週数]
//   トークンは takasa5/my_google_health の `deno task setup` で取ったもの（権限は googlehealth.sleep.readonly だけ）
//
// 公開リポジトリに置くので、出すものを絞る:
//   * 1 晩につき 入眠・起床の時刻と睡眠時間だけ。どれも 5 分単位に丸める。睡眠ステージや中途覚醒は出さない
//   * いちばん新しいのは「おとといの夜」（起きたのが昨日の朝）。ゆうべの分はまだ出さない
//   * 取った中身はログに出さない（Actions のログも公開される）
import { writeFileSync } from "node:fs";

const weeks = Number(process.argv[2]) || 26;
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_HEALTH_REFRESH_TOKEN: refreshToken } = process.env;
if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_HEALTH_REFRESH_TOKEN がない");

const JST = 9 * 3600e3;                   // 日本時間（夏時間なし）
const DAY = 864e5;
const Q = 5;                              // 丸める単位（分）
const MIN_NIGHT = 3 * 60;                 // これより短い眠りしかない夜は、昼寝とみなして記録なしにする
const MERGE_GAP = 90 * 60e3;              // 夜中に目が覚めて記録が分かれたとき、この間隔までは 1 つの眠りとしてつなぐ

// 夜の日付（日本時間の YYYY-MM-DD）。入眠の 12 時間前の日付にする（23 時に寝ても 1 時に寝てもその前の日の夜）
const nightOf = (startMs) => new Date(startMs + JST - 12 * 3600e3).toISOString().slice(0, 10);
const todayJst = new Date(Date.now() + JST).toISOString().slice(0, 10);
const lastNight = new Date(Date.parse(todayJst) - 2 * DAY).toISOString().slice(0, 10);   // おとといの夜
const start = new Date(Date.parse(lastNight) - (weeks * 7 - 1) * DAY).toISOString().slice(0, 10);

const tok = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
});
// 返事の本文にはトークンが入りうるので出さない。error の種類（invalid_grant など）だけ出す
if (!tok.ok) throw new Error(`Google のトークン: HTTP ${tok.status} ${(await tok.json().catch(() => ({}))).error ?? ""}`.trim());
const { access_token } = await tok.json();

// Google Health API はときどき 503 を返すので、5xx と 429 は少し待って取り直す（4 回まで）
async function get(url) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${access_token}` } });
    if (res.ok || i === 3 || !(res.status >= 500 || res.status === 429)) return res;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
}

// 期間の少し前から取る（期間の最初の夜に寝たのが前の日の昼にかかっていても拾えるように）
const from = new Date(Date.parse(start) - JST - DAY).toISOString();
const to = new Date().toISOString();
const sessions = [];
let pageToken = "", pages = 0;
do {
  const url = new URL("https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints");
  url.searchParams.set("filter", `sleep.interval.end_time >= "${from}" AND sleep.interval.end_time < "${to}"`);
  url.searchParams.set("pageSize", "25");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await get(url);
  if (!res.ok) throw new Error(`Google Health: HTTP ${res.status}`);
  const body = await res.json();
  for (const dp of body.dataPoints ?? []) {
    const s = dp.sleep, b = Date.parse(s?.interval?.startTime), e = Date.parse(s?.interval?.endTime);
    if (!(b < e)) continue;
    const asleep = Number(s.summary?.minutesAsleep);
    sessions.push({ b, e, asleep: Number.isFinite(asleep) && asleep > 0 ? asleep : (e - b) / 60e3 });
  }
  pageToken = body.nextPageToken ?? "";
  if (++pages > 100) throw new Error("ページが多すぎる");
} while (pageToken);

// 夜ごとにまとめる。分かれた記録はつなぎ、いちばん長く眠ったまとまりをその夜の眠りにする
const byNight = new Map();
for (const s of sessions.sort((x, y) => x.b - y.b)) {
  const key = nightOf(s.b), chains = byNight.get(key) ?? [];
  const last = chains[chains.length - 1];
  if (last && s.b - last.e <= MERGE_GAP) { last.e = Math.max(last.e, s.e); last.asleep += s.asleep; }
  else chains.push({ ...s });
  byNight.set(key, chains);
}

const q = (m) => Math.round(m / Q) * Q;
const nights = [];
for (let i = 0; i < weeks * 7; i++) {
  const date = new Date(Date.parse(start) + i * DAY).toISOString().slice(0, 10);
  const best = (byNight.get(date) ?? []).reduce((a, c) => (!a || c.asleep > a.asleep ? c : a), null);
  if (!best || best.asleep < MIN_NIGHT) { nights.push(null); continue; }
  const midnight = Date.parse(date) - JST;                      // その夜の日付の 0:00（日本時間）
  const bed = q((best.b - midnight) / 60e3), wake = q((best.e - midnight) / 60e3);
  nights.push([bed, Math.max(wake, bed + Q), Math.min(q(best.asleep), Math.max(wake, bed + Q) - bed)]);
}
if (!nights.some(Boolean)) throw new Error("睡眠の記録が 1 晩分も取れなかった");

const out = { weeks, start, nights };
writeFileSync(new URL("../sleep.js", import.meta.url),
  "// scripts/fetch-sleep.mjs が生成。手で編集しない。\n" +
  "// nights[i] は start から i 日目の夜。[入眠, 起床, 睡眠時間]（分。入眠・起床はその夜の日付の 0:00 から。5 分単位）か、記録なしは null\n" +
  `window.SLEEP = ${JSON.stringify(out)};\n`);
console.log(`${start} からの ${nights.length} 晩（記録あり ${nights.filter(Boolean).length} 晩）を sleep.js に書いた`);
