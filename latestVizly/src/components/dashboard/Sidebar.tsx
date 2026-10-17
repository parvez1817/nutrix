import { useState } from "react";
import { EllipsisVertical, LogOut, Search, SquarePen } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

import type { ConversationSummary } from "@/lib/api";

type ChatHistoryItem = ConversationSummary & { active?: boolean };

const ChatItem = ({ chat }: { chat: ChatHistoryItem }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-all duration-150 flex items-center justify-between group",
        chat.active
          ? "bg-accent/60 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
      )}
    >
      <span className="truncate">{chat.title}</span>
      {hovered && (
        <EllipsisVertical size={14} className="shrink-0 opacity-60 hover:opacity-100 ml-1" />
      )}
    </button>
  );
};

type SidebarProps = {
  email?: string;
  conversations: ConversationSummary[];
  loading?: boolean;
  onNewChat: () => void;
};

export const Sidebar = ({ email, conversations, loading, onNewChat }: SidebarProps) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const today = new Date().toDateString();
  const todayChats: ChatHistoryItem[] = conversations
    .filter((chat) => new Date(chat.updatedAt).toDateString() === today)
    .map((chat, index) => ({ ...chat, active: index === 0 }));
  const previousChats = conversations.filter(
    (chat) => new Date(chat.updatedAt).toDateString() !== today,
  );
  const accountName = user?.name || email || "User";
  const initials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  const handleLogout = () => {
    setAccountMenuOpen(false);
    logout();
    navigate({ to: "/" });
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-[oklch(0.15_0.012_265)] flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
            nutriX Restro
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
            aria-label="Search chats"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
            aria-label="New chat"
          >
            <SquarePen size={18} />
          </button>
        </div>
      </div>

      {/* Chat History */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4 chat-scrollbar">
        {/* Today */}
        <div>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Today
          </div>
          <div className="space-y-0.5">
            {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading conversations...</p>}
            {!loading && todayChats.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet</p>
            )}
            {todayChats.map((chat) => (
              <ChatItem key={chat.id} chat={chat} />
            ))}
          </div>
        </div>

        {/* Previous 7 Days */}
        <div>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Previous 7 Days
          </div>
          <div className="space-y-0.5">
            {previousChats.map((chat) => (
              <ChatItem key={chat.id} chat={chat} />
            ))}
          </div>
        </div>
      </nav>

      {/* User Profile */}
      <div className="relative border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-lg p-2.5 hover:bg-accent/30 transition-all">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={accountName}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-[11px] font-bold text-primary-foreground">
              {initials}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={email}>
            {email || "Not signed in"}
          </span>
          <button
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
            aria-label="Open account menu"
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
          >
            <EllipsisVertical className="h-4 w-4" />
          </button>
        </div>

        {accountMenuOpen && (
          <div
            role="menu"
            className="absolute bottom-16 right-3 left-3 z-50 rounded-lg border border-border bg-popover p-1 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
