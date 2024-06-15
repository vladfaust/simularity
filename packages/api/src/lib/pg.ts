import { env } from "@/env.js";
import postgres from "postgres";
import { konsole } from "./konsole.js";

const pg = postgres(env.DATABASE_URL);

export async function listen(
  channel: string,
  onNotify: (value: string) => void,
): Promise<() => void> {
  const listen = await pg.listen(channel, onNotify);
  return () => listen.unlisten();
}

export { pg };

// Test connection.
pg`SELECT 1`.then(() => {
  konsole.info("PostgreSQL connection OK");
});
