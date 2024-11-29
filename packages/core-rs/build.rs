use std::env;
use std::path::Path;

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();

    println!("cargo:rerun-if-changed=../core-cpp/cmake");
    println!("cargo:rerun-if-changed=../core-cpp/src");
    println!("cargo:rerun-if-changed=../core-cpp/vendor");

    #[cfg(feature = "cuda")]
    {
        #[cfg(target_os = "windows")]
        {
            println!(
                "cargo:rustc-link-search=native={}",
                env::var("CUDA_LIB_PATH").expect("CUDA_LIB_PATH is set")
            );
        }

        println!("cargo:rustc-link-lib=dylib=cuda");
        println!("cargo:rustc-link-lib=dylib=cudart");
        println!("cargo:rustc-link-lib=dylib=cublas");
        println!("cargo:rustc-link-lib=dylib=curand");
    }

    #[cfg(target_os = "windows")]
    {
        #[cfg(target_env = "msvc")]
        {
            #[cfg(debug_assertions)]
            {
                println!("cargo::rustc-link-arg=/NODEFAULTLIB:ucrt.lib");
                println!("cargo::rustc-link-arg=/DEFAULTLIB:ucrtd.lib");
                println!("cargo::rustc-link-arg=/NODEFAULTLIB:msvcrt.lib");
                println!("cargo::rustc-link-arg=/DEFAULTLIB:msvcrtd.lib");
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("cargo:rustc-link-lib=c++");
    }

    // See https://stackoverflow.com/questions/41917096/how-do-i-make-rustc-link-search-relative-to-the-project-location.
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
    println!("cargo::rustc-link-lib=static=lua");
    println!("cargo::rustc-link-lib=static=lua-cjson");
    println!("cargo::rustc-link-lib=static=simularity");
}
