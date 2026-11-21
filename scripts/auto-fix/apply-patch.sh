#!/usr/bin/env bash
# Claude が作った修正（git diff）を、変えてよいファイルだけを変えているか確かめてから当てる。
# .github/workflows/auto-fix-update-data.yml の verify・publish job が、main の checkout の上で使う。
#   使い方: scripts/auto-fix/apply-patch.sh <patch>
# 当てたファイルを 1 行ずつ出す。だめなら理由を標準エラーに出して 1 で終わる。
set -euo pipefail
patch="$1"

if [ ! -s "$patch" ]; then
  echo "修正がない" >&2
  exit 1
fi

# 新規・削除・名前の変更・モードの変更（symlink を含む）は受けない
summary=$(git apply --summary "$patch")
if [ -n "$summary" ]; then
  echo "ファイルの追加・削除・名前やモードの変更を含んでいる:" >&2
  echo "$summary" >&2
  exit 1
fi

# 変えてよいのは取得スクリプトだけ（データ・workflow・check-data.js・この仕組み自体は変えさせない）
files=$(git apply --numstat "$patch" | cut -f3-)
bad=$(grep -vxE 'scripts/fetch-(filmarks|github|posts|diary|sleep)\.mjs' <<< "$files" || true)
if [ -n "$bad" ]; then
  echo "変えてはいけないファイルを変えている:" >&2
  echo "$bad" >&2
  exit 1
fi

git apply --check "$patch"
git apply "$patch"
echo "$files"
