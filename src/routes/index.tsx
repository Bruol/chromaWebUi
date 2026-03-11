import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

type SearchState = {
  collectionId?: string
  offset?: number
}

type Collection = {
  id: string
  name: string
}

type CollectionsResponse = {
  collections: Collection[]
  source: 'v1' | 'v2'
  tenant: string
  database: string
}

type DocumentRow = {
  id: string
  document: string | null
  metadata: Record<string, unknown> | null
}

type DocumentsResponse = {
  rows: DocumentRow[]
  source: 'v1' | 'v2'
  offset: number
  limit: number
}

const PAGE_SIZE = 100

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchState => {
    const collectionId =
      typeof search.collectionId === 'string' && search.collectionId.length > 0
        ? search.collectionId
        : undefined
    const offsetValue =
      typeof search.offset === 'string'
        ? Number.parseInt(search.offset, 10)
        : typeof search.offset === 'number'
          ? search.offset
          : 0

    return {
      collectionId,
      offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
    }
  },
  component: ChromaDashboard,
})

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

function ChromaDashboard() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const [collectionFilter, setCollectionFilter] = useState('')

  const selectedCollection = search.collectionId
  const offset = search.offset ?? 0

  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: () =>
      readJson<CollectionsResponse>('/api/chroma?action=collections'),
    refetchInterval: 3500,
  })

  const documentsQuery = useQuery({
    queryKey: ['documents', selectedCollection, offset],
    queryFn: () =>
      readJson<DocumentsResponse>(
        `/api/chroma?action=documents&collectionId=${encodeURIComponent(selectedCollection ?? '')}&limit=${PAGE_SIZE}&offset=${offset}`,
      ),
    enabled: Boolean(selectedCollection),
    refetchInterval: 3000,
  })

  const filteredCollections = useMemo(() => {
    const source = collectionsQuery.data?.collections ?? []
    if (!collectionFilter.trim()) {
      return source
    }
    const needle = collectionFilter.toLowerCase()
    return source.filter((collection) =>
      collection.name.toLowerCase().includes(needle),
    )
  }, [collectionFilter, collectionsQuery.data?.collections])

  if (
    !selectedCollection &&
    collectionsQuery.data &&
    collectionsQuery.data.collections.length > 0
  ) {
    navigate({
      to: '/',
      search: {
        collectionId: collectionsQuery.data.collections[0]?.id,
        offset: 0,
      },
      replace: true,
    })
  }

  const selectedName =
    collectionsQuery.data?.collections.find((item) => item.id === selectedCollection)
      ?.name ?? null
  const canGoPrev = offset > 0
  const canGoNext = (documentsQuery.data?.rows.length ?? 0) >= PAGE_SIZE

  return (
    <main className="console-page">
      <aside className="console-sidebar">
        <div>
          <p className="panel-kicker">Chroma Console</p>
          <h1 className="panel-title">Collections</h1>
        </div>

        <div className="connection-chip">
          <span>tenant: {collectionsQuery.data?.tenant ?? '...'}</span>
          <span>db: {collectionsQuery.data?.database ?? '...'}</span>
        </div>

        <input
          value={collectionFilter}
          onChange={(event) => setCollectionFilter(event.target.value)}
          placeholder="Filter collections"
          className="console-input"
        />

        <div className="collection-list">
          {collectionsQuery.isLoading && <p className="muted-line">Loading collections...</p>}
          {collectionsQuery.isError && (
            <p className="error-line">{collectionsQuery.error.message}</p>
          )}

          {!collectionsQuery.isLoading &&
            !collectionsQuery.isError &&
            filteredCollections.length === 0 && (
              <p className="muted-line">No collections found.</p>
            )}

          {filteredCollections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() =>
                navigate({
                  to: '/',
                  search: { collectionId: collection.id, offset: 0 },
                })
              }
              className={
                collection.id === selectedCollection
                  ? 'collection-item is-active'
                  : 'collection-item'
              }
            >
              <span className="collection-name">{collection.name}</span>
              <span className="collection-id">{collection.id}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="console-main">
        <header className="console-main-header">
          <div>
            <p className="panel-kicker">Live Records</p>
            <h2 className="panel-title">
              {selectedName ?? 'Select a collection'}
            </h2>
          </div>

          <div className="header-meta">
            <span>API: {documentsQuery.data?.source ?? collectionsQuery.data?.source ?? 'v2'}</span>
            <span>
              Updated:{' '}
              {documentsQuery.dataUpdatedAt
                ? new Date(documentsQuery.dataUpdatedAt).toLocaleTimeString()
                : 'waiting'}
            </span>
          </div>
        </header>

        <div className="document-toolbar">
          <p className="muted-line">
            {documentsQuery.data ? `${documentsQuery.data.rows.length} records loaded` : 'No records loaded yet'}
          </p>

          <div className="pager">
            <button
              type="button"
              className="pager-button"
              disabled={!canGoPrev}
              onClick={() =>
                navigate({
                  to: '/',
                  search: {
                    collectionId: selectedCollection,
                    offset: Math.max(0, offset - PAGE_SIZE),
                  },
                })
              }
            >
              Previous
            </button>
            <button
              type="button"
              className="pager-button"
              disabled={!canGoNext}
              onClick={() =>
                navigate({
                  to: '/',
                  search: {
                    collectionId: selectedCollection,
                    offset: offset + PAGE_SIZE,
                  },
                })
              }
            >
              Next
            </button>
          </div>
        </div>

        <div className="document-grid">
          {!selectedCollection && (
            <div className="status-card">
              Choose a collection from the sidebar to start browsing documents.
            </div>
          )}

          {selectedCollection && documentsQuery.isLoading && (
            <div className="status-card">Loading documents...</div>
          )}

          {selectedCollection && documentsQuery.isError && (
            <div className="status-card is-error">{documentsQuery.error.message}</div>
          )}

          {selectedCollection &&
            documentsQuery.data &&
            documentsQuery.data.rows.length === 0 && (
              <div className="status-card">No documents in this page.</div>
            )}

          {documentsQuery.data?.rows.map((row) => (
            <article key={row.id} className="document-card">
              <div className="document-head">
                <code>{row.id}</code>
              </div>

              <div className="document-body">
                <p>{row.document ?? 'No document payload'}</p>
              </div>

              <pre className="metadata-block">
                {row.metadata ? JSON.stringify(row.metadata, null, 2) : '{}'}
              </pre>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
