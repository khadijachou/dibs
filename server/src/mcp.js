// Minimal client for Bitrefill's MCP server (JSON-RPC over HTTPS).
// Gets its own access token with the OAuth client credentials from .env and renews it before expiry.
const MCP_URL = process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp'
const TOKEN_URL = process.env.BITREFILL_TOKEN_URL || 'https://api.bitrefill.com/oauth/mcp/token'
const CLIENT_ID = process.env.BITREFILL_CLIENT_ID || ''
const CLIENT_SECRET = process.env.BITREFILL_CLIENT_SECRET || ''

export const mcpEnabled = () => Boolean(CLIENT_ID && CLIENT_SECRET)

let token = null // { value, expiresAt }

// One token request at a time: a burst of calls (the catalogue) shares the same renewal.
let tokenRequest = null
function getToken() {
  if (token && Date.now() < token.expiresAt - 60_000) return Promise.resolve(token.value)
  tokenRequest ??= requestToken().finally(() => { tokenRequest = null })
  return tokenRequest
}

async function requestToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'mcp',
    resource: MCP_URL,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Bitrefill token failed: HTTP ${r.status} ${j.error || ''}`)
  token = { value: j.access_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
  return token.value
}

let nextId = 1

// Calls one MCP tool and returns the text of its first content block.
// The server answers either plain JSON or a server-sent-events stream ("event: message\ndata: {...}").
export async function callTool(name, args) {
  const bearer = await getToken()
  const r = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }),
  })
  const raw = await r.text()
  if (r.status === 401) { token = null; throw new Error('Bitrefill rejected the token') }
  if (!r.ok) throw new Error(`Bitrefill MCP HTTP ${r.status}: ${raw.slice(0, 200)}`)
  const msg = parseRpc(raw)
  if (msg.error) throw new Error(`Bitrefill MCP error: ${msg.error.message || JSON.stringify(msg.error)}`)
  const text = msg.result?.content?.find((c) => c.type === 'text')?.text ?? ''
  if (msg.result?.isError) throw new Error(text.slice(0, 300) || 'Bitrefill tool error')
  return text
}

function parseRpc(raw) {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  // SSE: take the last "data:" line that parses as JSON.
  const lines = trimmed.split('\n').filter((l) => l.startsWith('data:'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i].slice(5).trim()) } catch { /* keep looking */ }
  }
  throw new Error('Unreadable MCP response')
}
