set(XxHash_INCLUDE_DIR vendor/xxHash)
add_library(xxhash STATIC vendor/xxHash/xxhash.c)
list(APPEND XxHash_LIBRARIES xxhash)
target_include_directories(xxhash PRIVATE ${XxHash_INCLUDE_DIR})
target_compile_definitions(xxhash PRIVATE XXH_STATIC_LINKING_ONLY)
