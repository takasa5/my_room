// data.js の形が index.html と scene.js の期待どおりかを確かめる。
// ブラウザも外部への通信も使わない。リンク先が生きているかは見ない。
//   node scripts/check-data.js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "" && v === v.trim();
const isHttps = (v) => {
  if (typeof v !== "string" || v !== v.trim() || !v.startsWith("https://")) return false;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
};
const isPosInt = (v) => Number.isInteger(v) && v > 0;

function checkKeys(where, obj, allowed) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(where, `知らないキー "${k}"`);
}

// data.js を偽の window の上で動かして ROOM_DATA を取り出す
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox, { filename: "data.js" });
const data = sandbox.window.ROOM_DATA;

// scene.js で家具に付けている id（B / S / C / R の最後の引数の文字列）
const sceneSrc = fs.readFileSync(path.join(root, "scene.js"), "utf8");
const sceneIds = new Set([...sceneSrc.matchAll(/\b[BSCR]\([^;]*?,\s*"([\w-]+)"\s*\)/g)].map((m) => m[1]));

if (!isObj(data)) {
  fail("data.js", "window.ROOM_DATA がオブジェクトになっていない");
} else {
  checkKeys("ROOM_DATA", data, ["title", "top", "items"]);
  if (!isText(data.title)) fail("title", "空でない文字列にする");
  if (!isHttps(data.top)) fail("top", "https:// の URL にする");

  if (!isObj(data.items) || Object.keys(data.items).length === 0) {
    fail("items", "1 つ以上の項目を持つオブジェクトにする");
  } else {
    for (const [id, it] of Object.entries(data.items)) {
      const w = `items.${id}`;
      if (!isObj(it)) { fail(w, "オブジェクトにする"); continue; }
      checkKeys(w, it, ["furniture", "title", "links", "image", "imageSize", "imageLink", "booklog", "filmarks", "github", "posts", "diary", "sleep"]);

      // 押しても反応しない家具にならないよう、scene.js に同じ id の家具があること
      if (!sceneIds.has(id)) fail(w, `scene.js に id "${id}" の家具がない`);

      if (!isText(it.furniture)) fail(`${w}.furniture`, "空でない文字列にする");
      if (!isText(it.title)) fail(`${w}.title`, "空でない文字列にする");

      // links は省ける（一覧のカードは links[0] を開き、ないときはパネルを開く）。ただしパネルに何も出ない小物にはしない
      if (!("links" in it)) {
        if (!(it.sleep === true)) fail(`${w}.links`, "links を省けるのは、パネルに中身を出す小物（sleep など）だけ");
      } else if (!Array.isArray(it.links) || it.links.length === 0) {
        fail(`${w}.links`, "1 件以上の配列にする（使わないならキーごと省く）");
      } else {
        it.links.forEach((l, i) => {
          const lw = `${w}.links[${i}]`;
          if (!isObj(l)) { fail(lw, "オブジェクトにする"); return; }
          checkKeys(lw, l, ["label", "url"]);
          if (!isText(l.label)) fail(`${lw}.label`, "空でない文字列にする");
          if (!isHttps(l.url)) fail(`${lw}.url`, "https:// の URL にする");
        });
      }

      if ("image" in it && !isHttps(it.image)) fail(`${w}.image`, "https:// の URL にする");
      if ("imageSize" in it) {
        if (!("image" in it)) fail(`${w}.imageSize`, "image がないのに書いてある");
        const s = it.imageSize;
        if (!Array.isArray(s) || s.length !== 2 || !s.every(isPosInt)) fail(`${w}.imageSize`, "[幅, 高さ] の正の整数 2 つにする");
      }
      if ("imageLink" in it) {
        if (!("image" in it)) fail(`${w}.imageLink`, "image がないのに書いてある");
        if (!isHttps(it.imageLink)) fail(`${w}.imageLink`, "https:// の URL にする");
      }

      if ("booklog" in it) {
        const b = it.booklog, bw = `${w}.booklog`;
        if (!isObj(b)) { fail(bw, "オブジェクトにする"); }
        else {
          checkKeys(bw, b, ["user", "count", "status"]);
          if (!isText(b.user)) fail(`${bw}.user`, "空でない文字列にする");
          if (!isPosInt(b.count)) fail(`${bw}.count`, "正の整数にする");
          if ("status" in b && ![1, 2, 3, 4].includes(b.status)) fail(`${bw}.status`, "1〜4 のどれかにする（省くと全部）");
        }
      }

      if ("filmarks" in it && it.filmarks !== true) fail(`${w}.filmarks`, "true にする（使わないなら書かない）");
      if ("github" in it && it.github !== true) fail(`${w}.github`, "true にする（使わないなら書かない）");
      if ("posts" in it && it.posts !== true) fail(`${w}.posts`, "true にする（使わないなら書かない）");
      if ("diary" in it && it.diary !== true) fail(`${w}.diary`, "true にする（使わないなら書かない）");
      if ("sleep" in it && it.sleep !== true) fail(`${w}.sleep`, "true にする（使わないなら書かない）");
    }

    // filmarks.js は Actions がスクレイピングして作るので、中身の形もここで見る。
    // index.html は url / image をそのまま使うので https であること。
    if (Object.values(data.items).some((it) => isObj(it) && it.filmarks === true)) checkFilmarks();
    if (Object.values(data.items).some((it) => isObj(it) && it.github === true)) checkGithub();
    if (Object.values(data.items).some((it) => isObj(it) && it.posts === true)) checkPosts();
    if (Object.values(data.items).some((it) => isObj(it) && it.diary === true)) checkDiary();
    if (Object.values(data.items).some((it) => isObj(it) && it.sleep === true)) checkSleep();
  }
}

