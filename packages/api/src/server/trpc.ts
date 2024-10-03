import { initTRPC } from "@trpc/server";
import { Context } from "./trpc/context.js";

export const t = initTRPC.context<Context>().create();
