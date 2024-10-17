use crate::AppState;
use curl::easy::Easy;
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::Write,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};
use tauri::{
    async_runtime::{handle, spawn_blocking},
    Emitter, Listener,
};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    /// Number of bytes downloaded since the last progress event.
    pub downloaded_bytes: u64,

    /// Elapsed time in milliseconds since the last progress event.
    pub elapsed_time: u32,

    /// Total number of bytes downloaded so far.
    pub current_file_size: u64,

    /// Total number of bytes to download.
    pub target_content_length: u64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Whether the download was aborted.
    pub aborted: bool,

    /// Total number of bytes downloaded so far.
    pub current_file_size: u64,

    /// Total number of bytes to download.
    pub target_content_length: u64,
}

/// Download a file from the given URL to the given path.
#[tauri::command]
pub async fn file_download(
    url: String,
    headers: Option<HashMap<String, String>>,
    path: String,
    progress_event_name: Option<String>,
    abort_event_name: Option<String>,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<Response, tauri::ipc::InvokeError> {
    println!(
        "file_download(url: {}, headers: {}, path: {})",
        url,
        headers
            .as_ref()
            .map(|h| h
                .iter()
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect::<Vec<String>>()
                .join(", "))
            .unwrap_or("None".to_string()),
        path
    );

    let mut hash_map_lock = state.file_downloads.lock().await;
    let abort_flag = hash_map_lock.get(&path);
    if let Some(abort_flag) = abort_flag {
        println!("Download already in progress, waiting to abort: {}", path);
        abort_flag.store(true, Ordering::Relaxed);
        drop(hash_map_lock);

        // Wait until the download is aborted.
        while state.file_downloads.lock().await.contains_key(&path) {
            handle()
                .spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(100)))
                .await?;
        }

        hash_map_lock = state.file_downloads.lock().await;
    }

    let abort_flag = Arc::new(AtomicBool::new(false));
    hash_map_lock.insert(path.clone(), abort_flag.clone());
    drop(hash_map_lock);

    if let Some(event_name) = abort_event_name {
        let abort_flag_clone = abort_flag.clone();

        window.listen(event_name, move |_| {
            abort_flag_clone.store(true, Ordering::Relaxed);
        });
    }

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|e| {
            tauri::ipc::InvokeError::from(format!("Failed to open file for writing: {}", e))
        })?;
    let initial_file_size = file.metadata().unwrap().len();

    let mut easy = Easy::new();

    // Set the URL to download from.
    easy.url(&url).unwrap();

    // Set the headers.
    if let Some(headers) = headers {
        let mut list = curl::easy::List::new();

        for (key, value) in headers {
            list.append(&format!("{}: {}", key, value)).unwrap();
        }

        easy.http_headers(list).unwrap();
    }

    // Follow redirects.
    easy.follow_location(true).unwrap();

    // Resume the download from the initial file size.
    easy.resume_from(initial_file_size).unwrap();

    // Set the write function to write to the file.
    easy.write_function(move |data| {
        file.write_all(data).unwrap();
        Ok(data.len())
    })
    .unwrap();

    let abort_flag_clone = abort_flag.clone();

    let content_length = Arc::new(AtomicU64::new(0));
    let content_length_clone = content_length.clone();

    let latest_dlnow = AtomicU64::new(0);
    let downloaded_so_far = Arc::new(AtomicU64::new(0));
    let downloaded_so_far_clone = downloaded_so_far.clone();
    let mut downloaded_since_acc = 0_u64;
    let mut last_emit: Instant = Instant::now();
    let throttle = std::time::Duration::from_millis(500);

    // Set the progress function to emit progress events.
    easy.progress_function(move |dltotal, dlnow, _, _| {
        if dltotal > 0.0 {
            content_length_clone.store(initial_file_size + dltotal as u64, Ordering::Relaxed);
        }

        if dlnow > 0.0 && dlnow as u64 != latest_dlnow.load(Ordering::Acquire) {
            latest_dlnow.store(dlnow as u64, Ordering::Release);
            let downloaded_so_far = downloaded_so_far_clone.load(Ordering::Relaxed);

            let downloaded_since = if dlnow as u64 > downloaded_so_far {
                dlnow as u64 - downloaded_so_far
            } else {
                dlnow as u64
            };

            downloaded_since_acc += downloaded_since;

            if let Some(event_name) = &progress_event_name {
                if downloaded_since_acc > 0 && last_emit.elapsed() > throttle {
                    let event = ProgressEvent {
                        downloaded_bytes: downloaded_since_acc,
                        elapsed_time: last_emit.elapsed().as_millis() as u32,
                        current_file_size: initial_file_size + dlnow as u64,
                        target_content_length: initial_file_size + dltotal as u64,
                    };

                    window.emit(event_name, event).unwrap();

                    downloaded_since_acc = 0;
                    last_emit = Instant::now();
                }
            }

            downloaded_so_far_clone.store(dlnow as u64, Ordering::Relaxed);
        }

        // Return true to continue the download, or false to abort.
        !(abort_flag_clone.load(Ordering::Relaxed))
    })
    .unwrap();

    // Enable progress events.
    easy.progress(true).unwrap();

    // Perform the download.
    println!("Downloading: {}", path);
    let result = spawn_blocking(move || easy.perform()).await?;

    if let Err(err) = result {
        if err.is_aborted_by_callback() {
            println!("Download aborted: {}", path);
        } else {
            let mut hash_map_lock = state.file_downloads.lock().await;
            hash_map_lock.remove(&path);
            return Err(tauri::ipc::InvokeError::from(err.description()));
        }
    }

    let mut hash_map_lock = state.file_downloads.lock().await;
    hash_map_lock.remove(&path);
    drop(hash_map_lock);

    let current_file_size = initial_file_size + downloaded_so_far.load(Ordering::Relaxed);
    let target_content_length = content_length.load(Ordering::Relaxed);

    Ok(Response {
        aborted: abort_flag.load(Ordering::Relaxed),
        current_file_size,
        target_content_length,
    })
}
