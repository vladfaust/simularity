cmake_minimum_required(VERSION 3.26)
project(simularity)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/cmake")
set(BUILD_SHARED_LIBS OFF)

# Target
#

set(TARGET simularity)
add_library(${TARGET} STATIC src/simularity.cpp)
target_include_directories(${TARGET} PRIVATE include)
target_include_directories(${TARGET} PRIVATE vendor)
target_compile_features(${TARGET} PRIVATE cxx_std_17)

# GGML lib
#

find_package(Ggml REQUIRED)
message("Ggml include dir: ${Ggml_INCLUDE_DIR}")
message("Ggml libraries: ${Ggml_LIBRARIES}")
include_directories(${Ggml_INCLUDE_DIR})
list(APPEND LIB_LIST ${Ggml_LIBRARIES})

# Llama.cpp lib
#

find_package(Llama REQUIRED)
message("Llama include dir: ${Llama_INCLUDE_DIR}")
message("Llama libraries: ${Llama_LIBRARIES}")
include_directories(${Llama_INCLUDE_DIR})
list(APPEND LIB_LIST ${Llama_LIBRARIES})

# Spdlog (header only)
#

target_include_directories(${TARGET} PRIVATE vendor/spdlog/include)

# XxHash lib
#

find_package(XxHash REQUIRED)
message("XxHash include dir: ${XxHash_INCLUDE_DIR}")
message("XxHash libraries: ${XxHash_LIBRARIES}")
include_directories(${XxHash_INCLUDE_DIR})
list(APPEND LIB_LIST ${XxHash_LIBRARIES})

# Add the libraries to the target
#

message("Libraries: ${LIB_LIST}")
target_link_libraries(${TARGET} PRIVATE ${LIB_LIST} ${CMAKE_THREAD_LIBS_INIT})
