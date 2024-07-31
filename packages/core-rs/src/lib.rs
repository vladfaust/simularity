use std::ffi::{c_void, CString};

mod ffi;
pub mod gpt;

pub fn init(gpt_sessions_ttl: Option<u32>, gpt_sessions_max: Option<u32>) {
    unsafe { ffi::simularity_init(gpt_sessions_ttl.unwrap_or(0), gpt_sessions_max.unwrap_or(0)) };
}

#[derive(Debug)]
pub enum ModelLoadError {
    LoadFailed,
    Unknown(i32),
}

/// Load a model from a file.
/// If the model already loaded, it will return the model info.
///
/// # Arguments
///
/// * `model_path` - Path to the model file.
/// * `model_id` - Unique identifier for the model.
/// * `progress_callback` - Rust function that will be called with the progress.
///   Return `true` to continue loading, `false` to cancel.
///
pub fn model_load(
    model_path: &str,
    model_id: &str,
    mut progress_callback: Option<impl FnMut(f32) -> bool>,
) -> Result<ffi::SimularityModelInfo, ModelLoadError> {
    let user_data = if let Some(cb) = progress_callback.as_mut() {
        let mut user_data: &mut dyn FnMut(f32) -> bool = cb;
        &mut user_data as *mut _ as *mut c_void
    } else {
        std::ptr::null_mut()
    };

    let model_path = CString::new(model_path).unwrap();
    let model_id = CString::new(model_id).unwrap();
    let mut model_info = ffi::SimularityModelInfo {
        n_params: 0,
        size: 0,
        n_ctx_train: 0,
    };

    let result = unsafe {
        ffi::simularity_model_load(
            model_path.as_ptr(),
            model_id.as_ptr(),
            if progress_callback.is_some() {
                Some(ffi::progress_callback_wrapper)
            } else {
                None
            },
            user_data,
            &mut model_info,
        )
    };

    match result {
        0 => Ok(model_info),
        -1 => Ok(model_info), // Model already loaded, return the info.
        -2 => Err(ModelLoadError::LoadFailed),
        _ => Err(ModelLoadError::Unknown(result)),
    }
}

#[derive(Debug)]
pub enum ModelHashError {
    Unknown(i32),
}

/// Get the hash of a model by its ID.
pub fn model_hash(model_id: &str) -> Result<u64, ModelHashError> {
    let model_id = CString::new(model_id).unwrap();
    let result = unsafe { ffi::simularity_model_hash(model_id.as_ptr()) };
    match result {
        0 => Err(ModelHashError::Unknown(result as i32)),
        _ => Ok(result),
    }
}

#[derive(Debug)]
pub enum ModelUnloadError {
    ModelNotFound,
    Unknown(i32),
}

/// Unload a model.
///
/// # Arguments
/// * `model_id` The model id, loaded with `model_load`.
pub fn model_unload(model_id: &str) -> Result<(), ModelUnloadError> {
    let model_id = CString::new(model_id).unwrap();

    let result = unsafe { ffi::simularity_model_unload(model_id.as_ptr()) };

    match result {
        0 => Ok(()),
        -1 => Err(ModelUnloadError::ModelNotFound),
        _ => Err(ModelUnloadError::Unknown(result)),
    }
}
