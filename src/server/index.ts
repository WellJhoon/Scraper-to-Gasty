import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import "../api-endpoints.js"; // Ensures .env is loaded
import { sendJson, setCorsHeaders } from "./http-utils.js";
import { verifyAppToken } from "./middleware/auth.js";
import {
  handleCreateProductRoute,
  handleGetProductByIdRoute,
  handleHealthRoute,
  handleSearchRoute,
} from "./routes/search.js";

const PORT = Number(process.env.PORT || 3000);

export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  setCorsHeaders(res);

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

  // All /api/* endpoints require x-app-token private security header
  if (!verifyAppToken(req, res)) {
    return;
  }

  try {
    if (method === "GET" && pathname === "/api/health") {
      await handleHealthRoute(req, res);
      return;
    }

    if (method === "GET" && pathname === "/api/search") {
      await handleSearchRoute(req, res, parsedUrl);
      return;
    }

    if (method === "POST" && pathname === "/api/products") {
      await handleCreateProductRoute(req, res);
      return;
    }

    const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (method === "GET" && productMatch) {
      await handleGetProductByIdRoute(req, res, Number(productMatch[1]));
      return;
    }

    sendJson(res, 404, {
      error: "not_found",
      message: `Route ${method} ${pathname} not found.`,
    });
  } catch (err) {
    console.error(`[API Error] ${method} ${pathname}:`, err);
    sendJson(res, 500, {
      error: "internal_server_error",
      message: err instanceof Error ? err.message : "Unexpected error",
    });
  }
}

export function startApiServer(port = PORT) {
  const server = createServer((req, res) => {
    void routeRequest(req, res);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`\n🚀 [Gasty Private API — Jhon & Sol] Servidor activo en http://localhost:${port}`);
    console.log(`🔒 Seguridad activa: Cabecera 'x-app-token' obligatoria en todas las rutas.`);
    console.log(`📡 Endpoints disponibles (GAS-7):`);
    console.log(`   • GET  http://localhost:${port}/api/health`);
    console.log(`   • GET  http://localhost:${port}/api/search?q=arroz&live=true`);
    console.log(`   • POST http://localhost:${port}/api/products`);
    console.log(`   • GET  http://localhost:${port}/api/products/:id\n`);
  });

  return server;
}

// Start server if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer(PORT);
}
