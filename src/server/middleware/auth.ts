import type { IncomingMessage, ServerResponse } from "node:http";
import "../../api-endpoints.js"; // Ensures .env is loaded
import { sendJson } from "../http-utils.js";

export function verifyAppToken(req: IncomingMessage, res: ServerResponse): boolean {
  const expectedToken = process.env.APP_ACCESS_TOKEN?.trim();
  if (!expectedToken) {
    sendJson(res, 500, {
      error: "server_misconfigured",
      message: "APP_ACCESS_TOKEN is not configured on the server.",
    });
    return false;
  }

  const headerToken = req.headers["x-app-token"];
  const authHeader = req.headers.authorization;

  let providedToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!providedToken && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    providedToken = authHeader.slice("Bearer ".length).trim();
  }

  if (!providedToken || providedToken.trim() !== expectedToken) {
    sendJson(res, 401, {
      error: "unauthorized",
      message: "Invalid or missing x-app-token header.",
    });
    return false;
  }

  return true;
}
