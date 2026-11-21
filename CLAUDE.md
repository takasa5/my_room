# my_room

自己紹介ページ（Notion）への入口になる静的サイト。GitHub Pages で公開している。

* `index.html`：画面と操作。`scene.js`：部屋を文字の点描で描く。`data.js`：小物と Notion ページの対応表
* `filmarks.js` は `scripts/fetch-filmarks.mjs` が作る（`.github/workflows/update-data.yml` が毎日更新する）。手で書き換えない
* `github.js` は `scripts/fetch-github.mjs` が作る（`.github/workflows/update-data.yml` が毎日更新する）。手で書き換えない
* `diary.js` は `scripts/fetch-diary.mjs` が公開 Notion サイトの Paper Diary から作る（`.github/workflows/update-data.yml` が毎日更新する）。手で書き換えない
* `sleep.js` は `scripts/fetch-sleep.mjs` が Google Health API（旧 Fitbit）から作る（`.github/workflows/update-data.yml` が毎日更新する。Secret の `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`・`GOOGLE_HEALTH_REFRESH_TOKEN` を使う）。手で書き換えない。公開リポジトリなので、出すのは 1 晩につき入眠・起床・睡眠時間（15 分単位）だけにし、取った中身をログに出さない
* `posts.js` は `scripts/fetch-posts.mjs` が公開 Notion サイトから作る（`.github/workflows/update-data.yml` が毎日更新する）。手で書き換えない

## 確認

| コマンド | 中身 |
| --- | --- |
| `npm run check` | `data.js`・`filmarks.js`・`github.js`・`posts.js`・`diary.js`・`sleep.js` の形を確かめる（`scripts/check-data.js`）。ブラウザも外部への通信も使わない |
| `npm run e2e` | `index.html` を Chromium で開き、画面の主な流れを確かめる（`e2e/`） |

どちらも CI（`.github/workflows/test.yml`）で動く。PR で動き、main では `deploy.yml` が公開の前に呼ぶ（通らなければ公開しない）。初回は `npm ci` と `npx playwright-core install chromium` が必要。

`data.js` に新しいキーを足したら、`scripts/check-data.js` も合わせて直す（知らないキーはエラーにしている）。

## 公開

main に push すると `.github/workflows/deploy.yml` が、テストを通したうえで `scripts/build-site.js` の `FILES` にあるファイルだけを GitHub Pages に置く。ページが読むファイルを増やしたら `FILES` に足す（E2E も同じ公開物を配信するので、足し忘れると E2E が失敗する）。

## E2E

E2E を書く、直す、足すか判断するときは、`e2e` スキル（[.claude/skills/e2e/SKILL.md](.claude/skills/e2e/SKILL.md)）に従う。

## データ更新が失敗したとき

`update-data.yml` が失敗すると `.github/workflows/auto-fix-update-data.yml` が動き、Claude（`anthropics/claude-code-action`）が原因を調べる。取得スクリプトを直せて取得が通れば修正 PR、そうでなければ報告 Issue を作る（どちらもラベル `update-data-failure`。同じ取得先で開いているものがあればコメントだけ）。Secret の `CLAUDE_CODE_OAUTH_TOKEN`（または `ANTHROPIC_API_KEY`）が要る。

Claude はログや外部サイトの中身を読むので、プロンプトインジェクションを前提に組んである。

* Claude が動く job（diagnose）は書き込める権限も Secret も持たない。Claude が動かすコマンドはサンドボックスに入れ、繋がる先を取得先のホスト（`scripts/auto-fix/peek.mjs` の `HOSTS` と、workflow の `sandbox.network.allowedDomains`）だけにしている。取得先を増やしたら両方に足す
* Claude の出力は差分と報告文だけ。差分は `scripts/auto-fix/apply-patch.sh` が `scripts/fetch-*.mjs` だけを変えているか確かめてから当て、別の job（verify・publish）が取得を試して PR を作る
* verify の取得コマンドは `update-data.yml` の matrix と引数を揃える

## GitHub Actions

action はタグで書き、`gh actions-lock` で `.github/workflows/actions.lock` に固定する。workflow を変えたら `gh actions-lock` をやり直してコミットする（lockfile とずれた workflow は起動しない）。
