#[allow(unused_must_use)]
pub fn main() {
    // # Sanity check
    //
    // This is a simple test to ensure that
    // the crate can be compiled and linked.
    //

    simularity_core::init(None, None);
    simularity_core::model_load("", "", None::<fn(_) -> bool>);
    simularity_core::model_get_hash_by_id("");
    simularity_core::gpt::token_length("", "");
    simularity_core::gpt::create("", None, None, None, None, None::<fn(_) -> bool>);
    simularity_core::gpt::touch(42);
    simularity_core::gpt::decode(42, "", None::<fn(_) -> bool>);
    simularity_core::gpt::infer(
        42,
        Some(""),
        42,
        None,
        None::<fn(_) -> bool>,
        None::<fn(&str) -> bool>,
    );
}
