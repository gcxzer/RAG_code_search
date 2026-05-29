import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listRepos, listChunks, getChunkContext, getRepoStats } from '@/services/api'
import type { Repo, Chunk, ChunkContext, IndexStats } from '@/types'
import { cn } from '@/lib/utils'
import { Code2, Database, Search } from 'lucide-react'

export default function ChunksExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [repos, setRepos] = useState<Repo[]>([])
  const [repoId, setRepoId] = useState(searchParams.get('repo') ?? '')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [stats, setStats] = useState<IndexStats | null>(null)
  const [selected, setSelected] = useState<Chunk | null>(null)
  const [context, setContext] = useState<ChunkContext | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listRepos().then(rs => {
      const indexed = rs.filter(r => r.status === 'indexed')
      setRepos(indexed)
      if (!repoId && indexed.length > 0) setRepoId(indexed[0].repo_id)
    })
  }, [])

  useEffect(() => {
    if (!repoId) return
    setSearchParams({ repo: repoId })
    setLoading(true)
    setSelected(null)
    setContext(null)
    Promise.all([
      listChunks(repoId),
      getRepoStats(repoId),
    ]).then(([c, s]) => {
      setChunks(c.chunks)
      setStats(s)
    }).finally(() => setLoading(false))
  }, [repoId])

  const handleSelect = async (chunk: Chunk) => {
    setSelected(chunk)
    setContext(null)
    try {
      const ctx = await getChunkContext(repoId, chunk.chunk_id)
      setContext(ctx)
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = filter
    ? chunks.filter(c => c.file_path.includes(filter) || c.content.includes(filter))
    : chunks

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-[hsl(var(--sidebar-bg))] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Code Map</p>
            <h1 className="page-title mt-2">Code Map</h1>
            <p className="page-subtitle">Browse indexed code chunks and verify their source lines.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="field-shell h-10">
              <Database size={14} className="shrink-0 text-muted-foreground" />
              <select
                value={repoId}
                onChange={e => setRepoId(e.target.value)}
                className="min-w-40 cursor-pointer appearance-none bg-transparent pr-2 text-sm text-foreground outline-none"
              >
                {repos.map(r => <option key={r.repo_id} value={r.repo_id}>{r.name}</option>)}
              </select>
            </label>
            <label className="field-shell h-10">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input
                className="input-clean w-56"
                placeholder="Filter path or content"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </label>
          </div>
        </div>
      </header>

      {stats && (
        <div className="grid shrink-0 grid-cols-2 gap-px border-b border-border bg-border text-xs md:grid-cols-5">
          {[
            ['Total Chunks', stats.total_chunks],
            ['Files', stats.total_files],
            ['Embed Dim', stats.embedding_dim || '-'],
            ['Chunk Size', stats.chunk_size],
            ['Overlap', stats.chunk_overlap],
          ].map(([label, value]) => (
            <div key={label} className="bg-background px-4 py-3">
              <p className="text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="max-h-72 w-full shrink-0 overflow-y-auto border-b border-border bg-[hsl(var(--sidebar-bg))] lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
          {loading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No chunk data</p>
          )}
          {filtered.map(chunk => (
            <div
              key={chunk.chunk_id}
              onClick={() => handleSelect(chunk)}
              className={cn(
                'cursor-pointer border-b border-l-2 border-border p-3 transition-colors',
                selected?.chunk_id === chunk.chunk_id
                  ? 'bg-primary/10 border-l-primary'
                  : 'border-l-transparent hover:bg-[hsl(var(--hover))]'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="max-w-[220px] truncate font-mono text-xs text-primary">
                  {chunk.file_path}
                </span>
                <span className="whitespace-nowrap rounded border border-border bg-[hsl(var(--elevated))] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  L{chunk.line_start}–{chunk.line_end}
                </span>
              </div>
              <p className="mb-2 line-clamp-2 font-mono text-xs leading-relaxed text-muted-foreground">{chunk.content}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/60">{chunk.char_count} chars</span>
                {chunk.overlap_start != null && (
                  <span className="text-[10px] text-[hsl(var(--warning))]">
                    Overlap L{chunk.overlap_start}–{chunk.overlap_end}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-h-[320px] min-w-0 flex-1 flex-col bg-background lg:min-h-0">
          {!selected && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Code2 size={24} className="mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-sm">Select a chunk to view source.</p>
              </div>
            </div>
          )}
          {selected && !context && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading source...</p>
            </div>
          )}
          {context && (
            <>
              <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-[hsl(var(--elevated))] px-4">
                <Code2 size={14} className="text-primary" />
                <span className="truncate font-mono text-sm font-medium">{context.file_path}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  L{context.highlight_start}–{context.highlight_end} · {context.total_lines} lines
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <SourceLocator context={context} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceLocator({ context }: { context: ChunkContext }) {
  const lines = context.file_content.split('\n')
  const { highlight_start, highlight_end } = context

  return (
    <div className="font-mono text-xs">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const lineNum = i + 1
            const isHighlighted = lineNum >= highlight_start && lineNum <= highlight_end
            return (
              <tr
                key={lineNum}
                className={cn(
                  isHighlighted
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'hover:bg-muted/30 border-l-2 border-l-transparent'
                )}
              >
                <td className="select-none text-right pr-3 pl-2 py-0.5 text-muted-foreground/50 border-r border-border w-10 shrink-0">
                  {lineNum}
                </td>
                <td className={`pl-3 py-0.5 whitespace-pre ${isHighlighted ? 'text-foreground' : 'text-foreground/75'}`}>
                  {line}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
