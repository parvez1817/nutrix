import { useState } from "react";
import { MessageSquare, SquarePen, Search, EllipsisVertical } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type ChatHistoryItem = {
  id: string;
  title: string;
  active?: boolean;
};

const todayChats: ChatHistoryItem[] = [
  { id: "1", title: "Nutrition Analysis Report", active: true },
  { id: "2", title: "Calorie Tracking Breakdown" },
  { id: "3", title: "Protein-Rich Meal Suggestions" },
];

const previousChats: ChatHistoryItem[] = [
  { id: "4", title: "Weekly Meal Prep Ideas" },
  { id: "5", title: "Macronutrient Ratios Guide" },
  { id: "6", title: "Budget-Friendly Recipes" },
  { id: "7", title: "Vitamin Deficiency Check" },
  { id: "8", title: "Hydration Tracking Tips" },
  { id: "9", title: "Post-Workout Recovery Foods" },
  { id: "10", title: "Seasonal Produce Guide" },
  { id: "11", title: "Food Allergy Alternatives" },
  { id: "12", title: "Mediterranean Diet Overview" },
];

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

export const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-[oklch(0.15_0.012_265)] flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
            Vizly Studio
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
      <div className="p-3 border-t border-border">
        <button
          type="button"
          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/30 transition-all"
        >
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0">
            PA
          </div>
          <span className="text-sm font-medium text-foreground truncate">Parvez Ahamed</span>
        </button>
      </div>
    </aside>
  );
};
