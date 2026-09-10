import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { confirm, open } from '@tauri-apps/plugin-dialog'
import Editor from './components/Editor'
import NoteList from './components/NoteList'
import SettingsPanel from './components/SettingsPanel'
import { useNotes } from './hooks/useNotes'
import { useSettings } from './hooks/useSettings'
import { markdownToSafeHtml } from './lib/clipboard'
import { UNTITLED } from './lib/notes'
import './App.css'

export default function App() {
  const notes = useNotes()
  const settings = useSettings()
  const viewRef = useRef<EditorView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  /** ツールバーからのコピー。⌘C と違い、選択に関係なくノート全体を対象にする */
  async function copyWholeNote() {
    if (!notes.selected) return
    if (settings.copyMode === 'plain') {
      await writeText(content)
    } else {
      await writeHtml(markdownToSafeHtml(content), content)
    }
  }

  async function copyWholeNotePlain() {
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
            <button onClick={() => void copyWholeNote()} disabled={!notes.selected}>
              全文コピー
            </button>
            <button
              className="ghost"
              onClick={() => void copyWholeNotePlain()}
              disabled={!notes.selected}
            >
              プレーンのみ
            </button>
            <button className="ghost" onClick={() => setSettingsOpen(true)} title="設定">
              設定
            </button>
          </div>
        </header>

        {notes.selected ? (
          <div className="editor-pane">
            <Editor
              initialValue={notes.selected.content}
              noteId={`${notes.selected.id}#${notes.externalRevision}`}
              onChange={(value) => notes.updateContent(value, selectedPath)}
              isDark={settings.isDark}
              getCopyMode={settings.getCopyModeNow}
              viewRef={viewRef}
            />
          </div>
        ) : (
          <div className="editor-empty">
            <p>ノートを選ぶか、⌘N で新しく作ってください。</p>
          </div>
        )}

        <footer className="statusbar">
          <button className="link" onClick={() => setSettingsOpen(true)} title={notes.dir}>
            保存先: {notes.dir}
          </button>
          {notes.error ? <span className="error">{notes.error}</span> : null}
        </footer>
      </main>

      {settingsOpen ? (
        <SettingsPanel
          dir={notes.dir}
          onChangeDir={() => void handleChangeDir()}
          copyMode={settings.copyMode}
          onChangeCopyMode={settings.setCopyMode}
          theme={settings.theme}
          onChangeTheme={settings.setTheme}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
