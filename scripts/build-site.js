// 公開するファイルだけを 1 つのディレクトリに集める。デプロイ（.github/workflows/deploy.yml）と E2E の両方がこれを使う。
// ページが読むファイルを増やしたら FILES に足す。足し忘れると E2E が失敗する。
//   node scripts/build-site.js [出力先（既定は _site）]
const fs = require("node:fs");
const path = require("node:path");

const FILES = ["index.html", "data.js", "filmarks.js", "scene.js"];

function buildSite(outDir) {
  const root = path.join(__dirname, "..");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(outDir, f));
  return outDir;
}

module.exports = { FILES, buildSite };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || "_site");
  buildSite(out);
  console.log(`${FILES.length} 件を ${out} に置いた: ${FILES.join(", ")}`);
}
