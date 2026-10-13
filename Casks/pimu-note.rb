# version と sha256 はリリースの CI（.github/workflows/release.yml）が書き換える。手で編集しない。
cask "pimu-note" do
  version "0.1.2"
  sha256 "7ef901174d2437315a2b272ddd495dd45a2fa8ce24aa638090d87dc2556d84af"

  url "https://github.com/pimu-inc/pimu-note/releases/download/v#{version}/pimu-note_#{version}_aarch64.dmg"
  name "pimu-note"
  desc "Markdown のままコピーできるメモアプリ"
  homepage "https://github.com/pimu-inc/pimu-note"

  depends_on arch: :arm64
  depends_on macos: :sonoma

  app "pimu-note.app"

  # D-103: ad-hoc 署名のため、quarantine 属性が残ると初回起動で Gatekeeper に止められる。
  # ダウンロードしたファイルの検証は brew が sha256 で行う（D-104）ので、ここで属性を外す。
  postflight_steps do
    run "/usr/bin/xattr",
        args:           ["-dr", "com.apple.quarantine", "{{appdir}}/pimu-note.app"],
        writable_paths: ["{{appdir}}/pimu-note.app"]
  end

  # ウィンドウを閉じても常駐するので、upgrade の前に終了させる
  uninstall quit: "com.pimu.note"

  # ノート本体（~/Documents/pimu-note/ など）は利用者のデータなので消さない
  zap trash: [
    "~/Library/Application Support/com.pimu.note",
    "~/Library/Caches/com.pimu.note",
    "~/Library/Logs/com.pimu.note",
    "~/Library/Preferences/com.pimu.note.plist",
    "~/Library/WebKit/com.pimu.note",
  ]
end
