import { useState, useRef, useEffect } from "react";
import { Plus, ArrowUp } from "lucide-react";

type PromptBarProps = {
  onSend?: (message: string) => void;
};

export const PromptBar = ({ onSend }: PromptBarProps) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 w-full flex justify-center">
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl bg-accent/40 border border-border p-2 flex items-end gap-2 shadow-lg shadow-black/20">
          {/* Attach button */}
          <button
            type="button"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all shrink-0 mb-0.5"
            aria-label="Attach file"
          >
            <Plus size={20} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            rows={1}
            className="flex-1 bg-transparent border-none resize-none text-sm text-foreground placeholder:text-muted-foreground py-2 px-1 outline-none max-h-[200px] leading-relaxed"
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="p-2 rounded-lg bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all shrink-0 mb-0.5"
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-2 opacity-60">
          Vizly Studio may produce inaccurate information. Verify important results.
        </p>
      </div>
    </div>
  );
};
