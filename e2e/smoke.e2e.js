// index.html を Chromium で開き、部屋が描けて小物を押すとパネルが開くかを確かめる。
// 外部への通信（ブクログ、last.fm、Filmarks の画像など）はすべて差し替え、
// CI の結果が外部サイトの状態に左右されないようにする。
//   npm run e2e
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright-core");
const { buildSite } = require("../scripts/build-site.js");

const outDir = path.join(__dirname, ".output");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain"
};

// 1x1 の透明な PNG（画像の差し替えに使う）
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const FAKE_BOOKS = [
  { url: "https://booklog.jp/item/1/1", image: "https://example.test/book1.jpg", title: "本 1" },
  { url: "https://booklog.jp/item/1/2", image: "https://example.test/book2.jpg", title: "本 2" }
];

let server, base, browser;

before(async () => {
  // デプロイと同じ公開物（scripts/build-site.js）を作って配信する。公開対象に足し忘れたファイルは 404 になって失敗する
  const root = await buildSite(fs.mkdtempSync(path.join(os.tmpdir(), "my_room-site-")));
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, p === "/" ? "index.html" : p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// 外部への通信を差し替える。offline: true なら全部失敗させる（外部が落ちていても壊れないか）
async function routeExternal(page, { offline = false } = {}) {
  await page.route((url) => url.hostname !== "127.0.0.1", (route) => {
    const req = route.request(), url = new URL(req.url());
    if (offline) return route.abort();
    if (url.hostname === "api.booklog.jp") {
      const cb = url.searchParams.get("callback");
      return route.fulfill({ contentType: "text/javascript", body: `${cb}(${JSON.stringify({ books: FAKE_BOOKS })});` });
    }
    if (req.resourceType() === "image") return route.fulfill({ contentType: "image/png", body: PNG });
    return route.abort();
  });
}

// ページを開いて部屋を描き終わるまで待つ。失敗したらスクリーンショットを残す
async function withPage(name, opts, fn) {
  const page = await browser.newPage(opts.viewport ? { viewport: opts.viewport } : {});
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // offline のときは画像やスクリプトの読み込み失敗が出るのが正しい
    if (m.type() === "error" && !(opts.offline && /Failed to load resource|ERR_FAILED/.test(m.text()))) errors.push(m.text());
  });
  await routeExternal(page, opts);
  try {
    await page.goto(base);
    await page.waitForSelector("#room[data-ready='1']", { timeout: 90000 });
    await fn(page);
    assert.deepEqual(errors, [], "ページでエラーが出た");
  } catch (e) {
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await page.close();
  }
}

const roomData = (page) => page.evaluate(() => window.ROOM_DATA);

async function openPanel(page, id) {
  await page.locator(`#room span[data-id="${id}"]`).first().click();
  await page.waitForSelector("#panel[open]");
  return page.locator("#panel");
}

test("部屋が描け、すべての小物とカードがある", () => withPage("room", {}, async (page) => {
  const data = await roomData(page);
  const ids = Object.keys(data.items);
  const drawn = await page.$$eval("#room span[data-id]", (els) => [...new Set(els.map((e) => e.dataset.id))]);
  // 見えている小物を押せるように、data.js の全項目が絵の中にあること
  assert.deepEqual(drawn.sort(), [...ids].sort(), "絵の中に出ていない小物がある");

  // links のある小物はリンク、ない小物（目覚まし時計）はパネルを開くボタン
  const cards = await page.$$eval("#things .card", (els) => els.map((el) => (el.tagName === "A" ? el.href : null)));
  assert.deepEqual(cards, ids.map((id) => data.items[id].links?.[0].url ?? null), "カードのリンクが data.js と違う");

  // OGP の画像はページが読まないので、公開物（FILES）に入っているかをここで見る
  const og = await page.$eval('meta[property="og:image"]', (m) => m.content);
  const url = await page.$eval('meta[property="og:url"]', (m) => m.content);
  assert.ok(og.startsWith(url), "og:image が og:url の下にない");
  const res = await page.request.get(base + og.slice(url.length));
  assert.equal(res.status(), 200, `OGP の画像 ${og} が公開物にない`);
}));

