import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import {
  FolderOpen, Layers, Search, MessageSquare, Settings,
  Sun, Moon, Braces
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
  { to: '/chunks',   label: 'Chunks',       icon: Layers },
  { to: '/search',   label: 'Search',       icon: Search },
  { to: '/chat',     label: 'AI Chat',      icon: MessageSquare },
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

// Icon-only rail for /chat route
function IconRail() {
  const { dark, toggle } = useTheme()
  return (
    <nav className="w-16 shrink-0 border-r border-border bg-[hsl(var(--background))] flex flex-col items-center py-4 gap-1">
      <div className="w-9 h-9 rounded-lg mb-3 bg-[#7c6af7]/10 text-[#7c6af7] flex items-center justify-center">
        <Braces size={18} />
      </div>

      {/* Main nav icons */}
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            cn(
              'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
              isActive
                ? 'bg-[#7c6af7]/10 text-[#7c6af7]'
                : 'text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#7c6af7] rounded-r-full" />
              )}
              <Icon size={18} />
            </>
          )}
        </NavLink>
      ))}

      <div className="flex-1" />

      {/* Settings */}
      <NavLink
        to="/settings"
        title="Settings"
        className={({ isActive }) =>
          cn(
            'relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
            isActive
              ? 'bg-[#7c6af7]/10 text-[#7c6af7]'
              : 'text-muted-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#7c6af7] rounded-r-full" />
            )}
            <Settings size={18} />
          </>
        )}
      </NavLink>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover))] transition-colors"
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </nav>
  )
}

// Full text sidebar for non-chat routes
function FullSidebar() {
  const { dark, toggle } = useTheme()
  return (
    <nav className="w-48 shrink-0 border-r border-border bg-[hsl(var(--sidebar-bg))] flex flex-col py-4 gap-1 px-2">
      <div className="flex items-center gap-2.5 px-3 pb-4">
        <span className="w-8 h-8 rounded-lg bg-[#7c6af7]/10 text-[#7c6af7] flex items-center justify-center shrink-0">
          <Braces size={16} />
        </span>
        <span className="font-semibold text-sm tracking-tight">Code Assistant</span>
      </div>

      {/* Main nav items */}
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-[#7c6af7]/15 text-[#7c6af7] font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover))]'
            )
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}

      <div className="flex-1" />

      {/* Settings at bottom */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
            isActive
              ? 'bg-[#7c6af7]/15 text-[#7c6af7] font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover))]'
          )
        }
      >
        <Settings size={15} />
        Settings
      </NavLink>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover))] transition-colors"
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
        {dark ? 'Light mode' : 'Dark mode'}
      </button>
    </nav>
  )
}

function Layout() {
  const location = useLocation()
  const isChat = location.pathname.startsWith('/chat')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {isChat ? <IconRail /> : <FullSidebar />}
      <main className="flex-1 overflow-auto min-w-0">
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
