use std::ffi::CString;

use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    ModelNotFound,
    Unknown(i32),
}

/**
 * Get the length of the prompt in tokens.
 */
pub fn token_length(model_id: &str, prompt: &str) -> Result<u32, Error> {
    let model_id = CString::new(model_id).unwrap();
    let prompt = CString::new(prompt).unwrap();

    let token_length =
        unsafe { ffi::simularity_gpt_token_length(model_id.as_ptr(), prompt.as_ptr()) };
    if token_length < 0 {
        match token_length {
            -1 => Err(Error::ModelNotFound),
            _ => Err(Error::Unknown(token_length)),
        }
    } else {
        Ok(token_length as u32)
    }
}