test("本を押すとパネルが開き、ブクログの表紙が出て、閉じられる", () => withPage("books", {}, async (page) => {
  const data = await roomData(page);
  const panel = await openPanel(page, "books");
  assert.equal(await panel.locator("#panel-title").textContent(), data.items.books.title);
  assert.deepEqual(
    await panel.locator("#panel-links a").evaluateAll((as) => as.map((a) => a.href)),
    data.items.books.links.map((l) => l.url)
  );
  await page.waitForFunction((n) => document.querySelectorAll("#panel-extra .covers a.image-link").length === n, FAKE_BOOKS.length);

  await page.click("#panel-close");
  await page.waitForSelector("#panel[open]", { state: "detached" });
}));

test("ポスターを押すと Filmarks のポスターが出る", () => withPage("poster", {}, async (page) => {
  const works = await page.evaluate(() => window.FILMARKS.works.length);
  const panel = await openPanel(page, "poster");
  assert.equal(await panel.locator(".covers a.image-link").count(), works);
}));

test("紙の束を押すと Notion の新しい投稿が出る", () => withPage("papers", {}, async (page) => {
  const posts = await page.evaluate(() => window.POSTS.posts);
  const panel = await openPanel(page, "papers");
  assert.deepEqual(
    await panel.locator("ul.posts a").evaluateAll((as) => as.map((a) => a.href)),
    posts.map((p) => p.url)
  );
}));

test("日記帳を押すと一番新しい見開きが出て、前後にめくれる", () => withPage("diary", {}, async (page) => {
  const pages = await page.evaluate(() => window.DIARY.pages);
  const last = Math.ceil(pages.length / 2) - 1;
  await page.evaluate(() => { window.DIARY.pages[0].ratio = 0.9; window.DIARY.pages[1].ratio = 1.1; });
  const panel = await openPanel(page, "diary");
  // n 番目の見開きは古い順の 2n・2n+1 枚目（奇数枚なら最後の見開きの右は空き）
  const shows = async (n) => assert.deepEqual(
    await panel.locator(".spread a.leaf").evaluateAll((as) => as.map((a) => a.href)),
    pages.slice(n * 2, n * 2 + 2).map((p) => p.url)
  );
  await shows(last);
  assert.ok(await panel.locator('button[aria-label="次の見開き"]').isDisabled());

  await panel.locator('button[aria-label="前の見開き"]').click();
  await shows(last - 1);
  await page.keyboard.press("ArrowRight");
  await shows(last);
  for (let n = last; n > 0; n--) await page.keyboard.press("ArrowLeft");
  await shows(0);
  assert.ok(await panel.locator('button[aria-label="前の見開き"]').isDisabled());
  // 写真の縦横比が違っても、めくって見開きの高さが変わらない（最初の 2 枚を縦横比の違うものにしてある）
  const box = () => panel.locator(".spread").evaluate((el) => el.getBoundingClientRect().height);
  const first = await box();
  const heights = await panel.locator(".spread img").evaluateAll((ims) => ims.map((im) => im.getBoundingClientRect().height));
  assert.ok(Math.abs(heights[0] - heights[1]) < 1, `左右の高さが違う: ${heights}`);
  for (let n = 0; n < last; n++) await page.keyboard.press("ArrowRight");
  assert.ok(Math.abs(await box() - first) < 1, "めくると見開きの高さが変わる");
  for (let n = last; n > 0; n--) await page.keyboard.press("ArrowLeft");
  // 写真が読めたあとも（失敗して空の紙にならずに）残っていること
  await page.waitForFunction(() => [...document.querySelectorAll("#panel .spread img")].every((im) => im.complete));
  assert.equal(await panel.locator(".spread img").count(), 2);
}));

test("パソコンを押すと GitHub の草とリポジトリのカードが出る", () => withPage("computer", {}, async (page) => {
  const gh = await page.evaluate(() => window.GITHUB);
  const panel = await openPanel(page, "computer");
  assert.equal(await panel.locator(".grass i").count(), gh.levels.length);
  assert.equal(await panel.locator("a.grass-note").getAttribute("href"), gh.url);
  // 画像が読めたあとも（失敗して消えずに）全部残っていること
  await page.waitForFunction(() => [...document.querySelectorAll("#panel .repos img")].every((im) => im.complete));
  assert.deepEqual(
    await panel.locator(".repos a.image-link").evaluateAll((as) => as.map((a) => a.href)),
    gh.repos.map((r) => r.url)
  );
}));

