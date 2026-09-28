import { drizzle } from "drizzle-orm/d1";
import { schema } from "./schema";

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}
