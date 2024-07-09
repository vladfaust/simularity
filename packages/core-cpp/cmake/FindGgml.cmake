set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/vendor/ggml)
add_subdirectory(vendor/ggml)
set(Ggml_INCLUDE_DIR vendor/ggml/include)
list(APPEND Ggml_LIBRARIES ggml)
