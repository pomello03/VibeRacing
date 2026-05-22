use std::env;

#[tauri::command]
fn get_engine_sync_status() -> String {
    "60Hz Synchronous Engine Lock Active".to_string()
}

pub fn run() {
    // Inject Chromium/WebView2 command line flags to optimize layout loops and prevent background throttling
    let current_args = env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    let opt_args = format!(
        "{} --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --force-gpu-rasterization --enable-zero-copy --limit-fps=60",
        current_args
    );
    env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", opt_args.trim());

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_engine_sync_status])
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
