use crate::AppState;
use sha2::{Digest, Sha256};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    /// Decode duration in milliseconds.
    duration: u32,

    /// New KV cache size in tokens.
    kv_cache_size: usize,

    /// Session dump size in bytes, if dumped.
    session_dump_size: Option<usize>,
}

#[tauri::command]
/// Decode prompt, updating the KV cache.
/// Would save the session to a file if `dump_session` is set.
pub async fn gpt_decode(
    gpt_id: &str,
    prompt: String,
    dump_session: bool,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Response, tauri::InvokeError> {
    println!(
        "gpt_decode(gpt_id: {:?}, dump_session: {})",
        gpt_id, dump_session
    );

    let mut hash_map_lock = state.gpt_instances.lock().await;

    let arc = hash_map_lock
        .get_mut(gpt_id)
        .ok_or_else(|| tauri::InvokeError::from("gpt not found"))?
        .clone();

    drop(hash_map_lock);

    // ADHOC: Limit the number of simultaneous inferences to 1.
    let inference_lock = state.inference_mutex.lock().await;
    let mut gpt = arc.lock().await;

    let start = std::time::Instant::now();
    let _ = gpt
        .context
        .decode(prompt.clone())
        .map_err(tauri::InvokeError::from_anyhow);

    let kv_cache_size = gpt.context.kv_cache_size();

    let mut session_dump_size: Option<usize> = None;
    if dump_session {
        let mut hasher = Sha256::new();
        hasher.update(prompt.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        let path = app
            .path_resolver()
            .app_cache_dir()
            .unwrap()
            .join(format!("{}.llama-session", hash));

        std::fs::create_dir_all(path.parent().unwrap()).unwrap();

        if path.exists() {
            println!("llama.cpp session file already exists at {:?}", path);
        } else {
            let tokens = gpt.model.tokenize(&prompt);
            gpt.context.save_session_file(&path, &tokens).unwrap();

            let filesize = std::fs::metadata(&path).unwrap().len();
            println!(
                "dumped llama.cpp session to {:?} ({})",
                path,
                bytesize::ByteSize(filesize)
            );

            session_dump_size = Some(filesize as usize);
        }
    }

    drop(inference_lock);

    Ok(Response {
        duration: start.elapsed().as_millis() as u32,
        kv_cache_size,
        session_dump_size,
    })
}