function checkFilmarks() {
  const file = path.join(root, "filmarks.js");
  if (!fs.existsSync(file)) { fail("filmarks.js", "filmarks: true の項目があるのにファイルがない"); return; }
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sb, { filename: "filmarks.js" });
  const fm = sb.window.FILMARKS;
  if (!isObj(fm) || !Array.isArray(fm.works)) { fail("filmarks.js", "window.FILMARKS.works が配列になっていない"); return; }
  fm.works.forEach((x, i) => {
    const fw = `FILMARKS.works[${i}]`;
    if (!isObj(x)) { fail(fw, "オブジェクトにする"); return; }
    if (!isHttps(x.url)) fail(`${fw}.url`, "https:// の URL にする");
    if (!isHttps(x.image)) fail(`${fw}.image`, "https:// の URL にする");
    if (typeof x.title !== "string") fail(`${fw}.title`, "文字列にする");
    if (x.rating !== null && !(typeof x.rating === "number" && x.rating >= 0 && x.rating <= 5)) fail(`${fw}.rating`, "0〜5 の数か null にする");
  });
}

// github.js は Actions が GitHub API から作る。index.html は levels で草を描き、url / image をそのまま使う
function checkGithub() {
  const file = path.join(root, "github.js");
  if (!fs.existsSync(file)) { fail("github.js", "github: true の項目があるのにファイルがない"); return; }
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sb, { filename: "github.js" });
  const gh = sb.window.GITHUB;
  if (!isObj(gh)) { fail("github.js", "window.GITHUB がオブジェクトになっていない"); return; }
  if (!isHttps(gh.url)) fail("GITHUB.url", "https:// の URL にする");
  if (!(Number.isInteger(gh.total) && gh.total >= 0)) fail("GITHUB.total", "0 以上の整数にする");
  if (!(Number.isInteger(gh.weeks) && gh.weeks > 0)) fail("GITHUB.weeks", "正の整数にする");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gh.start) || new Date(gh.start + "T00:00:00Z").getUTCDay() !== 0) {
    fail("GITHUB.start", "日曜日の日付（YYYY-MM-DD）にする（草の 1 列目の一番上が日曜日）");
  }
  if (!Array.isArray(gh.levels) || !gh.levels.every((v) => [0, 1, 2, 3, 4].includes(v))) fail("GITHUB.levels", "0〜4 の数の配列にする");
  if (!Array.isArray(gh.repos)) { fail("GITHUB.repos", "配列にする"); return; }
  gh.repos.forEach((r, i) => {
    const rw = `GITHUB.repos[${i}]`;
    if (!isObj(r)) { fail(rw, "オブジェクトにする"); return; }
    if (!isText(r.name)) fail(`${rw}.name`, "空でない文字列にする");
    if (!isHttps(r.url)) fail(`${rw}.url`, "https:// の URL にする");
    if (!isHttps(r.image)) fail(`${rw}.image`, "https:// の URL にする");
  });
}

// posts.js は Actions が公開 Notion サイトから作る。index.html は url をそのまま開き、date と tags を題名の上に出す
function checkPosts() {
  const file = path.join(root, "posts.js");
  if (!fs.existsSync(file)) { fail("posts.js", "posts: true の項目があるのにファイルがない"); return; }
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sb, { filename: "posts.js" });
  const po = sb.window.POSTS;
  if (!isObj(po) || !Array.isArray(po.posts)) { fail("posts.js", "window.POSTS.posts が配列になっていない"); return; }
  if (!isHttps(po.url)) fail("POSTS.url", "https:// の URL にする");
  po.posts.forEach((p, i) => {
    const pw = `POSTS.posts[${i}]`;
    if (!isObj(p)) { fail(pw, "オブジェクトにする"); return; }
    if (!isText(p.title)) fail(`${pw}.title`, "空でない文字列にする");
    if (!isHttps(p.url)) fail(`${pw}.url`, "https:// の URL にする");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail(`${pw}.date`, "YYYY-MM-DD にする");
    if (!Array.isArray(p.tags) || !p.tags.every(isText)) fail(`${pw}.tags`, "空でない文字列の配列にする");
  });
}

