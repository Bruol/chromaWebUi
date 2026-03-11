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
}

export type ChromaDocumentRow = {
  id: string
  document: string | null
  metadata: Record<string, unknown> | null
}

type ChromaRequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
}

type ChromaConfig = {
  baseUrl: string
  tenant: string
  database: string
}

function getChromaConfig(): ChromaConfig {
  const host = process.env.CHROMA_HOST ?? 'localhost'
  const port = process.env.CHROMA_PORT ?? '8000'
  const protocol = process.env.CHROMA_PROTOCOL ?? 'http'
  const tenant = process.env.CHROMA_TENANT ?? 'default_tenant'
  const database = process.env.CHROMA_DATABASE ?? 'default_database'

  return {
    baseUrl: `${protocol}://${host}:${port}`,
    tenant,
    database,
  }
}

async function chromaRequest<T>(
  path: string,
  options: ChromaRequestOptions = {},
): Promise<T> {
  const config = getChromaConfig()
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

export async function listCollections() {
  const config = getChromaConfig()
  const v2Path = `/api/v2/tenants/${encodeURIComponent(config.tenant)}/databases/${encodeURIComponent(config.database)}/collections`

  try {
    const data = await chromaRequest<ChromaCollection[]>(v2Path)
    return {
      source: 'v2' as const,
      collections: data,
      tenant: config.tenant,
      database: config.database,
    }
  } catch {
    const legacy = await chromaRequest<ChromaCollection[]>('/api/v1/collections')
    return {
      source: 'v1' as const,
      collections: legacy,
      tenant: config.tenant,
      database: config.database,
    }
  }
}

function normalizeDocuments(payload: ChromaGetResponse): ChromaDocumentRow[] {
  const ids = payload.ids ?? []
  const documents = payload.documents ?? []
  const metadatas = payload.metadatas ?? []

  return ids.map((id, index) => ({
    id,
    document: documents[index] ?? null,
    metadata: metadatas[index] ?? null,
  }))
}

export async function getCollectionDocuments(input: {
  collectionId: string
  limit: number
  offset: number
}) {
  const config = getChromaConfig()
  const body = {
    limit: input.limit,
    offset: input.offset,
    include: ['documents', 'metadatas'],
  }
  const v2Path = `/api/v2/tenants/${encodeURIComponent(config.tenant)}/databases/${encodeURIComponent(config.database)}/collections/${encodeURIComponent(input.collectionId)}/get`

  try {
    const data = await chromaRequest<ChromaGetResponse>(v2Path, {
      method: 'POST',
      body,
    })
    return {
      source: 'v2' as const,
      rows: normalizeDocuments(data),
      limit: input.limit,
      offset: input.offset,
    }
  } catch {
    const legacy = await chromaRequest<ChromaGetResponse>(
      `/api/v1/collections/${encodeURIComponent(input.collectionId)}/get`,
      {
        method: 'POST',
        body,
      },
    )
    return {
      source: 'v1' as const,
      rows: normalizeDocuments(legacy),
      limit: input.limit,
      offset: input.offset,
    }
  }
}
