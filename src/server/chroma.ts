type ChromaCollection = {
  id: string
  name: string
  metadata?: Record<string, unknown> | null
  dimension?: number | null
}

type ChromaGetResponse = {
  ids?: string[]
  documents?: Array<string | null>
  metadatas?: Array<Record<string, unknown> | null>
  embeddings?: Array<number[] | null>
}

export type ChromaDocumentRow = {
  id: string
  document: string | null
  metadata: Record<string, unknown> | null
  vector: number[] | null
}

type ChromaRequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
}

type ChromaConfig = {
  baseUrl: string
  host: string
  port: string
  tenant: string
  database: string
}

type ChromaConnectionOverrides = {
  host?: string
  tenant?: string
  database?: string
}

function getChromaConfig(overrides: ChromaConnectionOverrides = {}): ChromaConfig {
  const host = overrides.host ?? process.env.CHROMA_HOST ?? 'localhost'
  const port = process.env.CHROMA_PORT ?? '8000'
  const protocol = process.env.CHROMA_PROTOCOL ?? 'http'
  const tenant = overrides.tenant ?? process.env.CHROMA_TENANT ?? 'default_tenant'
  const database =
    overrides.database ?? process.env.CHROMA_DATABASE ?? 'default_database'

  return {
    baseUrl: `${protocol}://${host}:${port}`,
    host,
    port,
    tenant,
    database,
  }
}

async function chromaRequest<T>(
  config: ChromaConfig,
  path: string,
  options: ChromaRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Chroma request failed (${response.status}): ${message}`)
  }

  return (await response.json()) as T
}

export async function listCollections(overrides: ChromaConnectionOverrides = {}) {
  const config = getChromaConfig(overrides)
  const v2Path = `/api/v2/tenants/${encodeURIComponent(config.tenant)}/databases/${encodeURIComponent(config.database)}/collections`

  try {
    const data = await chromaRequest<ChromaCollection[]>(config, v2Path)
    return {
      source: 'v2' as const,
      collections: data,
      host: config.host,
      port: config.port,
      tenant: config.tenant,
      database: config.database,
    }
  } catch {
    const legacy = await chromaRequest<ChromaCollection[]>(
      config,
      '/api/v1/collections',
    )
    return {
      source: 'v1' as const,
      collections: legacy,
      host: config.host,
      port: config.port,
      tenant: config.tenant,
      database: config.database,
    }
  }
}

function normalizeDocuments(payload: ChromaGetResponse): ChromaDocumentRow[] {
  const ids = payload.ids ?? []
  const documents = payload.documents ?? []
  const metadatas = payload.metadatas ?? []
  const embeddings = payload.embeddings ?? []

  return ids.map((id, index) => ({
    id,
    document: documents[index] ?? null,
    metadata: metadatas[index] ?? null,
    vector: embeddings[index] ?? null,
  }))
}

function parseCollectionCount(payload: unknown): number | null {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return payload
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'count' in payload &&
    typeof payload.count === 'number' &&
    Number.isFinite(payload.count)
  ) {
    return payload.count
  }
  return null
}

async function getCollectionCount(
  collectionId: string,
  config: ChromaConfig,
): Promise<number> {
  const v2Path = `/api/v2/tenants/${encodeURIComponent(config.tenant)}/databases/${encodeURIComponent(config.database)}/collections/${encodeURIComponent(collectionId)}/count`
  const v1Path = `/api/v1/collections/${encodeURIComponent(collectionId)}/count`

  try {
    const v2 = await chromaRequest<unknown>(config, v2Path)
    const count = parseCollectionCount(v2)
    if (count !== null) return count
  } catch {}

  try {
    const v2Post = await chromaRequest<unknown>(config, v2Path, {
      method: 'POST',
      body: {},
    })
    const count = parseCollectionCount(v2Post)
    if (count !== null) return count
  } catch {}

  try {
    const v1 = await chromaRequest<unknown>(config, v1Path)
    const count = parseCollectionCount(v1)
    if (count !== null) return count
  } catch {}

  const v1Post = await chromaRequest<unknown>(config, v1Path, {
    method: 'POST',
    body: {},
  })
  const count = parseCollectionCount(v1Post)
  return count ?? 0
}

export async function getCollectionDocuments(input: {
  collectionId: string
  limit: number
  offset: number
  host?: string
  tenant?: string
  database?: string
}) {
  const config = getChromaConfig({
    host: input.host,
    tenant: input.tenant,
    database: input.database,
  })
  const body = {
    limit: input.limit,
    offset: input.offset,
    include: ['documents', 'metadatas', 'embeddings'],
  }
  const v2Path = `/api/v2/tenants/${encodeURIComponent(config.tenant)}/databases/${encodeURIComponent(config.database)}/collections/${encodeURIComponent(input.collectionId)}/get`

  try {
    const data = await chromaRequest<ChromaGetResponse>(config, v2Path, {
      method: 'POST',
      body,
    })
    const totalChunks = await getCollectionCount(input.collectionId, config)
    return {
      source: 'v2' as const,
      rows: normalizeDocuments(data),
      totalChunks,
      limit: input.limit,
      offset: input.offset,
    }
  } catch {
    const legacy = await chromaRequest<ChromaGetResponse>(
      config,
      `/api/v1/collections/${encodeURIComponent(input.collectionId)}/get`,
      {
        method: 'POST',
        body,
      },
    )
    const totalChunks = await getCollectionCount(input.collectionId, config)
    return {
      source: 'v1' as const,
      rows: normalizeDocuments(legacy),
      totalChunks,
      limit: input.limit,
      offset: input.offset,
    }
  }
}
