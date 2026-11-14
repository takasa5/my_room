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
      checkKeys(w, it, ["furniture", "title", "links", "image", "imageSize", "imageLink", "booklog"]);

      // 押しても反応しない家具にならないよう、scene.js に同じ id の家具があること
      if (!sceneIds.has(id)) fail(w, `scene.js に id "${id}" の家具がない`);

      if (!isText(it.furniture)) fail(`${w}.furniture`, "空でない文字列にする");
      if (!isText(it.title)) fail(`${w}.title`, "空でない文字列にする");

      if (!Array.isArray(it.links) || it.links.length === 0) {
        fail(`${w}.links`, "1 件以上の配列にする（一覧のカードは links[0] を開く）");
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
    }
  }
}

if (errors.length) {
  console.error(`data.js に ${errors.length} 件の問題があります:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`data.js OK（${Object.keys(data.items).length} 項目）`);
