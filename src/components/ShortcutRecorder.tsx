import { useEffect, useRef, useState } from 'react'
import { describeSystemConflict, formatAccelerator, toAcceleratorKey } from '../lib/accelerator'

type Props = {
  value: string
  onRecord: (accelerator: string) => void
  onReset: () => void
}

/**
 * 要件 F-501a。押されたキーをそのまま記録する方式のホットキー設定。
 *
 * Tauri のアクセラレータ表記（"CommandOrControl+Alt+N"）に変換して返す。
 */

export default function ShortcutRecorder({ value, onRecord, onReset }: Props) {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(() => describeSystemConflict(value))
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!recording) return

    /**
     * 他のアプリや macOS が既に握っている組み合わせは、
     * そもそも pimu-note まで届かない（相手が先に反応してしまう）。
     * 届かない以上「押されなかった」のと区別がつかないが、
     * 相手が前面に出ればこちらはフォーカスを失うので、それを手がかりにする。
     */
    const onBlur = () => {
      setRecording(false)
      setHint(
        'いま押した組み合わせは、ほかのアプリ（または macOS）が先に反応しました。' +
          'pimu-note まで届かないため登録できません。別の組み合わせを選んでください。',
      )
    }

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecording(false)
        setHint(null)
        return
      }

      const key = toAcceleratorKey(e.code)
      if (!key) {
        // どのキーが弾かれたのか分からないと直しようがないので、キー名も出す
        setHint(
          `そのキー（${e.code || '不明'}）は使えません。英数字・記号・ファンクションキー・矢印キーから選んでください。`,
        )
        return
      }

      const modifiers: string[] = []
      if (e.metaKey) modifiers.push('CommandOrControl')
      if (e.ctrlKey) modifiers.push('Control')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')

      // 修飾キーなしだと、ふつうの文字入力を全部奪ってしまう
      if (modifiers.length === 0) {
        setHint('⌘ / ⌥ / ⌃ / ⇧ のいずれかと組み合わせてください。')
        return
      }

      const accelerator = [...modifiers, key].join('+')
      setRecording(false)
      setHint(null)
      setConflict(describeSystemConflict(accelerator))
      onRecord(accelerator)
    }

    // capture 段階で拾わないと、エディタ側のキーバインドに先を越される
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [recording, onRecord])

  return (
    <div className="shortcut-recorder">
      <button
        ref={buttonRef}
        className={recording ? 'is-recording' : 'ghost'}
        onClick={() => {
          setHint(null)
          setRecording((r) => !r)
        }}
      >
        {recording ? 'キーを押してください…' : formatAccelerator(value)}
      </button>
      <button className="ghost" onClick={onReset} disabled={recording}>
        既定に戻す
      </button>
      {hint ? <p className="settings-warning">{hint}</p> : null}
      {recording ? (
        <p className="settings-help">
          使いたい組み合わせを押してください。Esc でキャンセル。
          <br />
          ほかのアプリが既に使っている組み合わせは、押しても届かないため登録できません。
        </p>
      ) : null}
      {conflict ? (
        <p className="settings-warning">
          この組み合わせは macOS の「{conflict}」に割り当てられている可能性があります。
          登録自体は成功しても、押したときに macOS 側が先に反応して pimu-note
          が開かないことがあります。反応しない場合は別の組み合わせにしてください。
        </p>
      ) : null}
    </div>
  )
}