// diary.js は Actions が公開 Notion サイトから作る。index.html は古い順に 2 枚ずつ見開きで並べ、image を表示して url を開く
function checkDiary() {
  const file = path.join(root, "diary.js");
  if (!fs.existsSync(file)) { fail("diary.js", "diary: true の項目があるのにファイルがない"); return; }
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sb, { filename: "diary.js" });
  const di = sb.window.DIARY;
  if (!isObj(di) || !Array.isArray(di.pages)) { fail("diary.js", "window.DIARY.pages が配列になっていない"); return; }
  if (!isHttps(di.url)) fail("DIARY.url", "https:// の URL にする");
  di.pages.forEach((p, i) => {
    const pw = `DIARY.pages[${i}]`;
    if (!isObj(p)) { fail(pw, "オブジェクトにする"); return; }
    checkKeys(pw, p, ["title", "url", "date", "image", "ratio"]);
    if (!isText(p.title)) fail(`${pw}.title`, "空でない文字列にする");
    if (!isHttps(p.url)) fail(`${pw}.url`, "https:// の URL にする");
    if (!isHttps(p.image)) fail(`${pw}.image`, "https:// の URL にする");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail(`${pw}.date`, "YYYY-MM-DD にする");
    else if (i > 0 && isObj(di.pages[i - 1]) && di.pages[i - 1].date > p.date) fail(`${pw}.date`, "古い順に並べる（見開きの組がずれる）");
    if (!(typeof p.ratio === "number" && p.ratio > 0 && p.ratio < 10)) fail(`${pw}.ratio`, "画像の高さ÷幅（正の数）にする");
  });
}

// sleep.js は Actions が Google Health API から作る。index.html は start からの夜を並べ、入眠〜起床をリボンにする。
// 公開してよい粒度（5 分単位、3 つの数だけ）を超えていないかもここで見る
function checkSleep() {
  const file = path.join(root, "sleep.js");
  if (!fs.existsSync(file)) { fail("sleep.js", "sleep: true の項目があるのにファイルがない"); return; }
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sb, { filename: "sleep.js" });
  const sl = sb.window.SLEEP;
  if (!isObj(sl)) { fail("sleep.js", "window.SLEEP がオブジェクトになっていない"); return; }
  checkKeys("SLEEP", sl, ["weeks", "start", "nights"]);
  if (!isPosInt(sl.weeks)) fail("SLEEP.weeks", "正の整数にする");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sl.start) || Number.isNaN(Date.parse(sl.start))) fail("SLEEP.start", "YYYY-MM-DD にする");
  if (!Array.isArray(sl.nights)) { fail("SLEEP.nights", "配列にする"); return; }
  if (isPosInt(sl.weeks) && sl.nights.length !== sl.weeks * 7) fail("SLEEP.nights", `weeks × 7（${sl.weeks * 7}）晩分にする`);
  const q5 = (v) => Number.isInteger(v) && v % 5 === 0;
  sl.nights.forEach((n, i) => {
    if (n === null) return;
    const nw = `SLEEP.nights[${i}]`;
    if (!Array.isArray(n) || n.length !== 3 || !n.every(q5)) { fail(nw, "null か、5 分単位の整数 3 つ [入眠, 起床, 睡眠時間] にする"); return; }
    const [bed, wake, asleep] = n;
    if (bed < 12 * 60 || bed >= 36 * 60) fail(nw, "入眠はその夜の日付の 12:00〜翌 12:00（720〜2159 分）にする");
    if (!(wake > bed && wake - bed <= 24 * 60)) fail(nw, "起床は入眠より後、24 時間以内にする");
    if (!(asleep > 0 && asleep <= wake - bed)) fail(nw, "睡眠時間は 0 より大きく、入眠〜起床の長さ以下にする");
  });
  if (!sl.nights.some((n) => n !== null)) fail("SLEEP.nights", "記録が 1 晩もない");
}

if (errors.length) {
  console.error(`data.js に ${errors.length} 件の問題があります:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`data.js OK（${Object.keys(data.items).length} 項目）`);
