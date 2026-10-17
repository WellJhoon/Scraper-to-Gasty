import { ensureCoreSchema } from "../db/ensure-core-schema.js";
import { closeDb } from "../db/client.js";

async function main() {
  console.log("[DB:INIT] ⏳ Conectando e inicializando tablas en PostgreSQL...");
  await ensureCoreSchema();
  console.log("[DB:INIT] ✅ Todas las tablas e índices han sido creados y verificados con éxito.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("[DB:INIT] ❌ Error inicializando base de datos:", error);
  await closeDb();
  process.exit(1);
});
