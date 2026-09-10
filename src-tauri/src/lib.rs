use tauri::Manager;

/// F-501: ホットキーを押したときのウィンドウの振る舞い。
///
/// 「見えているかどうか」だけで判定すると、ウィンドウが背面に開いたままのときに
/// 1回目の押下が「隠す」に化けてしまい、利用者からは 2 回押さないと出てこないように見える。
/// 可視状態とフォーカス状態を分けて 3 通りで判定する。
#[cfg(desktop)]
fn toggle_main_window(window: &tauri::WebviewWindow) {
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if !visible {
        // 隠れている → 出して前面に
        let _ = window.show();
        let _ = window.set_focus();
    } else if !focused {
        // 見えてはいるが背面 → 前面に持ってくるだけ（隠さない）
        let _ = window.set_focus();
    } else {
        // すでに最前面 → しまう
        let _ = window.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

        // F-501: 既定は Cmd+Option+N。Phase 4 で設定から変更できるようにする。
        let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyN);

        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(toggle_shortcut)
                .expect("ホットキーの登録に失敗しました")
                .with_handler(move |app, shortcut, event| {
                    // 押下と離上の両方が飛んでくるので押下だけ拾う
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut != &toggle_shortcut {
                        return;
                    }
                    match app.get_webview_window("main") {
                        Some(window) => toggle_main_window(&window),
                        None => log::error!("main ウィンドウが見つかりません"),
                    }
                })
                .build(),
        );
    }

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // F-503: 閉じるボタンでアプリを終了させず、隠すだけにして常駐させる。
        // ホットキーから即座に復帰できるのが本アプリの前提のため。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
