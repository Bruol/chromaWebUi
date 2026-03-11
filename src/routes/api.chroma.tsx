import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCollectionDocuments, listCollections } from '../server/chroma'

export const Route = createFileRoute('/api/chroma')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const action = url.searchParams.get('action')

          if (action === 'collections') {
            return json(await listCollections())
          }

          if (action === 'documents') {
            const collectionId = url.searchParams.get('collectionId')
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
