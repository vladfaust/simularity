use std::ffi::CString;

use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    ModelNotFound,
    SessionLimitReached,
    ContextCreationFailed,
    DecodeFailed,
    Unknown(i32),
}

/// Create a new GPT session.
///
/// # Arguments
///
/// * `model_id` - The model ID, after calling `model_load`.
/// * `context_size` - Context size, or `None` for default by the model.
/// * `batch_size` - Batch size, or `None` for default.
/// * `initial_prompt` - Initial prompt to start the session.
/// * `state_file_path` - Path to the session state file to load from or save to.
/// * `progress_callback` - Progress callback on either session loading or decoding.
///   Return `true` to continue, or `false` to cancel (not implemented yet).
///
/// # Returns
/// New GPT session ID.
///
// TODO: Return rich information about the session (session_loaded, session_dump_size, context_length).
pub fn create(
    model_id: &str,
    context_size: Option<u32>,
    batch_size: Option<u32>,
    initial_prompt: Option<&str>,
    state_file_path: Option<&str>,
    mut progress_callback: Option<impl FnMut(f32) -> bool>,
) -> Result<u32, Error> {
    let model_id = CString::new(model_id).unwrap();
    let initial_prompt = initial_prompt.map(|p| CString::new(p).unwrap());
    let state_file_path = state_file_path.map(|p| CString::new(p).unwrap());

    let user_data = if let Some(cb) = progress_callback.as_mut() {
        // See https://stackoverflow.com/a/32270215/3645337.
        let user_data: Box<Box<dyn FnMut(f32) -> bool>> = Box::new(Box::new(cb));
        Box::into_raw(user_data) as *mut _
    } else {
        std::ptr::null_mut()
    };

    let result = unsafe {
        ffi::simularity_gpt_create(
            model_id.as_ptr(),
            context_size.unwrap_or(0),
            batch_size.unwrap_or(0),
            initial_prompt
                .as_ref()
                .map_or(std::ptr::null(), |p| p.as_ptr()),
            state_file_path
                .as_ref()
                .map_or(std::ptr::null(), |p| p.as_ptr()),
            if progress_callback.is_some() {
                Some(ffi::progress_callback_wrapper)
            } else {
                None
            },
            user_data,
        )
    };

    if (user_data as usize) != 0 {
        // Drop the box.
        let _: Box<Box<dyn FnMut(f32) -> bool>> = unsafe { Box::from_raw(user_data as *mut _) };
    }

    match result {
        -1 => Err(Error::ModelNotFound),
        -2 => Err(Error::SessionLimitReached),
        -3 => Err(Error::ContextCreationFailed),
        -4 => Err(Error::DecodeFailed),
        x if x > 0 => Ok(result as u32),
        x => Err(Error::Unknown(x)),
    }
}
