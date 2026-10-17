import { closeDb } from "../db/client.js";
import { startApiServer } from "../server/index.js";

async function main() {
  const testPort = 3099;
  const token = process.env.APP_ACCESS_TOKEN?.trim() ?? "";

  console.log(`\n🧪 [GAS-7] Iniciando prueba automatizada del Servidor API REST en puerto ${testPort}...\n`);
  const server = startApiServer(testPort);

  try {
    // 1. Test unauthorized request (No x-app-token)
    const unauthRes = await fetch(`http://localhost:${testPort}/api/health`);
    const unauthBody = await unauthRes.json();
    console.log(
      `1️⃣  Prueba sin 'x-app-token': HTTP ${unauthRes.status} -> ${JSON.stringify(unauthBody)}`
    );
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }

    // 2. Test authorized GET /api/health
    const healthRes = await fetch(`http://localhost:${testPort}/api/health`, {
      headers: { "x-app-token": token },
    });
    const healthBody = await healthRes.json();
    console.log(
      `2️⃣  Prueba GET /api/health (con token): HTTP ${healthRes.status} -> ${JSON.stringify(healthBody)}`
    );
    if (healthRes.status !== 200) {
      throw new Error(`Expected 200 OK on /api/health, got ${healthRes.status}`);
    }

    // 3. Test authorized GET /api/search?q=ketchup&limit=4
    const searchRes = await fetch(
      `http://localhost:${testPort}/api/search?q=ketchup%20heinz&limit=4`,
      {
        headers: { "x-app-token": token },
      }
    );
    const searchBody: any = await searchRes.json();
    console.log(
      `3️⃣  Prueba GET /api/search?q=ketchup%20heinz: HTTP ${searchRes.status} (${searchBody.durationMs}ms)`
    );
    console.log(
      `    • Coincidencias en Catálogo Local: ${searchBody.catalogCount}`
    );
    console.log(
      `    • Grupos en Vivo (5 Súpers): ${searchBody.liveGroupsCount} grupos (${searchBody.liveRawCount} ítems crudos)`
    );

    if (searchBody.liveGroups?.[0]) {
      const top = searchBody.liveGroups[0];
      console.log(
        `    • Top #1 Grupo: "${top.canonicalName}" [${top.unit ?? "S/U"}] — Mejor precio: ${top.cheapestShopName} a RD$ ${top.cheapestPrice}`
      );
    }

    console.log(`\n🎉 [GAS-7] Todos los endpoints y el middleware x-app-token pasaron las pruebas.`);
  } finally {
    server.close();
    await closeDb();
  }
}

main().catch((err) => {
  console.error("Error en test-api-phase1:", err);
  process.exit(1);
});
