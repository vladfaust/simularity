fn main() {
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

    tauri_build::build()
}
