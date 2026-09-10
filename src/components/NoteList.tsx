import { X } from 'lucide-react'
import type { Note } from '../lib/notes'
import { UNTITLED } from '../lib/notes'

type Props = {
  notes: Note[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

/** 更新日時を「今日 14:32」「9/8」のように短く表す */
function formatUpdatedAt(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (sameDay) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 一覧に出す 2 行目。本文からタイトル行を除いた最初の中身 */
function preview(note: Note): string {
  const lines = note.content.split('\n')
  const titleIndex = lines.findIndex((l) => l.trim() !== '')
  const rest = lines
    .slice(titleIndex + 1)
    .map((l) => l.trim())
    .filter(Boolean)
  return rest[0]?.slice(0, 60) ?? ''
}

export default function NoteList({ notes, selectedId, onSelect, onDelete }: Props) {
  return (
    <aside className="notelist">
      {notes.length === 0 ? (
        <p className="notelist-empty">
          ノートがありません。
          <br />
上のボタン（⌘N）で作成してください。
        </p>
      ) : (
        <ul className="notelist-items">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                className={`notelist-item${note.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => onSelect(note.id)}
              >
                <span className="notelist-title">
                  {note.title || UNTITLED}
                </span>
                <span className="notelist-meta">
                  <span className="notelist-date">{formatUpdatedAt(note.updatedAt)}</span>
                  <span className="notelist-preview">{preview(note)}</span>
                </span>
              </button>
              <button
                className="notelist-delete"
                title="このノートを削除"
                onClick={() => onDelete(note.id)}
                aria-label={`${note.title || UNTITLED} を削除`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
