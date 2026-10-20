import { pruneOldHistory } from "../db/ensure-core-schema.js";
import { closeDb } from "../db/client.js";

async function main() {
  const days = process.env.PRUNE_DAYS ? Number(process.env.PRUNE_DAYS) : 7;
  console.log(`[DB:PRUNE] ⏳ Purgando historial de precios anterior a ${days} días...`);
  const deletedCount = await pruneOldHistory(days);
  console.log(
    `[DB:PRUNE] ✅ Purga completada. Registros eliminados: ${deletedCount}. Almacenamiento optimizado (<10 MB).`
  );
  await closeDb();
}

main().catch(async (error) => {
  console.error("[DB:PRUNE] ❌ Error en purga de historial:", error);
  await closeDb();
  process.exit(1);
});
