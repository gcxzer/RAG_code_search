import { useEffect, useRef, useState } from 'react'
import { Plus, SendHorizonal, Square, MessageSquare, Trash2, Database, ChevronDown, FolderOpen, Search, Bot, Braces } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { listRepos, listSessions, createSession, deleteSession, chatStream } from '@/services/api'
import type { Repo, Session, SearchResult, PromptParts, SSEEvent } from '@/types'
import MarkdownMessage from '@/components/MarkdownMessage'
import RagPanel from '@/components/RagPanel'

interface RagData {
  retrieval: SearchResult[]
  prompt: PromptParts | null
  tokens: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  ragData?: RagData
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [repos, setRepos] = useState<Repo[]>([])
  const [repoId, setRepoId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeRagIndex, setActiveRagIndex] = useState<number | null>(null)
  const streamingRagRef = useRef<RagData>({ retrieval: [], prompt: null, tokens: 0 })
  const cancelRef = useRef<(() => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listRepos().then(rs => {
      const indexed = rs.filter(r => r.status === 'indexed')
      setRepos(indexed)
      if (indexed.length > 0) setRepoId(indexed[0].repo_id)
    })
    listSessions().then(setSessions)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleNewSession = async () => {
    const s = await createSession(repoId || undefined)
    setSessions(ss => [s, ...ss])
    setActiveSession(s)
    setMessages([])
    setActiveRagIndex(null)
  }

  const handleSelectSession = (s: Session) => {
    setActiveSession(s)
    const msgs: Message[] = s.messages.map(m => {
      const msg: Message = { role: m.role as 'user' | 'assistant', content: m.content }
      if (m.rag_data) {
        msg.ragData = {
          retrieval: m.rag_data.retrieval,
          prompt: m.rag_data.prompt_parts,
          tokens: m.rag_data.total_tokens_estimate,
        }
      }
      return msg
    })
    setMessages(msgs)
    const lastRagIdx = msgs.reduce<number | null>((acc, m, i) => m.ragData ? i : acc, null)
    setActiveRagIndex(lastRagIdx)
  }

  const handleDeleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteSession(sid)
    setSessions(ss => ss.filter(s => s.session_id !== sid))
    if (activeSession?.session_id === sid) {
      setActiveSession(null)
      setMessages([])
      setActiveRagIndex(null)
    }
  }

