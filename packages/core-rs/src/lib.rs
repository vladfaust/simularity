use std::ffi::{c_void, CString};

mod ffi;
pub mod gpt;

pub fn init(gpt_sessions_ttl: Option<u32>, gpt_sessions_max: Option<u32>) {
    unsafe { ffi::simularity_init(gpt_sessions_ttl.unwrap_or(0), gpt_sessions_max.unwrap_or(0)) };
}

#[derive(Debug)]
pub enum ModelLoadError {
    ModelExists,
    LoadFailed,
    Unknown(i32),
}

/// Load a model from a file.
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
) -> Result<(), ModelLoadError> {
    let user_data = if let Some(cb) = progress_callback.as_mut() {
        let mut user_data: &mut dyn FnMut(f32) -> bool = cb;
        &mut user_data as *mut _ as *mut c_void
    } else {
        std::ptr::null_mut()
    };

    let model_path = CString::new(model_path).unwrap();
    let model_id = CString::new(model_id).unwrap();

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
        )
    };

    match result {
        0 => Ok(()),
        -1 => Err(ModelLoadError::ModelExists),
        -2 => Err(ModelLoadError::LoadFailed),
        _ => Err(ModelLoadError::Unknown(result)),
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
