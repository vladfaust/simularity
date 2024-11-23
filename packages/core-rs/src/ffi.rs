use std::ffi::{c_char, c_float, c_int, c_uint, c_void};

#[derive(Debug)]
#[repr(C)]
pub struct SimularityGptInferenceOptions {
    pub n_prev: c_int,
    pub n_probs: c_int,
    pub min_keep: c_int,
    pub top_k: c_int,
    pub top_p: c_float,
    pub min_p: c_float,
    pub tfs_z: c_float,
    pub typical_p: c_float,
    pub temp: c_float,
    pub dynatemp_range: c_float,
    pub dynatemp_exponent: c_float,
    pub penalty_last_n: c_int,
    pub penalty_repeat: c_float,
    pub penalty_freq: c_float,
    pub penalty_present: c_float,
    pub mirostat: c_int,
    pub mirostat_tau: c_float,
    pub mirostat_eta: c_float,
    pub penalize_nl: bool,
    pub seed: c_uint,
    pub grammar: *const c_char,
    pub stop_sequences_len: c_uint,
    pub stop_sequences: *const *const c_char,
}

#[derive(Debug)]
#[repr(C)]
pub struct SimularityModelInfo {
    pub n_params: u64,
    pub size: u64,
    pub n_ctx_train: i64,
}

#[link(name = "simularity")]
extern "C" {
    // void simularity_init(
    //     unsigned gpt_sessions_ttl, unsigned gpt_sessions_max,
    //     const char *gpt_sessions_cache_dir
    // );
    pub fn simularity_init(gpt_sessions_ttl: c_uint, gpt_sessions_max: c_uint) -> c_void;

    // int simularity_model_load(
    //     const char *model_path,
    //     const char *model_id,
    //     bool(progress_callback)(float, void *),
    //     void *progress_callback_user_data,
    //     struct simularity_model_info *model_info
    // );
    pub fn simularity_model_load(
        model_path: *const c_char,
        model_id: *const c_char,
        progress_callback: Option<extern "C" fn(c_float, *mut c_void) -> bool>,
        progress_callback_user_data: *mut c_void,
        model_info: *mut SimularityModelInfo,
    ) -> c_int;

    // uint64_t simularity_model_get_hash_by_id(const char *model_id);
    pub fn simularity_model_get_hash_by_id(model_id: *const c_char) -> u64;

    // int simularity_model_unload(const char *model_id);
    pub fn simularity_model_unload(model_id: *const c_char) -> c_int;

    // uint64_t simularity_model_get_hash_by_path(const char *model_path);
    pub fn simularity_model_get_hash_by_path(model_path: *const c_char) -> u64;

    // int simularity_gpt_token_length(const char *model_id, const char *prompt);
    pub fn simularity_gpt_token_length(model_id: *const c_char, prompt: *const c_char) -> c_int;

    // int simularity_gpt_create(
    //     const char *model_id,
    //     unsigned context_size,
    //     unsigned unsigned batch_size,,
    //     const char *initial_prompt,
    //     const char *state_file_path,
    //     void(progress_callback)(float, void *),
    //     void *progress_callback_user_data
    // );
    pub fn simularity_gpt_create(
        model_id: *const c_char,
        context_size: c_uint,
        batch_size: c_uint,
        initial_prompt: *const c_char,
        state_file_path: *const c_char,
        progress_callback: Option<extern "C" fn(c_float, *mut c_void) -> bool>,
        progress_callback_user_data: *mut c_void,
    ) -> c_int;

    // int simularity_gpt_decode(
    //     unsigned session_id,
    //     const char *prompt,
    //     bool(progress_callback)(float, void *),
    //     void *progress_callback_user_data
    // );
    pub fn simularity_gpt_decode(
        session_id: c_uint,
        prompt: *const c_char,
        progress_callback: Option<extern "C" fn(c_float, *mut c_void) -> bool>,
        progress_callback_user_data: *mut c_void,
    ) -> c_int;

    // struct simularity_gpt_inference_options
    // simularity_gpt_inference_options_default();
    pub fn simularity_gpt_inference_options_default() -> SimularityGptInferenceOptions;

    // int simularity_gpt_infer(
    //     unsigned session_id,
    //     const char *prompt,
    //     unsigned n_eval,
    //     const struct simularity_gpt_inference_options options,
    //     bool(decode_progress_callback)(float, void *),
    //     void *decode_progress_callback_user_data,
    //     bool(inference_callback)(const char *output, void *),
    //     void *inference_callback_user_data
    // );
    pub fn simularity_gpt_infer(
        session_id: c_uint,
        prompt: *const c_char,
        n_eval: c_uint,
        options: SimularityGptInferenceOptions,
        decode_progress_callback: Option<extern "C" fn(c_float, *mut c_void) -> bool>,
        decode_progress_callback_user_data: *mut c_void,
        inference_callback: Option<extern "C" fn(*const c_char, *mut c_void) -> bool>,
        inference_callback_user_data: *mut c_void,
    ) -> c_int;

    // int simularity_gpt_destroy(unsigned session_id);
    pub fn simularity_gpt_destroy(session_id: c_uint) -> c_int;
}

// See https://stackoverflow.com/a/32270215/3645337.
pub extern "C" fn progress_callback_wrapper(progress: c_float, user_data: *mut c_void) -> bool {
    #[allow(clippy::transmute_ptr_to_ref)]
    let closure: &mut Box<dyn FnMut(f32) -> bool> = unsafe { std::mem::transmute(user_data) };
    closure(progress)
}

// See https://stackoverflow.com/a/32270215/3645337.
pub extern "C" fn inference_callback_wrapper(
    output: *const c_char,
    user_data: *mut c_void,
) -> bool {
    #[allow(clippy::transmute_ptr_to_ref)]
    let closure: &mut Box<dyn FnMut(&str) -> bool> = unsafe { std::mem::transmute(user_data) };
    let output = unsafe { std::ffi::CStr::from_ptr(output) };
    // FIXME: Utf8Error (invalid utf-8) handling.
    closure(output.to_str().unwrap())
}