  const handleStop = () => {
    cancelRef.current?.()
    setSending(false)
    setMessages(ms => {
      const copy = [...ms]
      const last = copy[copy.length - 1]
      if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, streaming: false }
      return copy
    })
  }

  const handleSend = async () => {
    if (!input.trim() || !activeSession || sending) return
    const msg = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    streamingRagRef.current = { retrieval: [], prompt: null, tokens: 0 }

    setMessages(ms => {
      const updated = [...ms, { role: 'user' as const, content: msg }]
      const assistantIdx = updated.length
      setActiveRagIndex(assistantIdx)
      return [...updated, { role: 'assistant' as const, content: '', streaming: true }]
    })

    let newRag: RagData = { retrieval: [], prompt: null, tokens: 0 }

    cancelRef.current = chatStream(
      msg,
      activeSession.session_id,
      repoId,
      (event: SSEEvent) => {
        if (event.type === 'retrieval') {
          newRag = { ...newRag, retrieval: event.results }
          streamingRagRef.current = { ...newRag }
          setMessages(ms => {
            const copy = [...ms]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, ragData: { ...newRag } }
            return copy
          })
        } else if (event.type === 'prompt') {
          newRag = { ...newRag, prompt: event.prompt_parts, tokens: event.total_tokens_estimate }
          streamingRagRef.current = { ...newRag }
          setMessages(ms => {
            const copy = [...ms]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, ragData: { ...newRag } }
            return copy
          })
        } else if (event.type === 'chunk') {
          setMessages(ms => {
            const copy = [...ms]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + event.content }
            return copy
          })
        } else if (event.type === 'done') {
          setMessages(ms => {
            const copy = [...ms]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, streaming: false, ragData: { ...newRag } }
            return copy
          })
          setSending(false)
          listSessions().then(setSessions)
        }
      },
      () => setSending(false)
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const selectedRepo = repos.find(r => r.repo_id === repoId)
  const activeReferenceCount = activeRagIndex !== null
    ? (messages[activeRagIndex]?.ragData?.retrieval.length ?? 0)
    : 0

  return (
    <div className="flex h-full gap-5 overflow-hidden bg-background p-5">
      <aside className="panel hidden w-[300px] shrink-0 flex-col overflow-hidden md:flex">
        <div className="border-b border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Conversations</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Chat</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Ask questions about one indexed repository.</p>
        </div>

        <div className="space-y-3 border-b border-border p-4">
          <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Repository
          </label>
          {repos.length === 0 ? (
            <button
              onClick={() => navigate('/repos')}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/15"
            >
              <FolderOpen size={13} />
              Add repository
            </button>
          ) : (
            <div className="relative">
              <select
                value={repoId}
                onChange={e => setRepoId(e.target.value)}
                className="cursor-pointer w-full appearance-none border border-border rounded-lg
                           px-3 py-2 pr-8 text-xs bg-[hsl(var(--elevated))] text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary
                           transition-all font-medium"
              >
                {repos.map(r => <option key={r.repo_id} value={r.repo_id}>{r.name}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          )}
          <button
            type="button"
            onClick={handleNewSession}
            className="btn-primary h-9 w-full text-xs"
          >
            <Plus size={12} strokeWidth={2.5} />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground">
              <MessageSquare size={18} strokeWidth={1.5} />
              <p className="text-center text-xs">No conversations yet.</p>
            </div>
          ) : (
            sessions.map((s, i) => (
              <div
                key={s.session_id}
                onClick={() => handleSelectSession(s)}
                className={cn(
                  'session-in group flex cursor-pointer items-start justify-between rounded-lg border px-3 py-2.5 transition-all',
                  activeSession?.session_id === s.session_id
                    ? 'border-primary/25 bg-primary/10'
                    : 'border-transparent hover:border-border hover:bg-[hsl(var(--hover))]'
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className={cn(
                    'shrink-0 mt-0.5 w-6 h-6 rounded-md flex items-center justify-center transition-colors',
                    activeSession?.session_id === s.session_id
                      ? 'bg-primary/15 text-primary'
                      : 'bg-[hsl(var(--elevated))] text-muted-foreground'
                  )}>
                    <MessageSquare size={11} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-sm truncate font-medium leading-5 transition-colors',
                      activeSession?.session_id === s.session_id ? 'text-primary' : 'text-foreground'
                    )}>
                      {s.messages.length > 0 ? s.messages[0].content.slice(0, 34) + '...' : 'New chat'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {s.messages.length > 0 && (
                        <span className="text-xs text-muted-foreground/70 font-mono">{s.messages.length} msgs</span>
                      )}
                      {s.updated_at && <span className="text-xs text-muted-foreground/50">·</span>}
                      {s.updated_at && <p className="text-xs text-muted-foreground/60">{formatRelativeTime(s.updated_at)}</p>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={e => handleDeleteSession(s.session_id, e)}
                  aria-label="Delete thread"
                  className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 rounded
                             text-muted-foreground hover:text-destructive hover:bg-destructive/10
                             ml-1 mt-0.5 shrink-0 transition-all"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Chat</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
              {activeSession ? 'Active conversation' : 'No conversation selected'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-[hsl(var(--elevated))] px-3 py-1.5">
              <Database size={12} className="text-primary" />
              <span className="truncate font-medium text-foreground">{selectedRepo?.name ?? 'No repository'}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-[hsl(var(--elevated))] px-3 py-1.5">
              <Search size={12} className="text-primary" />
              <span className="font-mono">{activeReferenceCount} references</span>
            </div>
          </div>
        </header>

        {!activeSession ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
              <Braces size={30} className="text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground tracking-tight">Start a chat</h2>
              <p className="max-w-[280px] text-sm leading-relaxed text-muted-foreground">
                Ask questions about indexed code and review the referenced files.
              </p>
            </div>
            <button
              onClick={handleNewSession}
              className="cursor-pointer flex items-center gap-2 text-sm px-5 py-2.5 rounded-lg
                         bg-primary text-primary-foreground hover:opacity-90 transition-all
                         font-medium active:scale-[0.97]"
            >
              <Plus size={14} strokeWidth={2.5} /> New chat
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              <div className="mx-auto flex max-w-[920px] flex-col gap-8">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-2 mt-12 text-muted-foreground">
                    <MessageSquare size={22} strokeWidth={1.5} />
                    <p className="text-sm">Ask a question. Relevant code references will be attached.</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i}
                    className={`msg-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    style={{ animationDelay: `${Math.min(i * 20, 100)}ms` }}>
                    {m.role === 'user' ? (
                      <div className="max-w-[80%] user-bubble px-4 py-3 text-[15px]
                                    bg-primary text-primary-foreground shadow-sm">
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    ) : (
                      <div className="flex gap-3 max-w-[90%]">
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center mt-1">
                          <Bot size={16} className="text-primary" />
                        </div>
                        <div className="text-[15px] text-foreground leading-relaxed">
                          {m.streaming && !m.content ? (
                            <span aria-hidden="true" className="inline-block w-2 h-4 bg-primary/70 cursor-blink rounded-sm" />
                          ) : m.streaming ? (
                            <>
                              <pre className="whitespace-pre-wrap font-sans leading-7 text-[15px]">{m.content}</pre>
                              <span aria-hidden="true" className="inline-block w-2 h-4 bg-primary/70 cursor-blink rounded-sm ml-0.5" />
                            </>
                          ) : (
                            <MarkdownMessage content={m.content} />
                          )}
                          {m.ragData && !m.streaming && (
                            <button
                              onClick={() => setActiveRagIndex(i)}
                              className={cn(
                                'cursor-pointer mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                activeRagIndex === i
                                  ? 'bg-primary/10 text-primary border border-primary/25'
                                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
                              )}
                            >
                              <Search size={11} />
                              References
                              <span className="text-[10px] opacity-60">·{m.ragData.retrieval.length}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-[hsl(var(--sidebar-bg))] p-4">
              <div className="mx-auto w-full max-w-[900px]">
                <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
                  <textarea
                    ref={textareaRef}
                    aria-label="Enter a question"
                    className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--elevated))] px-4 py-3 text-sm
                               leading-relaxed text-foreground outline-none transition-all
                               placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                    placeholder="Ask about the repository..."
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  <div className="flex items-center justify-end px-1 pt-2">
                    <div className="flex items-center gap-1.5">
                      {sending ? (
                        <button
                          onClick={handleStop}
                          className="cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-lg
                                     text-xs font-medium bg-destructive/10 text-destructive
                                     hover:bg-destructive/20 transition-colors"
                        >
                          <Square size={12} /> Stop
                        </button>
                      ) : (
                        <button
                          onClick={handleSend}
                          aria-label="Send message"
                          disabled={!input.trim()}
                          className={cn(
                            'w-9 h-9 flex items-center justify-center rounded-lg transition-all',
                            input.trim()
                              ? 'bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))] active:scale-95 shadow-md shadow-primary/20'
                              : 'bg-[hsl(var(--hover))] text-muted-foreground cursor-not-allowed'
                          )}
                        >
                          <SendHorizonal size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground/50">Verify answers against the referenced code.</p>
              </div>
            </div>
          </>
        )}
      </main>

      <RagPanel
        retrieval={activeRagIndex !== null ? (messages[activeRagIndex]?.ragData?.retrieval ?? []) : []}
        prompt={activeRagIndex !== null ? (messages[activeRagIndex]?.ragData?.prompt ?? null) : null}
        tokens={activeRagIndex !== null ? (messages[activeRagIndex]?.ragData?.tokens ?? 0) : 0}
        streaming={sending && activeRagIndex !== null && activeRagIndex === messages.length - 1}
      />
    </div>
  )
}
