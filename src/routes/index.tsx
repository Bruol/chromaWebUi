import { createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

type SearchState = {
  collectionId?: string
  offset?: number
  host?: string
  tenant?: string
  database?: string
}

type Collection = {
  id: string
  name: string
}

type CollectionsResponse = {
  collections: Collection[]
  source: 'v1' | 'v2'
  host: string
  port: string
  tenant: string
  database: string
}

type DocumentRow = {
  id: string
  document: string | null
  metadata: Record<string, unknown> | null
  vector: number[] | null
}

type DocumentsResponse = {
  rows: DocumentRow[]
  source: 'v1' | 'v2'
  totalChunks: number
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
    const host =
      typeof search.host === 'string' && search.host.trim().length > 0
        ? search.host.trim()
        : undefined
    const tenant =
      typeof search.tenant === 'string' && search.tenant.trim().length > 0
        ? search.tenant.trim()
        : undefined
    const database =
      typeof search.database === 'string' && search.database.trim().length > 0
        ? search.database.trim()
        : undefined

    return {
      collectionId,
      offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
      host,
      tenant,
      database,
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

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function metaPreview(meta: Record<string, unknown> | null): string {
  if (!meta) return '-'
  const keys = Object.keys(meta)
  if (keys.length === 0) return '{}'
  return keys.map((key) => `${key}: ${JSON.stringify(meta[key])}`).join(', ')
}

function buildConnectionQuery(search: SearchState) {
  const params = new URLSearchParams()
  if (search.host) params.set('host', search.host)
  if (search.tenant) params.set('tenant', search.tenant)
  if (search.database) params.set('database', search.database)
  const encoded = params.toString()
  return encoded ? `&${encoded}` : ''
}

function ChromaDashboard() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const [collectionFilter, setCollectionFilter] = useState('')
  const [recordFilter, setRecordFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [hostInput, setHostInput] = useState(search.host ?? '')
  const [tenantInput, setTenantInput] = useState(search.tenant ?? '')
  const [databaseInput, setDatabaseInput] = useState(search.database ?? '')

  const selectedCollection = search.collectionId
  const offset = search.offset ?? 0
  const connectionQuery = buildConnectionQuery(search)
  const normalizedRecordFilter = recordFilter.trim().toLowerCase()

  const collectionsQuery = useQuery({
    queryKey: ['collections', search.host, search.tenant, search.database],
    queryFn: () =>
      readJson<CollectionsResponse>(`/api/chroma?action=collections${connectionQuery}`),
    refetchInterval: 3500,
    placeholderData: (prev) => prev,
  })

  const documentsQuery = useQuery({
    queryKey: [
      'documents',
      selectedCollection,
      offset,
      search.host,
      search.tenant,
      search.database,
      normalizedRecordFilter,
    ],
    queryFn: () =>
      readJson<DocumentsResponse>(
        `/api/chroma?action=documents&collectionId=${encodeURIComponent(selectedCollection ?? '')}&limit=${PAGE_SIZE}&offset=${offset}${connectionQuery}${normalizedRecordFilter ? `&q=${encodeURIComponent(recordFilter.trim())}` : ''}`,
      ),
    enabled: Boolean(selectedCollection),
    refetchInterval: 3000,
    placeholderData: (prev) => prev,
  })

  const filteredCollections = useMemo(() => {
    const source = collectionsQuery.data?.collections ?? []
    if (!collectionFilter.trim()) return source
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
        host: search.host,
        tenant: search.tenant,
        database: search.database,
      },
      replace: true,
    })
  }

  const selectedName =
    collectionsQuery.data?.collections.find((collection) => collection.id === selectedCollection)
      ?.name ?? null

  const isGlobalSearchMode = normalizedRecordFilter.length > 0
  const canGoPrev = offset > 0
  const canGoNext = (documentsQuery.data?.rows.length ?? 0) >= PAGE_SIZE

  const filteredRows = useMemo(() => {
    return documentsQuery.data?.rows ?? []
  }, [documentsQuery.data?.rows])

  const formatVector = (vector: number[] | null) => {
    if (!vector || vector.length === 0) return '[]'
    const preview = vector
      .slice(0, 8)
      .map((value) => value.toFixed(4))
      .join(', ')
    return `[${preview}${vector.length > 8 ? ', ...' : ''}]`
  }

  const pageNum = Math.floor(offset / PAGE_SIZE) + 1

  const effectiveHost = collectionsQuery.data?.host ?? 'localhost'
  const effectiveTenant = collectionsQuery.data?.tenant ?? 'default_tenant'
  const effectiveDatabase = collectionsQuery.data?.database ?? 'default_database'

  const applyConnection = () => {
    const host = hostInput.trim() || undefined
    const tenant = tenantInput.trim() || undefined
    const database = databaseInput.trim() || undefined
    setExpandedId(null)
    setRecordFilter('')
    navigate({
      to: '/',
      search: {
        host,
        tenant,
        database,
        collectionId: undefined,
        offset: 0,
      },
    })
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-brand">
            <span className="brand-mark">C</span>
            Chroma Console
          </h1>
          <div className="sidebar-env">
            <span>{effectiveTenant || 'default_tenant'}</span>
            <span>{effectiveDatabase || 'default_database'}</span>
          </div>
          <div className="connection-form">
            <input
              value={hostInput}
              onChange={(event) => setHostInput(event.target.value)}
              placeholder={`Host (${effectiveHost || 'localhost'})`}
              className="sidebar-input"
            />
            <input
              value={tenantInput}
              onChange={(event) => setTenantInput(event.target.value)}
              placeholder={`Tenant (${effectiveTenant || 'default_tenant'})`}
              className="sidebar-input"
            />
            <input
              value={databaseInput}
              onChange={(event) => setDatabaseInput(event.target.value)}
              placeholder={`Database (${effectiveDatabase || 'default_database'})`}
              className="sidebar-input"
            />
            <button type="button" className="connect-btn" onClick={applyConnection}>
              Apply Connection
            </button>
          </div>
        </div>

        <div className="sidebar-search">
          <input
            value={collectionFilter}
            onChange={(event) => setCollectionFilter(event.target.value)}
            placeholder="Filter collections..."
            className="sidebar-input"
          />
        </div>

        <div className="sidebar-label">
          Collections ({collectionsQuery.data?.collections.length ?? 0})
        </div>

        <div className="sidebar-list">
          {collectionsQuery.isLoading && (
            <div style={{ padding: '8px 8px', color: 'var(--text-3)', fontSize: '0.8125rem' }}>
              Loading...
            </div>
          )}
          {collectionsQuery.isError && (
            <div style={{ padding: '8px 8px', color: 'var(--danger)', fontSize: '0.8125rem' }}>
              {collectionsQuery.error.message}
            </div>
          )}
          {!collectionsQuery.isLoading &&
            !collectionsQuery.isError &&
            filteredCollections.length === 0 && (
              <div style={{ padding: '8px 8px', color: 'var(--text-3)', fontSize: '0.8125rem' }}>
                No collections.
              </div>
            )}

          {filteredCollections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() => {
                setExpandedId(null)
                setRecordFilter('')
                navigate({
                  to: '/',
                  search: {
                    collectionId: collection.id,
                    offset: 0,
                    host: search.host,
                    tenant: search.tenant,
                    database: search.database,
                  },
                })
              }}
              className={
                collection.id === selectedCollection ? 'coll-btn is-active' : 'coll-btn'
              }
            >
              <span className="coll-dot" />
              <span className="coll-label">{collection.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="main">
        <header className="main-header">
          <h2 className="main-title">
            <span className="live-dot" />
            {selectedName ?? 'Select a collection'}
          </h2>
          <div className="main-meta">
            <span>API {documentsQuery.data?.source ?? collectionsQuery.data?.source ?? 'v2'}</span>
            <span>
              {documentsQuery.dataUpdatedAt
                ? new Date(documentsQuery.dataUpdatedAt).toLocaleTimeString()
                : '--:--:--'}
            </span>
          </div>
        </header>

        {!selectedCollection && (
          <div className="empty-state">Select a collection from the sidebar</div>
        )}

        {selectedCollection && (
          <>
            <div className="toolbar">
              <input
                value={recordFilter}
                onChange={(event) => setRecordFilter(event.target.value)}
                placeholder="Search records..."
                className="toolbar-search"
              />
              <span className="toolbar-stat">
                {documentsQuery.data ? (
                  <>
                    <strong>{documentsQuery.data.totalChunks}</strong> total
                    {isGlobalSearchMode && (
                      <span>
                        {' '}
                        / <strong>{filteredRows.length}</strong> matched
                      </span>
                    )}
                  </>
                ) : (
                  '\u00a0'
                )}
              </span>
              <span className="toolbar-spacer" />
              {documentsQuery.isFetching && <span className="spinner" />}
              <button
                type="button"
                className="toolbar-btn"
                disabled={!canGoPrev}
                onClick={() =>
                  navigate({
                    to: '/',
                    search: {
                      collectionId: selectedCollection,
                      offset: Math.max(0, offset - PAGE_SIZE),
                      host: search.host,
                      tenant: search.tenant,
                      database: search.database,
                    },
                  })
                }
              >
                Prev
              </button>
              <span className="toolbar-page-label">
                {isGlobalSearchMode ? `Search page ${pageNum}` : `Page ${pageNum}`}
              </span>
              <button
                type="button"
                className="toolbar-btn"
                disabled={!canGoNext}
                onClick={() =>
                  navigate({
                    to: '/',
                    search: {
                      collectionId: selectedCollection,
                      offset: offset + PAGE_SIZE,
                      host: search.host,
                      tenant: search.tenant,
                      database: search.database,
                    },
                  })
                }
              >
                Next
              </button>
            </div>

            <div className="table-wrap">
              {!documentsQuery.data && documentsQuery.isLoading ? (
                <div className="empty-state">
                  <span className="spinner" /> Loading records...
                </div>
              ) : documentsQuery.isError && !documentsQuery.data ? (
                <div className="empty-state is-error">{documentsQuery.error.message}</div>
              ) : documentsQuery.data && filteredRows.length === 0 ? (
                <div className="empty-state">
                  {recordFilter.trim()
                    ? 'No records match your search'
                    : 'No records on this page'}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="col-id">ID</th>
                      <th className="col-doc">Document</th>
                      <th className="col-meta">Metadata</th>
                      <th className="col-vec">Vector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          className={expandedId === row.id ? 'is-expanded' : ''}
                          onClick={() =>
                            setExpandedId(expandedId === row.id ? null : row.id)
                          }
                        >
                          <td className="cell-id">
                            <code>{truncate(row.id, 28)}</code>
                          </td>
                          <td className="cell-doc">{truncate(row.document ?? '(empty)', 120)}</td>
                          <td className="cell-meta">{truncate(metaPreview(row.metadata), 40)}</td>
                          <td className="cell-vec">{row.vector ? `${row.vector.length}d` : '-'}</td>
                        </tr>
                        {expandedId === row.id && (
                          <tr className="expanded-row">
                            <td colSpan={4}>
                              <div className="expanded-inner">
                                <div className="detail-section full-width">
                                  <p className="detail-label">ID</p>
                                  <pre className="detail-value">{row.id}</pre>
                                </div>
                                <div className="detail-section full-width">
                                  <p className="detail-label">Document</p>
                                  <pre className="detail-value">{row.document ?? '(empty)'}</pre>
                                </div>
                                <div className="detail-section">
                                  <p className="detail-label">Metadata</p>
                                  <pre className="detail-value">
                                    {row.metadata ? JSON.stringify(row.metadata, null, 2) : '{}'}
                                  </pre>
                                </div>
                                <div className="detail-section">
                                  <p className="detail-label">
                                    Vector ({row.vector?.length ?? 0} dimensions)
                                  </p>
                                  <pre className="detail-value">{formatVector(row.vector)}</pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
