// 公開するファイルだけを 1 つのディレクトリに集める。デプロイ（.github/workflows/deploy.yml）と E2E の両方がこれを使う。
// ページが読むファイル（OGP の画像も含む）を増やしたら FILES に足す。足し忘れると E2E が失敗する。
// あわせて、部屋の絵をここで描いておく（ブラウザで毎回レイトレースしないように）。
//   * 部屋の絵: 公開する index.html の <!-- room-art --> を、画面幅ごとの <template class="room-art"> に置き換える
//   * 一覧の寄りの AA: 画面幅・小物ごとに art/<文字数>/<小物の id>.html に書く（見えてきたカードの分だけ読む）
// どちらも scene.js の採用中の版（Scene.DEFAULT_STYLE）。?style= で別の版を選んだときは、ページがその場で描く。
//   node scripts/build-site.js [出力先（既定は _site）]
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Scene = require("../scene.js");

const FILES = [
  "index.html", "data.js", "filmarks.js", "github.js", "posts.js", "diary.js", "sleep.js", "lives.js", "scene.js", "social-preview.png",
  "fonts/JetBrainsMono-latin.woff2", "fonts/OFL.txt"
];

// 描いておく画面幅。index.html は上から順に data-media に合う最初のものを使う（data-media がなければ常に合う）
const VARIANTS = [
  { cols: Scene.NARROW.cols, media: `not all and (min-width: ${Scene.NARROW.width}px)` },
  { cols: Scene.STYLES[Scene.DEFAULT_STYLE].cols, media: null }
];

async function buildSite(outDir) {
  const root = path.join(__dirname, "..");
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const f of FILES) {
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.copyFileSync(path.join(root, f), path.join(outDir, f));
  }

  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox, { filename: "data.js" });
  const items = sandbox.window.ROOM_DATA.items;

  const templates = [];
  for (const v of VARIANTS) {
    const art = await Scene.prerender(items, v.cols);
    const media = v.media ? ` data-media="${v.media}"` : "";
    templates.push(`<template class="room-art" data-style="${Scene.DEFAULT_STYLE}" data-cols="${art.cols}" data-rows="${art.rows}" data-cell="${Scene.CELL_ASPECT}"${media}>${art.html}</template>`);
    const dir = path.join(outDir, "art", String(art.cols));
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, crop] of Object.entries(art.crops)) fs.writeFileSync(path.join(dir, `${id}.html`), crop);
  }

  const indexPath = path.join(outDir, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  const MARK = "<!-- room-art -->";
  if (html.split(MARK).length !== 2) throw new Error(`index.html に ${MARK} がちょうど 1 つない`);
  fs.writeFileSync(indexPath, html.replace(MARK, () => templates.join("\n")));
  return outDir;
}

module.exports = { FILES, buildSite };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || "_site");
  buildSite(out).then(() => console.log(`${FILES.length} 件と、描いておいた部屋の絵を ${out} に置いた: ${FILES.join(", ")}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
