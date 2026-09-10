import { useCallback, useEffect, useRef, useState } from 'react'
import { watch } from '@tauri-apps/plugin-fs'
import { createNote, deleteNote, deriveTitle, listNotes, saveNote, type Note } from '../lib/notes'
import { getLastNoteId, getNotesDir, setLastNoteId, setNotesDir } from '../lib/settings'

const SAVE_DEBOUNCE_MS = 500
const WATCH_DEBOUNCE_MS = 400

export type NotesState = {
  ready: boolean
  dir: string
  notes: Note[]
  selectedId: string | null
  selected: Note | null
  /** 外部からの変更でエディタを作り直させるための世代番号 */
  externalRevision: number
  error: string | null
}

const INITIAL: NotesState = {
  ready: false,
  dir: '',
  notes: [],
  selectedId: null,
  selected: null,
  externalRevision: 0,
  error: null,
}

export function useNotes() {
  const [state, setState] = useState<NotesState>(INITIAL)

  const dirRef = useRef('')
  const notesRef = useRef<Note[]>([])

  /**
   * ディスク上にあると分かっている内容。読み込み時と保存成功時に更新する。
   * 「ディスクの内容がこれと違う」= 外部から書き換えられた、と判定するための基準。
   */
  const lastKnownDisk = useRef(new Map<string, string>())

  /**
   * まだ保存し終えていない変更を持つパス。
   *
   * ここに入っているノートは、たとえファイル監視が発火しても
   * ディスクの内容で上書きしてはいけない。自動保存はデバウンスしているので、
   * 監視が発火した時点のディスクの内容は「利用者が打った最新」より古い。
   * これを上書きしてしまうと、打ったばかりの文字が巻き戻る。
   */
  const dirtyPaths = useRef(new Set<string>())

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ path: string; content: string } | null>(null)

  const setError = useCallback((e: unknown) => {
    console.error('[pimu-note]', e)
    setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }))
  }, [])

  // 非同期処理から同期的に参照したい値を ref に写す
  useEffect(() => {
    notesRef.current = state.notes
  }, [state.notes])

  // --- 保存 ---
  const flushSave = useCallback(async () => {
    const job = pendingSave.current
    if (!job) return
    pendingSave.current = null

    try {
      await saveNote(job.path, job.content)
      lastKnownDisk.current.set(job.path, job.content)
      // 保存中にさらに打たれていなければ、未保存フラグを下ろす
      if (!pendingSave.current) dirtyPaths.current.delete(job.path)
    } catch (e) {
      // 保存できなかったものは未保存のままにしておく
      setError(e)
    }
  }, [setError])

  const scheduleSave = useCallback(
    (path: string, content: string) => {
      dirtyPaths.current.add(path)
      pendingSave.current = { path, content }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
    },
    [flushSave],
  )

  const flushNow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await flushSave()
  }, [flushSave])

  /**
   * ディスクの内容と手元の状態を突き合わせる。
   *
   * 原則は「編集中のノートについてはエディタ側が正」。
   * 未保存の変更があるノートはディスクの内容で置き換えず、手元の内容を残す。
   */
  const reconcile = useCallback((diskNotes: Note[], fromWatcher: boolean) => {
    setState((s) => {
      const inMemory = new Map(s.notes.map((n) => [n.id, n]))
      let externalRevision = s.externalRevision

      const merged = diskNotes.map((disk) => {
        const mine = inMemory.get(disk.id)

        if (dirtyPaths.current.has(disk.path) && mine) {
          // 保存待ちの変更がある。ディスクの内容は古いので採用しない
          return mine
        }

        const known = lastKnownDisk.current.get(disk.path)
        const changedOutside = known !== undefined && known !== disk.content
        lastKnownDisk.current.set(disk.path, disk.content)

        // 開いているノートが外から書き換わったときだけエディタを作り直す
        if (fromWatcher && changedOutside && disk.id === s.selectedId) {
          externalRevision += 1
        }
        return disk
      })

      const selectedId =
        s.selectedId && merged.some((n) => n.id === s.selectedId)
          ? s.selectedId
          : (merged[0]?.id ?? null)

      return {
        ...s,
        notes: merged,
        selectedId,
        selected: merged.find((n) => n.id === selectedId) ?? null,
        externalRevision,
        error: null,
      }
    })
  }, [])

  const reload = useCallback(
    async (opts?: { fromWatcher?: boolean }) => {
      const dir = dirRef.current
      if (!dir) return
      try {
        const diskNotes = await listNotes(dir)
        reconcile(diskNotes, opts?.fromWatcher ?? false)
      } catch (e) {
        setError(e)
      }
    },
    [reconcile, setError],
  )

  // --- 初期化 ---
  useEffect(() => {
    let disposed = false

    async function init() {
      try {
        const dir = await getNotesDir()
        dirRef.current = dir

        const notes = await listNotes(dir)
        for (const n of notes) lastKnownDisk.current.set(n.path, n.content)

        const lastId = await getLastNoteId()
        const selectedId =
          lastId && notes.some((n) => n.id === lastId) ? lastId : (notes[0]?.id ?? null)

        if (disposed) return
        setState({
          ready: true,
          dir,
          notes,
          selectedId,
          selected: notes.find((n) => n.id === selectedId) ?? null,
          externalRevision: 0,
          error: null,
        })
      } catch (e) {
        if (!disposed) {
          setError(e)
          setState((s) => ({ ...s, ready: true }))
        }
      }
    }

    void init()
    return () => {
      disposed = true
    }
  }, [setError])

  // --- F-404: 保存先フォルダの監視 ---
  useEffect(() => {
    if (!state.ready || !state.dir) return

    const dir = state.dir
    let unwatch: (() => void) | null = null
    let disposed = false

    async function start() {
      try {
        const stop = await watch(dir, () => void reload({ fromWatcher: true }), {
          delayMs: WATCH_DEBOUNCE_MS,
        })
        if (disposed) stop()
        else unwatch = stop
      } catch (e) {
        // 監視できなくても編集自体は続けられるので致命扱いにしない
        console.warn('[pimu-note] ファイル監視を開始できませんでした', e)
      }
    }

    void start()
    return () => {
      disposed = true
      unwatch?.()
    }
  }, [state.ready, state.dir, reload])

  // --- 編集 ---
  /**
   * 本文が変わったときに呼ぶ。
   *
   * 保存先の `path` は呼び出し側から明示的に受け取る。
   * ref に覚えさせておく方式だと、ノートを切り替えた直後に
   * 「新しいノートの中身を古いノートのファイルへ書く」事故が起きうる。
   * React では子コンポーネントの effect が親より先に走るため、
   * エディタが中身を差し替えて onChange を呼ぶ時点では
   * 親側の ref がまだ切り替え前を指しているため。
   */
  const updateContent = useCallback(
    (content: string, path: string) => {
      // 保存より先に未保存フラグを立てる。
      // これがないと、この直後に監視が発火したときに巻き戻される。
      scheduleSave(path, content)

      setState((s) => {
        if (!s.selected || s.selected.path !== path) return s
        const updated: Note = {
          ...s.selected,
          content,
          title: deriveTitle(content),
          updatedAt: Date.now(),
        }
        return {
          ...s,
          selected: updated,
          notes: s.notes.map((n) => (n.id === updated.id ? updated : n)),
        }
      })
    },
    [scheduleSave],
  )

  const select = useCallback(
    (id: string) => {
      void flushNow()
      setState((s) => ({
        ...s,
        selectedId: id,
        selected: s.notes.find((n) => n.id === id) ?? null,
      }))
      void setLastNoteId(id)
    },
    [flushNow],
  )

  // --- F-103: 新規作成 ---
  const create = useCallback(async () => {
    try {
      await flushNow()

      const dir = dirRef.current
      const ids = new Set(notesRef.current.map((n) => n.id))
      const note = await createNote(dir, ids)
      lastKnownDisk.current.set(note.path, '')

      setState((s) => ({
        ...s,
        notes: [note, ...s.notes.filter((n) => n.id !== note.id)],
        selectedId: note.id,
        selected: note,
      }))
      void setLastNoteId(note.id)
    } catch (e) {
      setError(e)
    }
  }, [flushNow, setError])

  // --- F-104: 削除 ---
  const remove = useCallback(
    async (id: string) => {
      const target = notesRef.current.find((n) => n.id === id)
      if (!target) return

      try {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        if (pendingSave.current?.path === target.path) pendingSave.current = null
        dirtyPaths.current.delete(target.path)
        lastKnownDisk.current.delete(target.path)

        await deleteNote(target.path)

        setState((s) => {
          const notes = s.notes.filter((n) => n.id !== id)
          const selectedId = s.selectedId === id ? (notes[0]?.id ?? null) : s.selectedId
          return {
            ...s,
            notes,
            selectedId,
            selected: notes.find((n) => n.id === selectedId) ?? null,
          }
        })
      } catch (e) {
        setError(e)
      }
    },
    [setError],
  )

  // --- F-402: 保存先フォルダの変更 ---
  const changeDir = useCallback(
    async (dir: string) => {
      try {
        await flushNow()
        await setNotesDir(dir)

        dirRef.current = dir
        lastKnownDisk.current.clear()
        dirtyPaths.current.clear()

        const notes = await listNotes(dir)
        for (const n of notes) lastKnownDisk.current.set(n.path, n.content)

        const selectedId = notes[0]?.id ?? null
        setState((s) => ({
          ...s,
          dir,
          notes,
          selectedId,
          selected: notes.find((n) => n.id === selectedId) ?? null,
          externalRevision: s.externalRevision + 1,
          error: null,
        }))
        void setLastNoteId(selectedId)
      } catch (e) {
        setError(e)
      }
    },
    [flushNow, setError],
  )

  // ウィンドウが隠れるときに保存し損ねを残さない（F-503 で常駐するため）
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flushNow()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', () => void flushNow())
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [flushNow])

  return { ...state, updateContent, select, create, remove, changeDir, reload }
}
