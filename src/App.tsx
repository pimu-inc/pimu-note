import { useEffect, useRef } from 'react'
import type { EditorView } from '@codemirror/view'
import { writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { confirm, open } from '@tauri-apps/plugin-dialog'
import Editor from './components/Editor'
import NoteList from './components/NoteList'
import { useNotes } from './hooks/useNotes'
import { UNTITLED } from './lib/notes'
import './App.css'

/**
 * Phase 0 で作った暫定 Markdown → HTML 変換。
 * Phase 3 で markdown-it + タグのホワイトリストに差し替える。
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
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
    } else if (line.trim() !== '') {
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')

  return out.join('\n')
}

export default function App() {
  const notes = useNotes()
  const viewRef = useRef<EditorView | null>(null)

  const content = notes.selected?.content ?? ''
  // 保存先はレンダー時点の値をそのまま渡す。ref 経由にすると切り替え直後にずれる
  const selectedPath = notes.selected?.path ?? ''

  const create = notes.create

  // --- F-103: ⌘N で新規ノート ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        void create()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // create は安定した参照なので、毎レンダーで登録し直さない
  }, [create])

  // --- F-104: 削除前に確認する ---
  async function handleDelete(id: string) {
    const target = notes.notes.find((n) => n.id === id)
    if (!target) return

    const ok = await confirm(`「${target.title || UNTITLED}」を削除します。元に戻せません。`, {
      title: 'ノートの削除',
      kind: 'warning',
      okLabel: '削除',
      cancelLabel: 'キャンセル',
    })
    if (ok) await notes.remove(id)
  }

  // --- F-402: 保存先フォルダを選び直す ---
  async function handleChangeDir() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: 'ノートの保存先フォルダを選択',
      defaultPath: notes.dir || undefined,
    })
    if (typeof picked === 'string') await notes.changeDir(picked)
  }

  async function copyBoth() {
    if (!notes.selected) return
    await writeHtml(toHtmlForSpike(content), content)
  }

  async function copyPlainOnly() {
    if (!notes.selected) return
    await writeText(content)
  }

  if (!notes.ready) {
    return <div className="loading">読み込み中…</div>
  }

  return (
    <div className="shell">
      <NoteList
        notes={notes.notes}
        selectedId={notes.selectedId}
        onSelect={notes.select}
        onCreate={() => void notes.create()}
        onDelete={(id) => void handleDelete(id)}
      />

      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          <span className="topbar-title">{notes.selected?.title || UNTITLED}</span>
          <div className="topbar-actions">
            <button onClick={() => void copyBoth()} disabled={!notes.selected}>
              コピー
            </button>
            <button
              className="ghost"
              onClick={() => void copyPlainOnly()}
              disabled={!notes.selected}
            >
              プレーンのみ
            </button>
          </div>
        </header>

        {notes.selected ? (
          <div className="editor-pane">
            <Editor
              initialValue={notes.selected.content}
              noteId={`${notes.selected.id}#${notes.externalRevision}`}
              onChange={(value) => notes.updateContent(value, selectedPath)}
              viewRef={viewRef}
            />
          </div>
        ) : (
          <div className="editor-empty">
            <p>ノートを選ぶか、⌘N で新しく作ってください。</p>
          </div>
        )}

        <footer className="statusbar">
          <button className="link" onClick={() => void handleChangeDir()} title={notes.dir}>
            保存先: {notes.dir}
          </button>
          {notes.error ? <span className="error">{notes.error}</span> : null}
        </footer>
      </main>
    </div>
  )
}
