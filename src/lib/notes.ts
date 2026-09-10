import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs'

/**
 * ノートの読み書き。要件 F-101〜106 と F-401〜406。
 *
 * 1ノート = 1つの `.md` ファイル。ファイル名は作成日時から作った固定名で、
 * 以降リネームしない。用途が下書き用のスクラッチであり、Finder から
 * ファイルを探しに行くことは想定していないため、
 * リネームに伴う同名衝突やクラウド同期中の事故を避ける方を優先している。
 */

export type Note = {
  /** ファイル名（拡張子込み）。これがそのまま識別子になる */
  id: string
  path: string
  content: string
  /** 本文から導出した表示用タイトル（F-102） */
  title: string
  /** 更新日時（ミリ秒）。一覧の並び順に使う（F-105） */
  updatedAt: number
}

const EXT = '.md'
export const UNTITLED = '無題'

/**
 * F-102: 本文の1行目からタイトルを作る。
 * `# ` や `- ` などの記法記号は表示上取り除くが、本文自体には手を入れない。
 */
export function deriveTitle(content: string): string {
  for (const raw of content.split('\n')) {
    const line = raw
      .replace(/^\s*#{1,6}\s+/, '') // 見出し
      .replace(/^\s*>\s?/, '') // 引用
      .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '') // チェックボックス
      .replace(/^\s*[-*+]\s+/, '') // 箇条書き
      .replace(/^\s*\d+\.\s+/, '') // 番号リスト
      .replace(/[*_`~]/g, '') // 強調・コードの記号
      .trim()
    if (line) return line.slice(0, 80)
  }
  return UNTITLED
}

/** 作成日時から一意なファイル名を作る。同じ秒に作られた場合は連番を足す */
function timestampFileName(now: Date, taken: ReadonlySet<string>): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  const base = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(
    now.getHours(),
  )}${p(now.getMinutes())}${p(now.getSeconds())}`

  let name = `${base}${EXT}`
  let i = 2
  while (taken.has(name)) {
    name = `${base}-${i}${EXT}`
    i += 1
  }
  return name
}

/** 保存先フォルダが無ければ作る */
export async function ensureDir(dir: string): Promise<void> {
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

/** F-105: 保存先のノートを読み込み、更新日時の降順で返す */
export async function listNotes(dir: string): Promise<Note[]> {
  await ensureDir(dir)

  const entries = await readDir(dir)
  const notes: Note[] = []

  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith(EXT)) continue

    const path = await join(dir, entry.name)
    try {
      const [content, info] = await Promise.all([readTextFile(path), stat(path)])
      notes.push({
        id: entry.name,
        path,
        content,
        title: deriveTitle(content),
        updatedAt: info.mtime?.getTime() ?? 0,
      })
    } catch {
      // 読めないファイルは一覧から黙って外す。
      // 同期中の一時ファイルなどが混ざることがあるため、ここで落とさない。
    }
  }

  return notes.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** F-103: 新規ノートを作る */
export async function createNote(dir: string, existingIds: ReadonlySet<string>): Promise<Note> {
  await ensureDir(dir)

  const id = timestampFileName(new Date(), existingIds)
  const path = await join(dir, id)
  await writeTextFile(path, '')

  return { id, path, content: '', title: UNTITLED, updatedAt: Date.now() }
}

/** F-106: 本文を保存する */
export async function saveNote(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
}

/** F-104: ノートを削除する */
export async function deleteNote(path: string): Promise<void> {
  await remove(path)
}

/**
 * F-405: 外部の `.md` を取り込む。中身をコピーして新しいノートにする。
 *
 * 取り込み元は保存先フォルダの外にあり fs プラグインのスコープで扱えないため、
 * 読み出しは Rust 側のコマンドに任せる（拡張子はそちらで検証している）。
 */
export async function importMarkdown(
  dir: string,
  sourcePath: string,
  existingIds: ReadonlySet<string>,
): Promise<Note> {
  const content = await invoke<string>('read_markdown_file', { path: sourcePath })
  const note = await createNote(dir, existingIds)
  await saveNote(note.path, content)
  return { ...note, content, title: deriveTitle(content), updatedAt: Date.now() }
}

/** F-406: ノートを任意の場所に書き出す */
export async function exportMarkdown(destination: string, content: string): Promise<void> {
  await invoke('write_markdown_file', { path: destination, content })
}
