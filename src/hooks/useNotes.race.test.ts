import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 再現テスト: 一覧の読み直し（ファイル監視）と自動保存が交差したときの巻き戻り。
 *
 * 実機ではノートが数十件あり、監視が発火するたびに全件を読み直すので
 * 読み直しに数百 ms かかる。その間に保存が 1 回挟まると、
 * 読み直しの結果は「保存前の古い内容」なのに、突き合わせの時点では
 * 未保存フラグが下りているため「外部で書き換えられた」と誤認する。
 */

const DIR = '/notes'
const files = new Map<string, string>()
/** 書き込みのたびに進む更新日時。listNotes のキャッシュ判定に使われる */
const mtimes = new Map<string, number>()
let tick = 0
const rawSet = files.set.bind(files)
files.set = (key: string, value: string) => {
  mtimes.set(key, ++tick)
  return rawSet(key, value)
}
let watchCallback: (() => void) | null = null
/** 読み出しを途中で止めておくための栓。中身は「読み始めた時点」のもので確定させる */
let readGate: Promise<void> | null = null
/** 中身を実際に読みに行ったパスの記録 */
const readLog: string[] = []

vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/documents',
  join: async (...parts: string[]) => parts.join('/'),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => undefined }))
vi.mock('@tauri-apps/plugin-store', () => ({
  load: async () => ({ get: async () => undefined, set: async () => undefined, delete: async () => undefined }),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => path === DIR || files.has(path),
  mkdir: async () => undefined,
  readDir: async () =>
    [...files.keys()].map((path) => ({ name: path.slice(DIR.length + 1), isFile: true, isDirectory: false, isSymlink: false })),
  readTextFile: async (path: string) => {
    readLog.push(path)
    const snapshot = files.get(path)
    if (snapshot === undefined) throw new Error(`no such file: ${path}`)
    if (readGate) await readGate
    return snapshot
  },
  writeTextFile: async (path: string, content: string) => void files.set(path, content),
  remove: async (path: string) => void files.delete(path),
  stat: async (path: string) => ({
    mtime: new Date(mtimes.get(path) ?? 0),
    size: files.get(path)?.length ?? 0,
  }),
  watch: async (_path: string, cb: () => void) => {
    watchCallback = cb
    return () => { watchCallback = null }
  },
}))
vi.mock('../lib/settings', async () => {
  const actual = await vi.importActual<typeof import('../lib/settings')>('../lib/settings')
  return { ...actual, getNotesDir: async () => DIR, setNotesDir: async () => undefined, getLastNoteId: async () => null, setLastNoteId: async () => undefined }
})

const { useNotes } = await import('./useNotes')

beforeEach(() => {
  files.clear(); watchCallback = null; readGate = null; readLog.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

describe('再現: 読み直しと保存の交差', () => {
  it('読み直し中に保存が挟まると、打った内容が巻き戻りカーソルも先頭に飛ぶ', async () => {
    const P = `${DIR}/a.md`
    files.set(P, '- いち')

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const revision0 = result.current.externalRevision

    // 1) 少し打って保存される
    act(() => result.current.updateContent('- いち\n- に', P))
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(files.get(P)).toBe('- いち\n- に')

    // 2) その保存を受けて監視が発火し、一覧の読み直しが始まる（読み終わるまで時間がかかる）
    let openGate!: () => void
    readGate = new Promise<void>((r) => { openGate = r })
    await act(async () => { watchCallback?.(); await vi.advanceTimersByTimeAsync(0) })

    // 3) 読み直しの最中に続きを打ち、それも保存まで終わる
    act(() => result.current.updateContent('- いち\n- に\n- さん', P))
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(files.get(P)).toBe('- いち\n- に\n- さん')

    // 4) 読み直しが完了する（手に持っているのは 2) の時点の古い内容）
    await act(async () => { openGate(); readGate = null; await vi.advanceTimersByTimeAsync(0) })

    // 期待: 打った内容がそのまま残り、エディタも作り直されない
    expect(result.current.selected?.content).toBe('- いち\n- に\n- さん')
    expect(result.current.externalRevision).toBe(revision0)
  })

  it('監視が発火しても、変わっていないノートは読み直さない', async () => {
    for (let i = 0; i < 30; i++) files.set(`${DIR}/n${i}.md`, `ノート${i}`)
    const P = `${DIR}/n0.md`

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(readLog).toHaveLength(30)

    // 1 件だけ編集して保存し、その保存で監視が発火する
    act(() => result.current.select('n0.md'))
    act(() => result.current.updateContent('ノート0 を編集', P))
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    readLog.length = 0
    await act(async () => { watchCallback?.(); await vi.advanceTimersByTimeAsync(0) })

    // 読み直すのは書き換わった 1 件だけ
    expect(readLog).toEqual([P])
    expect(result.current.notes).toHaveLength(30)
  })
})
