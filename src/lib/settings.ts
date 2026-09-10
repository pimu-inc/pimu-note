import { invoke } from '@tauri-apps/api/core'
import { documentDir, join } from '@tauri-apps/api/path'
import { load, type Store } from '@tauri-apps/plugin-store'

/**
 * 設定の永続化。要件 F-402（保存先フォルダの変更）と F-504（前回状態の復元）で使う。
 */

const STORE_FILE = 'settings.json'

const KEY_NOTES_DIR = 'notesDir'
const KEY_LAST_NOTE_ID = 'lastNoteId'

let storePromise: Promise<Store> | null = null

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { autoSave: true })
  return storePromise
}

/** 既定の保存先。tauri.conf.json のスコープでも同じ場所を許可している */
export async function defaultNotesDir(): Promise<string> {
  return join(await documentDir(), 'pimu-note')
}

/**
 * 保存先フォルダを取得する。
 *
 * 併せて Rust 側のファイルシステムスコープにも登録する。
 * Tauri のスコープは静的定義が基本なので、利用者が選んだフォルダは
 * 起動のたびにこうして許可し直す必要がある。
 */
export async function getNotesDir(): Promise<string> {
  const store = await getStore()
  const saved = await store.get<string>(KEY_NOTES_DIR)
  const dir = saved ?? (await defaultNotesDir())
  await invoke('allow_notes_dir', { path: dir })
  return dir
}

export async function setNotesDir(dir: string): Promise<void> {
  await invoke('allow_notes_dir', { path: dir })
  const store = await getStore()
  await store.set(KEY_NOTES_DIR, dir)
}

/** F-504: 最後に開いていたノート */
export async function getLastNoteId(): Promise<string | null> {
  const store = await getStore()
  return (await store.get<string>(KEY_LAST_NOTE_ID)) ?? null
}

export async function setLastNoteId(id: string | null): Promise<void> {
  const store = await getStore()
  if (id === null) {
    await store.delete(KEY_LAST_NOTE_ID)
  } else {
    await store.set(KEY_LAST_NOTE_ID, id)
  }
}
