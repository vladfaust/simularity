set(LuaCjson_INCLUDE_DIR vendor/lua-cjson)

set(LUA_CJSON_LIB_SRCS
    "vendor/lua-cjson/lua_cjson.c"
    "vendor/lua-cjson/fpconv.c"
    "vendor/lua-cjson/strbuf.c"
)

add_library(lua-cjson STATIC ${LUA_CJSON_LIB_SRCS})
list(APPEND LuaCjson_LIBRARIES lua-cjson)

target_include_directories(lua-cjson PRIVATE ${LuaCjson_INCLUDE_DIR})
target_compile_definitions(lua-cjson PRIVATE ENABLE_CJSON_GLOBAL MULTIPLE_THREADS)