test("目覚まし時計を押すと睡眠のリボンが出て、触った晩の時刻が読める", () => withPage("clock", {}, async (page) => {
  // 記録のない晩をはさみ、リボンが切れて点線でつながることも見る
  const sl = await page.evaluate(() => {
    const n = window.SLEEP.nights, i = n.length - 10;
    n[i - 1] = n[i - 1] || [1500, 1920, 390]; n[i] = null; n[i + 1] = n[i + 1] || [1500, 1920, 390];
    return window.SLEEP;
  });
  const runs = sl.nights.reduce((r, v, i) => r + (v && !sl.nights[i - 1] ? 1 : 0), 0);
  const panel = await openPanel(page, "clock");
  await panel.locator(".sleep svg .ribbon").first().waitFor();
  assert.equal(await panel.locator(".sleep svg .ribbon").count(), runs, "記録のない晩でリボンが切れていない");
  assert.equal(await panel.locator(".sleep svg .gap").count(), (runs - 1) * 2, "切れ目が点線でつながっていない");
  assert.match(await panel.locator(".stats").textContent(), /Bedtime\s*\d+:\d\d.*Wake-up\s*\d+:\d\d.*Time asleep\s*\d+h \d\dm/s);

  // 最初はいちばん新しい記録の晩。記録のない晩に触ると「no record」
  const last = sl.nights.length - 1 - [...sl.nights].reverse().findIndex(Boolean);
  const day = (i) => { const d = new Date(Date.parse(sl.start) + i * 864e5); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} `; };
  assert.ok((await panel.locator(".readout .now").textContent()).startsWith(day(last)));
  const box = await panel.locator(".sleep svg").boundingBox();
  const vb = await panel.locator(".sleep svg").evaluate((el) => el.viewBox.baseVal.width);
  const L = 34, R = 6, gap = sl.nights.length - 10;
  await page.mouse.move(box.x + (L + (gap + 0.5) * (vb - L - R) / sl.nights.length) * box.width / vb, box.y + box.height / 2);
  assert.match(await panel.locator(".readout .now").textContent(), new RegExp(`^${day(gap)}.*no record`));

  // リンク先のない小物は、一覧のカードを押してもパネルが開く
  await page.click("#panel-close");
  await page.waitForSelector("#panel[open]", { state: "detached" });
  await page.locator("#things button.card").first().click();
  await page.waitForSelector("#panel[open] .sleep");
  assert.equal(await panel.locator("#panel-links a").count(), 0);
}));

test("ヘッドホンを押すと last.fm の画像が出る", () => withPage("audio", {}, async (page) => {
  const data = await roomData(page);
  const panel = await openPanel(page, "audio");
  const link = panel.locator("a.image-link");
  assert.equal(await link.getAttribute("href"), data.items.audio.imageLink);
  await link.locator("img").waitFor();
}));

test("外部が全部落ちていても、部屋が描けてパネルが開く", () => withPage("offline", { offline: true }, async (page) => {
  const panel = await openPanel(page, "books");
  // 表紙が取れなければ枠ごと消える
  await page.waitForFunction(() => !document.querySelector("#panel-extra .covers"));
  assert.ok(await panel.locator("#panel-links a").count() > 0);

  // リポジトリのカード画像が取れなくても、草（github.js から描く）は出る
  await page.click("#panel-close");
  await page.waitForSelector("#panel[open]", { state: "detached" });
  const gh = await openPanel(page, "computer");
  await page.waitForFunction(() => !document.querySelector("#panel .repos a"));
  assert.ok(await gh.locator(".grass i").count() > 0);

  // 日記の写真が取れなくても、見開きの枠とリンクは残り、めくれる
  await page.click("#panel-close");
  await page.waitForSelector("#panel[open]", { state: "detached" });
  const diary = await openPanel(page, "diary");
  await page.waitForFunction(() => !document.querySelector("#panel .spread img"));
  assert.ok(await diary.locator(".spread a.leaf .ph").count() > 0);
  await diary.locator('button[aria-label="前の見開き"]').click();
  assert.equal(await diary.locator(".spread a.leaf").count(), 2);
}));

test("スマホの幅でも横にはみ出さない", () => withPage("mobile", { viewport: { width: 375, height: 812 } }, async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `横に ${overflow}px はみ出している`);
}));
