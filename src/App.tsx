import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { FileDown, PanelLeftClose, PanelLeftOpen, Settings, SquarePen } from 'lucide-react'
import { confirm, open, save } from '@tauri-apps/plugin-dialog'
import Editor from './components/Editor'
import NoteList from './components/NoteList'
import SettingsPanel from './components/SettingsPanel'
import { buildClipboardPayload, writeClipboardPayload } from './editor/copy'
import { useNotes } from './hooks/useNotes'
import { useSettings } from './hooks/useSettings'
import { UNTITLED } from './lib/notes'
import { DEFAULT_SHORTCUT } from './lib/settings'
import './App.css'

export default function App() {
  const notes = useNotes()
  const settings = useSettings()
  const viewRef = useRef<EditorView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  const content = notes.selected?.content ?? ''
  // 保存先はレンダー時点の値をそのまま渡す。ref 経由にすると切り替え直後にずれる
  const selectedPath = notes.selected?.path ?? ''

  const create = notes.create

  const toggleSidebar = settings.toggleSidebar

  // --- ⌘N で新規ノート（F-103）、⌘0 で一覧の開閉 ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'n') {
        e.preventDefault()
        void create()
      } else if (e.key === '0') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // どちらも安定した参照なので、毎レンダーで登録し直さない
  }, [create, toggleSidebar])

  // --- F-304: どの経路でコピーしても色を持ち込ませない ---
  //
  // エディタ内の ⌘C は CodeMirror 側の拡張（editor/copy.ts）が処理する。
  // しかし編集エリアの外をクリックしてから ⌘A → ⌘C のように操作すると、
  // copy イベントは body で起きて CodeMirror に届かず、WebKit が画面の見た目
  // （ダークモードなら白い文字色）をそのまま HTML に焼き込んでコピーしてしまう。
  // それを防ぐため、document の capture 段階で全部の copy を捕まえ、
  // エディタ経由でないものは自前の色のない HTML に差し替える。
  const getCopyModeNow = settings.getCopyModeNow
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const node = e.target instanceof Node ? e.target : null
      const el = node instanceof Element ? node : node?.parentElement ?? null
      // エディタの中で起きたものは CodeMirror 側に任せる（state から正確に組み立てる）
      if (el?.closest('.cm-content')) return

      const text = window.getSelection()?.toString() ?? ''
      if (!text || !e.clipboardData) return

      writeClipboardPayload(e.clipboardData, buildClipboardPayload(text, getCopyModeNow()))
      e.preventDefault()
    }
    document.addEventListener('copy', onCopy, true)
    return () => document.removeEventListener('copy', onCopy, true)
  }, [getCopyModeNow])

  // --- F-405: `.md` のドラッグ&ドロップ取り込み ---
  const importFiles = notes.importFiles
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false

    void (async () => {
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setDropActive(true)
        } else if (event.payload.type === 'leave') {
          setDropActive(false)
        } else if (event.payload.type === 'drop') {
          setDropActive(false)
          void importFiles(event.payload.paths)
        }
      })
      if (disposed) stop()
      else unlisten = stop
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [importFiles])

  // --- F-406: ノートを書き出す ---
  async function handleExport() {
    if (!notes.selected) return
    const destination = await save({
      title: 'ノートを書き出す',
      defaultPath: `${notes.selected.title || UNTITLED}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    })
    if (destination) await notes.exportNote(destination, content)
  }

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

  if (!notes.ready) {
    return <div className="loading">読み込み中…</div>
  }

  return (
    <div
      className={`shell${settings.sidebarOpen ? '' : ' is-sidebar-closed'}${
        dropActive ? ' is-drop-active' : ''
      }`}
    >
      {settings.sidebarOpen ? (
        <NoteList
          notes={notes.notes}
          selectedId={notes.selectedId}
          onSelect={(id) => notes.select(id)}
          onDelete={(id) => void handleDelete(id)}
        />
      ) : null}

      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          <button
            className="icon-button"
            onClick={toggleSidebar}
            title={settings.sidebarOpen ? 'ノート一覧を隠す（⌘0）' : 'ノート一覧を出す（⌘0）'}
            aria-label={settings.sidebarOpen ? 'ノート一覧を隠す' : 'ノート一覧を出す'}
          >
            {settings.sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <span className="topbar-title">{notes.selected?.title || UNTITLED}</span>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => void notes.create()}
              title="新しいノートを作る（⌘N）"
              aria-label="新規ノート"
            >
              <SquarePen size={17} />
            </button>
            <button
              className="icon-button"
              onClick={() => void handleExport()}
              disabled={!notes.selected}
              title="このノートを .md ファイルとして書き出す"
              aria-label="ノートを書き出す"
            >
              <FileDown size={17} />
            </button>
            <button
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              title="設定（保存先・コピーの挙動・外観・ホットキー）"
              aria-label="設定"
            >
              <Settings size={17} />
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
          <button className="link" onClick={() => setSettingsOpen(true)} title="クリックで保存先を変更">
            保存先: {notes.dir}
          </button>
          {notes.error ? <span className="error">{notes.error}</span> : null}
        </footer>
      </main>

      {dropActive ? (
        <div className="drop-overlay">
          <p>Markdown ファイルをドロップすると取り込みます</p>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          dir={notes.dir}
          onChangeDir={() => void handleChangeDir()}
          copyMode={settings.copyMode}
          onChangeCopyMode={settings.setCopyMode}
          theme={settings.theme}
          onChangeTheme={settings.setTheme}
          shortcut={settings.shortcut}
          onChangeShortcut={(a) => void settings.setShortcut(a)}
          onResetShortcut={() => void settings.setShortcut(DEFAULT_SHORTCUT)}
          shortcutError={settings.shortcutError}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
