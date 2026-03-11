import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCollectionDocuments, listCollections } from '../server/chroma'

function readOptionalParam(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : undefined
}

export const Route = createFileRoute('/api/chroma')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const action = url.searchParams.get('action')
          const host = readOptionalParam(url.searchParams.get('host'))
          const tenant = readOptionalParam(url.searchParams.get('tenant'))
          const database = readOptionalParam(url.searchParams.get('database'))

          if (action === 'collections') {
            return json(await listCollections({ host, tenant, database }))
          }

          if (action === 'documents') {
            const collectionId = url.searchParams.get('collectionId')
            const query = readOptionalParam(url.searchParams.get('q'))
            if (!collectionId) {
              return json(
                { error: 'Missing required query parameter: collectionId' },
                { status: 400 },
              )
            }

            const limit = Math.min(
              250,
              Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '100', 10)),
            )
            const offset = Math.max(
              0,
              Number.parseInt(url.searchParams.get('offset') ?? '0', 10),
            )

            return json(
              await getCollectionDocuments({
                collectionId,
                limit,
                offset,
                host,
                tenant,
                database,
                query,
              }),
            )
          }

          return json(
            { error: 'Unknown action. Use action=collections or action=documents' },
            { status: 400 },
          )
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Unknown server error while requesting Chroma',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
