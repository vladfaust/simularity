/// Return a tuple of a boxed value and a static mutable reference to it.
///
/// # Safety
///
/// Once the box is dropped, the reference will be dropped as well,
/// leading to undefined behavior if it is used afterwards.
///
/// Source: https://stackoverflow.com/a/69889137/3645337.
pub unsafe fn static_box<T>(value: T) -> (Box<T>, &'static mut T) {
    let boxed = Box::new(value);
    let raw = std::boxed::Box::leak(boxed);
    let boxed = Box::from_raw(raw);
    (boxed, raw)
}
