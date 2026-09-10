import { useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { readText, writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'
import Editor from './components/Editor'
import './App.css'

/**
 * Phase 0 スパイク用の暫定 Markdown → HTML 変換。
 *
 * 本実装（Phase 3）では markdown-it + タグのホワイトリストに差し替える。
 */
function toHtmlForSpike(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')

  const out: string[] = []
  let inList = false

  for (const line of md.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)

    if (item) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(item[1])}</li>`)
      continue
    }
    if (inList) {
      out.push('</ul>')
      inList = false
    }
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (line.trim() === '') {
      // 空行は段落の区切りとしてのみ扱う
    } else {
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')

  return out.join('\n')
}

const SAMPLE = `# pimu-note

Markdown を書いて、**Markdown のまま**コピーできるメモアプリ。

## 入力支援の確認

- この行末で Enter を押すと次の \`- \` が自動で出る
- 空の項目で Enter を押すと解除される
- Tab / Shift+Tab でインデントの上げ下げ

1. 番号リストも自動採番される
2. ふたつめ

- [ ] チェックボックスも継続する

## ハイライトの確認

**太字** と *斜体* と \`インラインコード\` と [リンク](https://example.com)。

> 引用は控えめな色になる

見出しも本文も**文字の大きさは同じ**まま。行の高さが揺れないことを確認する。
`

export default function App() {
  const [md, setMd] = useState(SAMPLE)
  const [log, setLog] = useState<string[]>([])
  const viewRef = useRef<EditorView | null>(null)

  const say = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString('ja-JP')}  ${msg}`, ...prev].slice(0, 8))

  async function copyBoth() {
    try {
      const html = toHtmlForSpike(md)
      await writeHtml(html, md)
      say(`両方コピー OK: HTML ${html.length} 文字 / Markdown ${md.length} 文字`)
    } catch (e) {
      say(`両方コピー 失敗: ${String(e)}`)
    }
  }

  async function copyPlainOnly() {
    try {
      await writeText(md)
      say('プレーンのみコピー OK')
    } catch (e) {
      say(`プレーンのみ 失敗: ${String(e)}`)
    }
  }

  async function inspectClipboard() {
    try {
      const text = await readText()
      say(`読み出し: ${JSON.stringify(text.slice(0, 50))}${text.length > 50 ? '…' : ''}`)
    } catch (e) {
      say(`読み出し 失敗: ${String(e)}`)
    }
  }

  return (
    <div className="shell">
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar-label">pimu-note — Phase 1</span>
      </div>

      <div className="editor-pane">
        <Editor initialValue={SAMPLE} noteId="spike" onChange={setMd} viewRef={viewRef} />
      </div>

      <footer className="toolbar">
        <div className="row">
          <button onClick={copyBoth}>両方コピー</button>
          <button className="ghost" onClick={copyPlainOnly}>
            プレーンのみ
          </button>
          <button className="ghost" onClick={inspectClipboard}>
            クリップボードを読む
          </button>
        </div>
        <ul className="log">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </footer>
    </div>
  )
}
