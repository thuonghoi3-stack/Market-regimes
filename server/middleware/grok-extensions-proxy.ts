/**
 * CORS-enabled proxy middleware for Grok extensions.js
 * 
 * Proxies requests from /__grok/extensions.js to https://grok.com/grok-app-builder/extensions.js
 * with proper CORS headers added to bypass Cross-Origin-Resource-Policy restrictions.
 */

const GROK_EXTERNAL_URL = "https://grok.com/grok-app-builder/extensions.js";

export default async function grokExtensionsProxy(event, next) {
  const path = event.url.pathname;

  // Only handle /__grok/extensions.js requests
  if (path !== "/__grok/extensions.js") {
    return next();
  }

  try {
    // Fetch the actual file from Grok
    const response = await fetch(GROK_EXTERNAL_URL, {
      method: "GET",
      // Preserve cache headers
      cache: "default",
    });

    if (!response.ok) {
      console.error(
        `[Grok Proxy] Failed to fetch extensions.js: ${response.status} ${response.statusText}`
      );
      // Fall through to next handler if fetch fails
      return next();
    }

    // Read the response body
    const body = await response.arrayBuffer();

    // Create new response with CORS headers
    const corsHeaders = {
      // Allow all origins to load this resource
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept-Encoding",
      "Access-Control-Max-Age": "86400", // Cache CORS preflight for 24 hours

      // Cross-Origin-Resource-Policy: Tell browser this resource can be loaded from any origin
      "Cross-Origin-Resource-Policy": "cross-origin",

      // Preserve original content-type
      "Content-Type": response.headers.get("Content-Type") || "application/javascript",

      // Add cache control headers
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour

      // Preserve original content-length if available
      ...(response.headers.has("Content-Length") && {
        "Content-Length": response.headers.get("Content-Length"),
      }),
    };

    return new Response(body, {
      status: 200,
      statusText: "OK",
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("[Grok Proxy] Error proxying extensions.js:", error);
    // On error, fall through to next middleware
    return next();
  }
}
