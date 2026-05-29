import { useEffect, useState } from 'react'
import { listRepos, search, promptPreview, getChunkContext } from '@/services/api'
import type { Repo, SearchResponse, PromptPreviewResponse, ChunkContext } from '@/types'
import { cn } from '@/lib/utils'
import {
  Cpu, Target, ChevronUp, ChevronDown, FileCode2, Database, Search, Loader2
} from 'lucide-react'

export default function SearchPlayground() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [repoId, setRepoId] = useState('')
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [preview, setPreview] = useState<PromptPreviewResponse | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [locating, setLocating] = useState<string | null>(null)
  const [locatorCtx, setLocatorCtx] = useState<ChunkContext | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listRepos().then(rs => {
      const indexed = rs.filter(r => r.status === 'indexed')
      setRepos(indexed)
      if (indexed.length > 0) setRepoId(indexed[0].repo_id)
    })
  }, [])

  const handleSearch = async () => {
    if (!query.trim() || !repoId) return
    setError('')
    setSearching(true)
    setResult(null)
    setPreview(null)
    setLocatorCtx(null)
    try {
      const [sr, pp] = await Promise.all([
        search(query, repoId, topK),
        promptPreview(query, repoId, undefined, topK),
      ])
      setResult(sr)
      setPreview(pp)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const handleLocate = async (chunk_id: string) => {
    if (locating === chunk_id) { setLocating(null); setLocatorCtx(null); return }
    setLocating(chunk_id)
    try {
      const ctx = await getChunkContext(repoId, chunk_id)
      setLocatorCtx(ctx)
    } catch (e) { console.error(e) }
  }

  const selectedRepo = repos.find(r => r.repo_id === repoId)

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Search</p>
            <h1 className="page-title mt-2">Code Search</h1>
            <p className="page-subtitle">Search indexed code, tune result count, and inspect matched snippets.</p>
          </div>
          {result && <span className="font-mono text-xs text-muted-foreground">{result.total_searched} chunks scanned</span>}
        </header>

        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="panel overflow-hidden">
              <div className="border-b border-border p-5">
                <h2 className="section-title">Search Query</h2>
                <p className="mt-1 text-xs text-muted-foreground">One focused question per run works best.</p>
              </div>
              <div className="space-y-4 p-5">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Repository</span>
                  <span className="field-shell h-11">
                    <Database size={14} className="shrink-0 text-muted-foreground" />
                    <select
                      value={repoId}
                      onChange={e => setRepoId(e.target.value)}
                      className="w-full cursor-pointer appearance-none bg-transparent pr-2 font-mono text-xs text-foreground outline-none"
                    >
                      {repos.map(r => <option key={r.repo_id} value={r.repo_id}>{r.name}</option>)}
                    </select>
                  </span>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Question</span>
                  <textarea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSearch()
                      }
                    }}
                    className="min-h-32 w-full resize-none rounded-lg border border-border bg-[hsl(var(--elevated))] px-3 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
                    placeholder="How is configuration loaded?"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <label className="field-shell h-10 flex-1">
                    <span className="text-xs font-medium text-muted-foreground">Top-K</span>
                    <input
                      type="number"
                      value={topK}
                      onChange={e => setTopK(Number(e.target.value))}
                      className="w-full bg-transparent text-right font-mono text-sm text-foreground outline-none"
                      min={1}
                      max={20}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching || !repoId || !query.trim()}
                    className="btn-primary h-10 flex-1"
                  >
                    {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={16} />}
                    Run
                  </button>
                </div>
                {error && <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
            </section>

            <section className="panel p-4">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-primary" />
                <h2 className="section-title">Search Summary</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Scope</span>
                  <span className="truncate font-mono text-xs">{selectedRepo ? selectedRepo.name : 'No indexed repository'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Matches</span>
                  <span className="font-mono text-xs">{result ? result.results.length : '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Prompt estimate</span>
                  <span className="font-mono text-xs">{preview ? `~${preview.total_tokens_estimate}` : '-'}</span>
                </div>
              </div>
            </section>
          </aside>

          <div className="space-y-5">
            {searching && (
              <div className="panel flex min-h-80 flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                  <Cpu size={24} className="animate-pulse text-primary" />
                </div>
                <p className="text-sm">Embedding query and ranking code chunks...</p>
              </div>
            )}

            {!result && !searching && (
              <div className="panel flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Search size={26} strokeWidth={1.5} />
                <p className="text-sm">Run a query to see matching code snippets.</p>
              </div>
            )}

            {result && !searching && (
              <div className="space-y-5 msg-in">
                <section className="panel p-4">
                  <div className="flex flex-col gap-3 text-xs font-mono text-muted-foreground lg:flex-row lg:items-center">
                    <div className="flex items-center gap-2">
                      <Target size={14} className="shrink-0 text-primary" />
                      <span className="font-sans font-medium text-foreground">Query vector</span>
                    </div>
                    <div className="code-surface min-w-0 flex-1 truncate px-3 py-2 text-foreground">
                      [{result.query_embedding_preview.map(v => v.toFixed(4)).join(', ')}]
                    </div>
                  </div>
                </section>

                <div className="grid gap-3">
                  {result.results.map((r, i) => (
                    <article key={r.chunk_id} className="panel overflow-hidden transition-colors hover:border-[hsl(var(--border-hover))]">
                      <div className="grid gap-3 border-b border-border bg-[hsl(var(--elevated))] px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                          <FileCode2 size={14} className="shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono text-sm text-foreground">{r.file_path}</span>
                          <span className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            L{r.line_start}-{r.line_end}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 font-mono text-xs">
                          <span className="text-muted-foreground">dist {r.distance.toFixed(4)}</span>
                          <span className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 px-2 py-0.5 font-semibold text-[hsl(var(--success))]">
                            {r.score.toFixed(3)}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <pre className="code-surface mb-3 max-h-36 overflow-x-auto whitespace-pre-wrap p-3 text-muted-foreground">
                          {r.content}
                        </pre>
                        <button
                          type="button"
                          onClick={() => handleLocate(r.chunk_id)}
                          className="btn-ghost h-8 px-2 text-xs text-primary hover:text-foreground"
                        >
                          {locating === r.chunk_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {locating === r.chunk_id ? 'Hide source' : 'View source'}
                        </button>
                        {locating === r.chunk_id && locatorCtx && (
                          <div className="mt-3 msg-in">
                            <InlineLocator ctx={locatorCtx} />
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {preview && (
                  <section className="panel overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowPrompt(p => !p)}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-[hsl(var(--hover))]"
                    >
                      <span>Prompt Preview</span>
                      <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        ~{preview.total_tokens_estimate} tokens
                        {showPrompt ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    {showPrompt && (
                      <div className="space-y-3 border-t border-border p-4 text-xs font-mono">
                        <PromptSection color="blue" label="System" content={preview.prompt_parts.system} />
                        <PromptSection color="green" label="Context" content={preview.prompt_parts.context} />
                        <PromptSection color="yellow" label="History"
                          content={preview.prompt_parts.history.length === 0
                            ? '(no conversation history)'
                            : preview.prompt_parts.history.map(m => `[${m.role}]: ${m.content}`).join('\n')}
                        />
                        <PromptSection color="red" label="User" content={preview.prompt_parts.user_message} />
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptSection({ color, label, content }: { color: string; label: string; content: string }) {
  const styles: Record<string, string> = {
    blue:   'border-blue-500/30 bg-blue-500/10',
    green:  'border-green-500/30 bg-green-500/10',
    yellow: 'border-yellow-500/30 bg-yellow-500/10',
    red:    'border-red-500/30 bg-red-500/10',
  }
  const dots: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500',
  }
  return (
    <div className={`border rounded-lg p-3 ${styles[color]}`}>
      <div className="font-semibold mb-1.5 text-xs flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dots[color]}`} />
        {label}
      </div>
      <pre className="whitespace-pre-wrap text-xs overflow-x-auto max-h-40 text-foreground/80 leading-relaxed">{content}</pre>
    </div>
  )
}

function InlineLocator({ ctx }: { ctx: ChunkContext }) {
  const lines = ctx.file_content.split('\n')
  const start = Math.max(0, ctx.highlight_start - 3)
  const end = Math.min(lines.length, ctx.highlight_end + 2)
  return (
    <div className="border border-border rounded-lg overflow-auto max-h-48 font-mono text-xs bg-[hsl(var(--elevated))]">
      <div className="px-3 py-1.5 border-b border-border text-muted-foreground text-xs flex items-center gap-2">
        <FileCode2 size={12} />
        {ctx.file_path} · L{ctx.highlight_start}-{ctx.highlight_end}
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {lines.slice(start, end).map((line, i) => {
            const lineNum = start + i + 1
            const isHl = lineNum >= ctx.highlight_start && lineNum <= ctx.highlight_end
            return (
              <tr key={lineNum} className={cn(
                isHl
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : 'border-l-2 border-l-transparent'
              )}>
                <td className="select-none text-right pr-2 pl-1 text-muted-foreground/50 border-r border-border w-8">{lineNum}</td>
                <td className={`pl-2 whitespace-pre ${isHl ? 'text-foreground' : 'text-foreground/75'}`}>{line}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
