set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/vendor/llama.cpp)

# TODO: Replace with vendor/llama.cpp (see https://github.com/ggerganov/llama.cpp/pull/8370).
add_subdirectory(vendor/llama.cpp/src)

set(Llama_INCLUDE_DIR vendor/llama.cpp/include)
list(APPEND Llama_LIBRARIES llama)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
add_compile_definitions(LLAMA_API_INTERNAL)
