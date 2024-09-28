fn main() {
    println!("cargo:rerun-if-changed=../core-cpp/src");
    println!("cargo:rerun-if-changed=../core-cpp/vendor");
    println!("cargo:rustc-link-lib=c++");

    println!("cargo::rustc-link-search=../core-cpp/build");
    println!("cargo::rustc-link-search=../core-cpp/build/vendor/llama.cpp/src");
    println!("cargo::rustc-link-search=../core-cpp/build/vendor/ggml/src");

    #[cfg(target_os = "macos")]
    {
        println!("cargo::rustc-link-lib=framework=Foundation");
        println!("cargo::rustc-link-lib=framework=Metal");
        println!("cargo::rustc-link-lib=framework=MetalPerformanceShaders");
        println!("cargo::rustc-link-lib=framework=MetalKit");
        println!("cargo::rustc-link-lib=framework=Accelerate");
    }

    println!("cargo::rustc-link-lib=static=ggml");
    println!("cargo::rustc-link-lib=static=llama");
    println!("cargo::rustc-link-lib=static=xxhash");
    println!("cargo::rustc-link-lib=static=simularity");
}
