# pimu-note

Markdown で書いて、**Markdown のままコピーできる** macOS 用のメモアプリ。

Raycast の Note は書き心地がいい一方で、コピーすると `#` や `**` が消えてしまい、
Markdown のソースをそのまま貼りたい場面で使えません。pimu-note はそこを解決します。

| 貼り先での操作 | 貼られるもの |
| --- | --- |
| `⌘V`（Gmail / Slack / Notion など） | 書式付き。ただしアプリの色やフォントは持ち込まれない |
| `⌘⇧V`（同上） | `#` 付きの Markdown ソース |
| `⌘V`（VSCode / GitHub の入力欄など） | Markdown ソース（自動的にこちらが選ばれる） |

---

## 使う人向け

### インストール

1. [Releases](../../releases) から最新の `.dmg` をダウンロードする
2. dmg を開き、pimu-note を「アプリケーション」フォルダにドラッグする
3. **初回だけ** Gatekeeper に止められます（下記）

### 初回起動の手順

このアプリは Apple Developer Program の署名を付けていないため、
初回だけ macOS に止められます。**1 回やれば以降は普通に起動できます。**

1. アプリをダブルクリックする → 「開けません」と出る
2. `システム設定` → `プライバシーとセキュリティ` を開く
3. 画面の下の方に出ている
   「"pimu-note"は開発元を確認できないため、使用がブロックされました」の横の
   **「このまま開く」** をクリックする
4. もう一度ダブルクリックすると起動する

> **なぜ署名していないのか**
> Apple Developer Program は年 $99 かかります。配布先が 4 名なので、
> 初回に一度この手順を案内する方が費用に見合うと判断しました。
> 配布人数が増えたら署名に移行します。
> ダウンロードしたファイルが正しいものかは、リリースノートの
> SHA-256 チェックサムで確認できます。

### 動作環境

- macOS 14 (Sonoma) 以降
- Apple Silicon（M1 以降）専用

### 主な使い方

| キー | 動作 |
| --- | --- |
| `⌘⌥N` | どのアプリを使っていても pimu-note を呼び出す（設定で変更可） |
| `⌘N` | 新規ノート |
| `⌘C` | コピー（書式付きとプレーンの両方をクリップボードに載せる） |
| `⌘⇧C` | プレーンのみコピー |
| `⌘B` / `⌘I` / `⌘E` | 太字 / 斜体 / インラインコード |
| `Tab` / `⇧Tab` | リストのインデント上げ下げ |

- ノートは 1 つずつ `.md` ファイルとして `~/Documents/pimu-note/` に保存されます
- 保存先は設定から変更できます。iCloud Drive の中を指定すれば端末間で同期できます
- ウィンドウを閉じてもアプリは常駐します。ホットキーか Dock アイコンで戻れます
- 終了するには `⌘Q`

---

## 開発する人向け

### 必要なもの

- Node.js 22 以降 と pnpm
- Rust（安定版）
- Xcode Command Line Tools

Homebrew の `rustup` は keg-only なので、PATH を通す必要があります。

```bash
brew install rustup
rustup default stable
echo 'export PATH="/opt/homebrew/opt/rustup/bin:$PATH"' >> ~/.zshrc
```

### 起動

```bash
pnpm install
pnpm tauri dev
```

### 検査

```bash
pnpm exec tsc -b   # 型チェック
pnpm exec oxlint src  # 静的解析
pnpm test          # テスト
```

### 構成

```
src/
├─ components/   NoteList / Editor / SettingsPanel / ShortcutRecorder
├─ editor/       CodeMirror の拡張（ハイライト、入力支援、コピー）
├─ hooks/        useNotes（保存とファイル監視）/ useSettings
└─ lib/          notes / clipboard / settings / accelerator
src-tauri/       Rust 側。プラグインの登録とウィンドウ制御に徹している
docs/            要件定義とデザイン
```

設計の背景や、実装中に踏んだ落とし穴は [`docs/requirements.md`](docs/requirements.md)
に記録してあります。特に次の 2 つは、直したあとも再発しやすいので目を通してください。

- 自動保存とファイル監視の競合（打った文字が巻き戻る）
- ホットキーの判定を可視状態だけで行うと 2 回押さないと出てこなくなる

### リリース

タグを打つと GitHub Actions がビルドし、`.dmg` を Releases に添付します。

```bash
git tag v0.1.0
git push origin v0.1.0
```

手元でビルドしたものは配布しません。出所がはっきりしないバイナリを
社内に配らないためです。

### アイコンを作り直す

```bash
python3 -m venv /tmp/icon-venv
/tmp/icon-venv/bin/pip install pillow
/tmp/icon-venv/bin/python tools/make_icon.py docs/design/icon-1024.png
pnpm tauri icon docs/design/icon-1024.png
```
