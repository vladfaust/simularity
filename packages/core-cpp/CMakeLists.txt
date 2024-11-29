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
target_compile_features(${TARGET} PRIVATE cxx_std_20)

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

# Lua 5.1 lib
#

find_package(Lua51 REQUIRED)
message("Lua 5.1 include dir: ${Lua51_INCLUDE_DIR}")
message("Lua 5.1 libraries: ${Lua51_LIBRARIES}")
include_directories(${Lua51_INCLUDE_DIR})
list(APPEND LIB_LIST ${Lua51_LIBRARIES})

# Lua-CJSON lib
#

find_package(LuaCjson REQUIRED)
message("Lua-CJSON include dir: ${LuaCjson_INCLUDE_DIR}")
message("Lua-CJSON libraries: ${LuaCjson_LIBRARIES}")
include_directories(${LuaCjson_INCLUDE_DIR})
list(APPEND LIB_LIST ${LuaCjson_LIBRARIES})

# Sol2 lib
#

find_package(Sol2 REQUIRED)
message("Sol2 include dir: ${Sol2_INCLUDE_DIR}")
include_directories(${Sol2_INCLUDE_DIR})

# Add the libraries to the target
#

message("Libraries: ${LIB_LIST}")
target_link_libraries(${TARGET} PRIVATE ${LIB_LIST} ${CMAKE_THREAD_LIBS_INIT})
