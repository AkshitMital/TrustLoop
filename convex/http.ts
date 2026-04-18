import { httpRouter } from 'convex/server'
import { internal } from './_generated/api.js'
import { httpAction } from './_generated/server.js'
import { normalizeGitHubBranchRef } from '../shared/github.js'

const http = httpRouter()
const encoder = new TextEncoder()

type GitHubWebhookPayload = {
  ref?: string
  before?: string
  after?: string
  repository?: {
    name?: string
    owner?: {
      login?: string
      name?: string
    }
  }
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return diff === 0
}

async function verifyGitHubSignature(body: string, secret: string, signatureHeader: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected =
    'sha256=' +
    Array.from(new Uint8Array(signature), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')

  return constantTimeEquals(expected, signatureHeader)
}

http.route({
  path: '/github/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text()
    const event = request.headers.get('x-github-event') ?? 'unknown'
    const deliveryId = request.headers.get('x-github-delivery') ?? undefined

    let payload: GitHubWebhookPayload

    try {
      payload = JSON.parse(rawBody) as GitHubWebhookPayload
    } catch {
      return new Response('Invalid JSON payload.', { status: 400 })
    }

    if (event === 'ping') {
      return Response.json({
        ok: true,
        event,
      })
    }

    const owner =
      payload.repository?.owner?.login ??
      payload.repository?.owner?.name
    const repo = payload.repository?.name
    const branch = normalizeGitHubBranchRef(payload.ref)

    if (!owner || !repo || !branch) {
      return new Response('Repo or branch metadata missing from webhook payload.', {
        status: 400,
      })
    }

    const connection = await ctx.runQuery(internal.github.getConnectionForWebhook, {
      owner,
      repo,
      branch,
    })

    if (!connection) {
      return new Response('No matching tracked repo connection.', {
        status: 202,
      })
    }

    const signature = request.headers.get('x-hub-signature-256')
    if (
      !signature ||
      !(await verifyGitHubSignature(rawBody, connection.webhookSecret, signature))
    ) {
      return new Response('Invalid webhook signature.', { status: 401 })
    }

    if (event !== 'push') {
      return Response.json({
        ok: true,
        ignored: true,
        event,
      })
    }

    await ctx.runMutation(internal.github.enqueuePushWebhook, {
      connectionId: connection._id,
      before: typeof payload.before === 'string' ? payload.before : '',
      after: typeof payload.after === 'string' ? payload.after : '',
      branch,
      deliveryId,
    })

    return Response.json({
      ok: true,
      queued: true,
      event,
    })
  }),
})

export default http
