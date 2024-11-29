set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/vendor/sol2)
add_subdirectory(vendor/sol2)
set(Sol2_INCLUDE_DIR vendor/sol2/include)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
