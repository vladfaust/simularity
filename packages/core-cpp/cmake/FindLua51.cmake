set(Lua51_INCLUDE_DIR vendor/lua)

set(LUA_LIB_SRCS
    "vendor/lua/lapi.c"
    "vendor/lua/lcode.c"
    "vendor/lua/ldebug.c"
    "vendor/lua/ldo.c"
    "vendor/lua/ldump.c"
    "vendor/lua/lfunc.c"
    "vendor/lua/lgc.c"
    "vendor/lua/llex.c"
    "vendor/lua/lmem.c"
    "vendor/lua/lobject.c"
    "vendor/lua/lopcodes.c"
    "vendor/lua/lparser.c"
    "vendor/lua/lstate.c"
    "vendor/lua/lstring.c"
    "vendor/lua/ltable.c"
    "vendor/lua/ltm.c"
    "vendor/lua/lundump.c"
    "vendor/lua/lvm.c"
    "vendor/lua/lzio.c"
    "vendor/lua/lauxlib.c"
    "vendor/lua/lbaselib.c"
    "vendor/lua/ldblib.c"
    "vendor/lua/liolib.c"
    "vendor/lua/lmathlib.c"
    "vendor/lua/loadlib.c"
    "vendor/lua/loslib.c"
    "vendor/lua/lstrlib.c"
    "vendor/lua/ltablib.c"
    "vendor/lua/linit.c"
)

add_library(lua STATIC ${LUA_LIB_SRCS})
list(APPEND Lua51_LIBRARIES lua)
target_include_directories(lua PRIVATE ${Lua51_INCLUDE_DIR})
