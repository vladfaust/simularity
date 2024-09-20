use std::env;
use std::path::Path;

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();

    println!("cargo:rerun-if-changed=../core-cpp/src");
    println!("cargo:rustc-link-lib=c++");

    // println!("cargo::rustc-link-search=../core-cpp/build");
    println!(
        "cargo::rustc-link-search={}",
        Path::new(&dir).join("../core-cpp/build").display()
    );
    // println!("cargo::rustc-link-search=../core-cpp/build/vendor/llama.cpp/src");
    println!(
        "cargo::rustc-link-search={}",
        Path::new(&dir)
            .join("../core-cpp/build/vendor/llama.cpp/src")
            .display()
    );
    // println!("cargo::rustc-link-search=../core-cpp/build/vendor/ggml/src");
    println!(
        "cargo::rustc-link-search={}",
        Path::new(&dir)
            .join("../core-cpp/build/vendor/ggml/src")
            .display()
    );

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
