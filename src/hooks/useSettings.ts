import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCopyMode,
  getThemePreference,
  setCopyMode as persistCopyMode,
  setThemePreference as persistTheme,
  type CopyMode,
  type ThemePreference,
} from '../lib/settings'

/**
 * 保存先フォルダ以外の設定。要件 F-306 と F-601〜603。
 * （保存先は useNotes が扱う）
 */
export function useSettings() {
  const [copyMode, setCopyModeState] = useState<CopyMode>('both')
  const [theme, setThemeState] = useState<ThemePreference>('system')
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  /**
   * CodeMirror の copy ハンドラは React の外側で動くため、
   * 最新の設定を同期的に読めるように ref にも持たせる。
   */
  const copyModeRef = useRef<CopyMode>('both')
  useEffect(() => {
    copyModeRef.current = copyMode
  }, [copyMode])

  useEffect(() => {
    void (async () => {
      const [mode, pref] = await Promise.all([getCopyMode(), getThemePreference()])
      setCopyModeState(mode)
      setThemeState(pref)
    })()
  }, [])

  // F-601: OS の外観設定に追従する
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = theme === 'system' ? systemIsDark : theme === 'dark'

  // F-602 / F-603: 実際の外観を DOM に反映し、CSS 側から参照できるようにする
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  }, [isDark])

  const setCopyMode = useCallback((mode: CopyMode) => {
    setCopyModeState(mode)
    void persistCopyMode(mode)
  }, [])

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref)
    void persistTheme(pref)
  }, [])

  const getCopyModeNow = useCallback(() => copyModeRef.current, [])

  return { copyMode, setCopyMode, theme, setTheme, isDark, getCopyModeNow }
}
