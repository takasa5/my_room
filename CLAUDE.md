# my_room

自己紹介ページ（Notion）への入口になる静的サイト。GitHub Pages が main のルートをそのまま配信するので、**main へのマージがそのまま公開になる**。

* `index.html`：画面と操作。`scene.js`：部屋を文字の点描で描く。`data.js`：小物と Notion ページの対応表
* `filmarks.js` は `scripts/fetch-filmarks.mjs` が作る（`.github/workflows/filmarks.yml` が毎日更新する）。手で書き換えない

## 確認

| コマンド | 中身 |
| --- | --- |
| `npm run check` | `data.js` と `filmarks.js` の形を確かめる（`scripts/check-data.js`）。ブラウザも外部への通信も使わない |
| `npm run e2e` | `index.html` を Chromium で開き、画面の主な流れを確かめる（`e2e/`） |

どちらも CI（`.github/workflows/test.yml`）で動く。初回は `npm ci` と `npx playwright-core install chromium` が必要。

`data.js` に新しいキーを足したら、`scripts/check-data.js` も合わせて直す（知らないキーはエラーにしている）。

## E2E

E2E を書く、直す、足すか判断するときは、`e2e` スキル（[.claude/skills/e2e/SKILL.md](.claude/skills/e2e/SKILL.md)）に従う。

## GitHub Actions

action はタグで書き、`gh actions-lock` で `.github/workflows/actions.lock` に固定する。workflow を変えたら `gh actions-lock` をやり直してコミットする（lockfile とずれた workflow は起動しない）。
