// LOCAL DEVELOPMENT ONLY: exposes the local Supabase Auth server under /auth/v1,
// the path layout of a hosted Supabase project, so the app code is identical.
import http from 'node:http'

const AUTH_UPSTREAM = { host: '127.0.0.1', port: 9999 }
const PORT = 54321

http
  .createServer((req, res) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    if (!req.url?.startsWith('/auth/v1')) {
      res.writeHead(404, cors)
      return res.end('not found')
    }
    const upstream = http.request(
      { ...AUTH_UPSTREAM, path: req.url.slice('/auth/v1'.length) || '/', method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors })
        up.pipe(res)
      },
    )
    upstream.on('error', () => {
      res.writeHead(502, cors)
      res.end('auth upstream unavailable')
    })
    req.pipe(upstream)
  })
  .listen(PORT, '127.0.0.1')
