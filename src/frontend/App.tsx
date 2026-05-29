import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import {
  FolderOpen, Layers, Search, MessageSquare,
  Sun, Moon, Braces, SlidersHorizontal
} from 'lucide-react'

import SettingsPage from '@/pages/SettingsPage'
import RepoManager from '@/pages/RepoManager'
import ChunksExplorer from '@/pages/ChunksExplorer'
import SearchPlayground from '@/pages/SearchPlayground'
import ChatPage from '@/pages/ChatPage'

// Initialize theme outside components to avoid flicker.
const savedTheme = localStorage.getItem('theme')
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
}

const NAV_ITEMS = [
  { to: '/repos',    label: 'Repositories', icon: FolderOpen },
  { to: '/chunks',   label: 'Code Map', icon: Layers },
  { to: '/search',   label: 'Search', icon: Search },
  { to: '/chat',     label: 'Chat', icon: MessageSquare },
]

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return { dark, toggle }
}

function TopCommandBar() {
  const { dark, toggle } = useTheme()
  return (
    <header className="app-topbar">
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Braces size={18} />
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold tracking-tight">SourceDesk</p>
          <p className="text-xs text-muted-foreground">Code search workspace</p>
        </div>
      </div>

      <nav className="top-nav-scroll" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                'top-nav-item',
                isActive ? 'top-nav-item-active' : 'top-nav-item-idle'
              )
            }
          >
            <span className="top-nav-icon">
              <Icon size={14} />
            </span>
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NavLink
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={({ isActive }) =>
            cn(
              'icon-button',
              isActive
                ? 'bg-primary/10 text-primary'
                : ''
            )
          }
        >
          <SlidersHorizontal size={16} />
        </NavLink>
        <button
          type="button"
          onClick={toggle}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="icon-button"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}

function Layout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopCommandBar />
      <main className="min-h-0 flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/repos" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/repos" element={<RepoManager />} />
          <Route path="/chunks" element={<ChunksExplorer />} />
          <Route path="/search" element={<SearchPlayground />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
