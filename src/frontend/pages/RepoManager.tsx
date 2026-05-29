import { useEffect, useState, useRef } from 'react'
import { listRepos, addRepo, uploadRepo, deleteRepo, triggerIndex, getIndexStatus } from '@/services/api'
import type { Repo } from '@/types'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  HardDrive, FileCode2, Terminal, FolderOpen, Loader2,
  RefreshCw, Layers, Trash2, Plus
} from 'lucide-react'

type AddMode = 'local' | 'upload'

export default function RepoManager() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<AddMode>('local')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const navigate = useNavigate()

  const load = () => listRepos().then(setRepos).catch(console.error)

  useEffect(() => {
    load()
    return () => Object.values(pollRefs.current).forEach(clearInterval)
  }, [])

  const startPolling = (repo_id: string) => {
    if (pollRefs.current[repo_id]) return
    pollRefs.current[repo_id] = setInterval(async () => {
      const s = await getIndexStatus(repo_id).catch(() => null)
      if (!s) return
      setRepos(rs => rs.map(r => r.repo_id === repo_id
        ? { ...r, status: s.status as Repo['status'], error_msg: s.error_msg }
        : r))
      if (s.status === 'indexed' || s.status === 'error') {
        clearInterval(pollRefs.current[repo_id])
        delete pollRefs.current[repo_id]
        load()
      }
    }, 1500)
  }
  const handleAdd = async () => {
    setError('')
    if (mode === 'local') {
      if (!path.trim()) return
      setAdding(true)
      try {
        const repo = await addRepo(path.trim(), name.trim() || undefined)
        setRepos(rs => [...rs, repo])
        setPath('')
        setName('')
      } catch (e: any) {
        setError(e.message)
      } finally {
        setAdding(false)
      }
    } else {
      if (!zipFile) return
      setAdding(true)
      try {
        const repo = await uploadRepo(zipFile, name.trim() || undefined)
        setRepos(rs => [...rs, repo])
        setZipFile(null)
        setName('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (e: any) {
        setError(e.message)
      } finally {
        setAdding(false)
      }
    }
  }

  const handleIndex = async (repo_id: string) => {
    await triggerIndex(repo_id)
    setRepos(rs => rs.map(r => r.repo_id === repo_id ? { ...r, status: 'indexing' } : r))
    startPolling(repo_id)
  }

  const handleDelete = async (repo_id: string) => {
    if (!confirm('Delete this repository?')) return
    await deleteRepo(repo_id)
    setRepos(rs => rs.filter(r => r.repo_id !== repo_id))
  }

  const statusBadge = (s: Repo['status']) => {
    const cls: Record<string, string> = {
      pending:  'bg-muted text-muted-foreground border-border',
      indexing: 'bg-primary/10 text-primary border-primary/30',
      indexed:  'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
      error:    'bg-destructive/10 text-destructive border-destructive/30',
    }
    const dot: Record<string, string> = {
      pending: 'bg-muted-foreground/50',
      indexing: 'bg-primary animate-pulse',
      indexed: 'bg-[hsl(var(--success))]',
      error: 'bg-destructive',
    }
    const label: Record<string, string> = {
      pending: 'Pending', indexing: 'Indexing', indexed: 'Indexed', error: 'Failed',
    }
    return (
      <span className={`status-pill ${cls[s]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot[s]}`} />
        {label[s]}
      </span>
    )
  }

  const indexedCount = repos.filter(r => r.status === 'indexed').length
  const indexingCount = repos.filter(r => r.status === 'indexing').length
  const totalFiles = repos.reduce((sum, r) => sum + (r.file_count || 0), 0)
  const totalChunks = repos.reduce((sum, r) => sum + (r.chunk_count || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Repositories</p>
            <h1 className="page-title mt-2">Repository Manager</h1>
            <p className="page-subtitle">Add repositories, track indexing, and prepare code for search.</p>
          </div>
          <button type="button" onClick={load} className="btn-secondary">
            <RefreshCw size={15} />
            Refresh queue
          </button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {[
              ['Sources', repos.length],
              ['Indexed', indexedCount],
              ['Files', totalFiles],
              ['Chunks', totalChunks],
            ].map(([label, value]) => (
              <div key={label} className="stat-tile">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className={cn('mt-2 font-mono text-3xl font-semibold', label === 'Indexed' && 'text-[hsl(var(--success))]')}>
                  {value}
                </p>
              </div>
            ))}
            <div className="panel p-4">
              <p className="section-title">Index Status</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Active jobs</span>
                  <span className="font-mono">{indexingCount}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--elevated))]">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${repos.length ? Math.round((indexedCount / repos.length) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {repos.length ? `${indexedCount} of ${repos.length} sources ready` : 'No sources staged'}
                </p>
              </div>
            </div>
          </aside>

          <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_1.15fr]">
            <section className="panel overflow-hidden">
              <div className="border-b border-border p-5">
                <h2 className="section-title">Add Repository</h2>
                <p className="mt-1 text-xs text-muted-foreground">{indexingCount > 0 ? `${indexingCount} indexing job active` : 'Ready to index a new source'}</p>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border">
                <button
                  type="button"
                  onClick={() => { setMode('local'); setError('') }}
                  className={cn(
                    'flex items-center justify-center gap-2 bg-card px-4 py-3 text-sm font-medium transition-colors',
                    mode === 'local' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <HardDrive size={15} />
                  Local path
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('upload'); setError('') }}
                  className={cn(
                    'flex items-center justify-center gap-2 bg-card px-4 py-3 text-sm font-medium transition-colors',
                    mode === 'upload' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FolderOpen size={15} />
                  ZIP upload
                </button>
              </div>

              <div className="space-y-4 p-5">
                {mode === 'local' ? (
                  <>
                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Repository path</span>
                      <span className="field-shell h-11">
                        <HardDrive size={16} className="shrink-0 text-muted-foreground" />
                        <input
                          type="text"
                          className="input-clean font-mono"
                          placeholder="/Users/dev/projects/my-app"
                          value={path}
                          onChange={e => setPath(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                      </span>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Display name</span>
                      <input
                        className="field-shell h-11 w-full font-mono text-sm outline-none"
                        placeholder="Optional"
                        value={name}
                        onChange={e => setName(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={adding || !path.trim()}
                      className="btn-primary w-full"
                    >
                      {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Add and index
                    </button>
                  </>
                ) : (
                  <>
                    <label
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-[hsl(var(--elevated))] px-5 text-center transition-colors hover:border-primary"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                        <FileCode2 size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {zipFile ? zipFile.name : 'Drop a repository archive'}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {zipFile ? `${(zipFile.size / 1024 / 1024).toFixed(1)} MB` : 'ZIP source package'}
                        </span>
                      </span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) setZipFile(f)
                      }}
                    />
                    <input
                      className="field-shell h-11 w-full font-mono text-sm outline-none"
                      placeholder="Display name optional"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={adding || !zipFile}
                      className="btn-primary w-full"
                    >
                      {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Upload and index
                    </button>
                  </>
                )}

                {error && <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-5">
                <div>
                  <h2 className="section-title">Repositories</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Every repository currently known to the workspace.</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{repos.length} total</span>
              </div>
              {repos.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
                  <FolderOpen size={18} />
                  Add a repository to get started.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {repos.map(repo => (
                    <div key={repo.repo_id} className="grid gap-4 p-4 transition-colors hover:bg-[hsl(var(--hover))]/55 2xl:grid-cols-[1fr_auto] 2xl:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-[hsl(var(--elevated))]">
                          {repo.source === 'upload'
                            ? <FileCode2 size={18} className="text-primary" />
                            : <Terminal size={18} className="text-muted-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{repo.name}</span>
                            {repo.source === 'upload' && (
                              <span className="status-pill border-primary/25 bg-primary/10 text-primary">Upload</span>
                            )}
                            {statusBadge(repo.status)}
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                            <span className="max-w-[560px] truncate">{repo.path}</span>
                            {repo.status === 'indexed' && (
                              <>
                                <span>{repo.file_count} files</span>
                                <span>{repo.chunk_count} chunks</span>
                              </>
                            )}
                          </div>
                          {repo.error_msg && <p className="mt-1 text-xs text-destructive">{repo.error_msg}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 2xl:justify-end">
                        {repo.status === 'indexed' && (
                          <button
                            type="button"
                            onClick={() => navigate(`/chunks?repo=${repo.repo_id}`)}
                            className="btn-secondary h-9 px-3 text-xs"
                          >
                            <Layers size={13} />
                            Map
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleIndex(repo.repo_id)}
                          disabled={repo.status === 'indexing'}
                          className="btn-secondary h-9 px-3 text-xs"
                        >
                          {repo.status === 'indexing'
                            ? <><Loader2 size={13} className="animate-spin" /> Indexing</>
                            : <><RefreshCw size={13} /> {repo.status === 'indexed' ? 'Reindex' : 'Index'}</>}
                        </button>
                        <button
                          type="button"
                          title="Delete repository"
                          aria-label="Delete repository"
                          onClick={() => handleDelete(repo.repo_id)}
                          className="danger-button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
