import { env } from "@/env.js";
import { Redis, RedisOptions } from "ioredis";
import { konsole } from "./konsole.js";

/**
 * Use this function to create a new Redis client.
 */
export function newRedisClient(options: RedisOptions = {}) {
  return new Redis(env.REDIS_URL, options);
}

/**
 * The default Redis client.
 */
export const redis = newRedisClient();

// Test connection.
redis.ping().then(() => {
  konsole.info("Redis connection OK");
});
