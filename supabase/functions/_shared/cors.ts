const allowedOrigins = [
  "https://preview--phyto-map-viewer.lovable.app",
  "https://app.phytomaps.com",
  "http://localhost:3000",
  "http://localhost:5173"
]

export function getCorsHeaders(origin: string | null, method: string = 'GET') {
  if (method === 'GET') {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
      "Access-Control-Max-Age": "3600"
    };
  }
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "3600"
  };
}