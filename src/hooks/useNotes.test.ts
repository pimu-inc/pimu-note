import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ノートの保存まわりの回帰テスト。
 *
 * ここで守りたいのは「打った文字が消えない」ことの 2 点。
 * どちらも実際に踏んで直したもので、目視では再現条件が分かりにくいため
 * テストで固定しておく。
 *
 *  1. 自動保存はデバウンスしているので、保存前にファイル監視が発火すると
 *     ディスクには古い内容しかない。それでエディタを巻き戻してはいけない。
 *  2. ノートを切り替えた直後の通知で、新しいノートの内容を
 *     切り替え前のファイルに書き込んではいけない。
 */

const DIR = '/notes'

/** メモリ上の疑似ファイルシステム */
const files = new Map<string, string>()
/** watch() に渡されたコールバック。テストから任意のタイミングで発火させる */
let watchCallback: (() => void) | null = null

vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/documents',
  join: async (...parts: string[]) => parts.join('/'),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => undefined,
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  load: async () => ({
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
  }),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => path === DIR || files.has(path),
  mkdir: async () => undefined,
  readDir: async () =>
    [...files.keys()].map((path) => ({
      name: path.slice(DIR.length + 1),
      isFile: true,
      isDirectory: false,
      isSymlink: false,
    })),
  readTextFile: async (path: string) => {
    const content = files.get(path)
    if (content === undefined) throw new Error(`no such file: ${path}`)
    return content
  },
  writeTextFile: async (path: string, content: string) => {
    files.set(path, content)
  },
  remove: async (path: string) => {
    files.delete(path)
  },
  stat: async () => ({ mtime: new Date(0) }),
  watch: async (_path: string, cb: () => void) => {
    watchCallback = cb
    return () => {
      watchCallback = null
    }
  },
}))

// 保存先を固定するため、既定パスをテスト用のものに合わせる
vi.mock('../lib/settings', async () => {
  const actual = await vi.importActual<typeof import('../lib/settings')>('../lib/settings')
  return {
    ...actual,
    getNotesDir: async () => DIR,
    setNotesDir: async () => undefined,
    getLastNoteId: async () => null,
    setLastNoteId: async () => undefined,
  }
})

const { useNotes } = await import('./useNotes')

beforeEach(() => {
  files.clear()
  watchCallback = null
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

/** デバウンスを進めて保存を確定させる */
async function letSavesRun() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
}

describe('useNotes', () => {
  it('保存前にファイル監視が発火しても、打った内容が巻き戻らない', async () => {
    files.set(`${DIR}/a.md`, '# あああ')

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.selected?.id).toBe('a.md')

    // 「- 」を打った直後（まだ保存されていない）
    act(() => {
      result.current.updateContent('# あああ\n- ', `${DIR}/a.md`)
    })
    expect(result.current.selected?.content).toBe('# あああ\n- ')

    // ここで監視が発火する。ディスクにはまだ古い内容しかない
    expect(files.get(`${DIR}/a.md`)).toBe('# あああ')
    await act(async () => {
      watchCallback?.()
      await vi.advanceTimersByTimeAsync(0)
    })

    // 打った内容が残っていること（巻き戻っていないこと）
    expect(result.current.selected?.content).toBe('# あああ\n- ')

    // デバウンスが明けたらディスクにも反映される
    await letSavesRun()
    expect(files.get(`${DIR}/a.md`)).toBe('# あああ\n- ')
  })

  it('ノートを切り替えた直後の通知で、別のノートのファイルを壊さない', async () => {
    files.set(`${DIR}/a.md`, 'ノートA')
    files.set(`${DIR}/b.md`, 'ノートB')

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => result.current.select('a.md'))
    act(() => {
      result.current.updateContent('ノートA を編集', `${DIR}/a.md`)
    })
    await letSavesRun()
    expect(files.get(`${DIR}/a.md`)).toBe('ノートA を編集')

    // B に切り替え、切り替え直後に B の内容が通知される状況を再現する
    act(() => result.current.select('b.md'))
    act(() => {
      result.current.updateContent('ノートB', `${DIR}/b.md`)
    })
    await letSavesRun()

    // A のファイルが B の内容で上書きされていないこと
    expect(files.get(`${DIR}/a.md`)).toBe('ノートA を編集')
    expect(files.get(`${DIR}/b.md`)).toBe('ノートB')
  })

  it('外部でファイルが書き換わったら取り込み、エディタを作り直す', async () => {
    files.set(`${DIR}/a.md`, '元の内容')

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const revisionBefore = result.current.externalRevision

    // 外部（Finder など）から書き換えられた
    files.set(`${DIR}/a.md`, '外から書き換えた')
    await act(async () => {
      watchCallback?.()
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => expect(result.current.selected?.content).toBe('外から書き換えた'))
    expect(result.current.externalRevision).toBeGreaterThan(revisionBefore)
  })

  it('連続で打っても最後の内容が保存される', async () => {
    files.set(`${DIR}/a.md`, '')

    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.ready).toBe(true))

    for (const text of ['あ', 'あい', 'あいう', 'あいうえ', 'あいうえお']) {
      act(() => result.current.updateContent(text, `${DIR}/a.md`))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
    }

    await letSavesRun()
    expect(files.get(`${DIR}/a.md`)).toBe('あいうえお')
    expect(result.current.selected?.content).toBe('あいうえお')
  })
})
