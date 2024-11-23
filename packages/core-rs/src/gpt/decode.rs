use std::ffi::CString;

use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    SessionNotFound,
    ContextOverflow,
    Unknown(i32),
}

/// Decode the GPT session with the given prompt.
/// Clears the uncommitted prompt.
///
/// # Arguments
///
/// * `session_id` - GPT session ID.
/// * `prompt` - The *full* prompt to decode. The function will take care of
///   reusing and/or updating the KV cache. The more the prompt mismatches
///   existing KV cache, the longer it takes to decode.
/// * `progress_callback` - Return `true` to continue,
///   or `false` to cancel (not implemented yet).
///
/// # Returns
/// New context length.
///
pub fn decode(
    session_id: u32,
    prompt: &str,
    mut progress_callback: Option<impl FnMut(f32) -> bool>,
) -> Result<u32, Error> {
    let prompt = CString::new(prompt).unwrap();

    let user_data = if let Some(cb) = progress_callback.as_mut() {
        // See https://stackoverflow.com/a/32270215/3645337.
        let user_data: Box<Box<dyn FnMut(f32) -> bool>> = Box::new(Box::new(cb));
        Box::into_raw(user_data) as *mut _
    } else {
        std::ptr::null_mut()
    };

    let result = unsafe {
        ffi::simularity_gpt_decode(
            session_id,
            prompt.as_ptr(),
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
        -1 => Err(Error::SessionNotFound),
        -2 => Err(Error::ContextOverflow),
        x if x > 0 => Ok(result as u32),
        x => Err(Error::Unknown(x)),
    }
}
