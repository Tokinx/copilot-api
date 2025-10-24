import type { Context, Next } from "hono"

import { HTTPException } from "hono/http-exception"

import { state } from "~/lib/state"

/**
 * API Key authentication middleware
 * Validates API key from Authorization header (Bearer token) or X-API-Key header
 * Throws 401 if API key is required but missing or invalid
 */
export async function apiKeyAuth(c: Context, next: Next): Promise<void> {
  // Skip authentication if no API key is configured
  if (!state.apiKey) {
    return next()
  }

  // Extract API key from headers
  const authHeader = c.req.header("Authorization")
  const xApiKey = c.req.header("X-API-Key")

  let providedKey: string | undefined

  // Try Bearer token format first
  if (authHeader?.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7)
  }
  // Fallback to X-API-Key header
  else if (xApiKey) {
    providedKey = xApiKey
  }

  // Validate API key
  if (!providedKey || providedKey !== state.apiKey) {
    throw new HTTPException(401, {
      message: "Invalid or missing API key",
    })
  }

  await next()
}
