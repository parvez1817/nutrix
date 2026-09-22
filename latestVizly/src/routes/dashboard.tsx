import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuroraBackground } from "@/components/site/AuroraBackground";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PromptBar } from "@/components/dashboard/PromptBar";
import { ChatArea, type ChatMessage } from "@/components/dashboard/ChatArea";
import { loadNutrixPayload } from "@/lib/nutrix";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Chat — NutriX" },
      { name: "description", content: "Your AI-powered nutrition assistant." },
    ],
  }),
  component: DashboardPage,
});

let msgIdCounter = 0;

function DashboardPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const payload = loadNutrixPayload();
    if (!payload) return; // Wait for user to interact directly if no payload

    // Construct the initial user message based on the payload
    const itemsList = payload.menu.map(m => `${m.name} (₹${m.price})`).join(", ");
    const userText = `Optimization Request:\nBudget: ₹${payload.budget}\nProtein Target: ${payload.proteinTarget}g\nItems: ${itemsList}`;
    
    const userMsg: ChatMessage = {
      id: String(++msgIdCounter),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };
    
    // Construct the initial assistant message for status updates
    const assistantMsgId = String(++msgIdCounter);
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "Let me analyze this for you...",
      timestamp: new Date(),
    };
    
    setMessages([userMsg, initialAssistantMsg]);

    const runOptimization = async () => {
      try {
        const body = JSON.stringify({
          menu: payload.menu.map((m) => ({ name: m.name, price: m.price })),
          budget: payload.budget,
          protein_target: payload.proteinTarget,
          language: payload.language ?? "English",
        });

        const res = await fetch("/api/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (!res.ok || !res.body) {
           setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Error connecting to NutriX server. Please ensure the backend is running." } : m));
           return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalContent = "";
        let combinationsContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              try {
                const data = JSON.parse(dataStr);
                
                if (currentEvent === "status") {
                  const statusMsg = (data as { message: string }).message;
                  // Append status to the chat bubble temporarily
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgId 
                      ? { ...m, content: finalContent ? finalContent : (statusMsg + "\n" + combinationsContent) } 
                      : m
                  ));
                } else if (currentEvent === "combinations") {
                  const combos = (data as { combinations: any[], best: any }).combinations;
                  combinationsContent = combos.length > 0 ? "\n\nTop Combinations:\n" + combos.map(c => `• ${c.items.join(' + ')} (₹${c.total_cost}, ${c.total_protein}g)`).join('\n') : "";
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgId 
                      ? { ...m, content: (finalContent || "Finding best combinations...\n\n" + combinationsContent) } 
                      : m
                  ));
                } else if (currentEvent === "recommendation") {
                  finalContent = (data as { text: string }).text;
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgId 
                      ? { ...m, content: finalContent } 
                      : m
                  ));
                }
              } catch {
                /* ignore parse errors */
              }
            }
          }
        }
      } catch (err: unknown) {
         setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Error processing the optimization request." } : m));
      }
    };

    runOptimization();
  }, []);

  const handleSend = useCallback(async (text: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: String(++msgIdCounter),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    
    // Optimistically update UI and get reference to messages including new msg
    let updatedMessages: ChatMessage[] = [];
    setMessages((prev) => {
      updatedMessages = [...prev, userMsg];
      return updatedMessages;
    });

    const assistantMsgId = String(++msgIdCounter);
    
    // Add a placeholder loading message
    const loadingMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, loadingMsg]);

    try {
      const payload = loadNutrixPayload();
      const body = JSON.stringify({
        messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        context: payload ? {
          budget: payload.budget,
          protein_target: payload.proteinTarget,
          menu: payload.menu.map(m => m.name).join(", ")
        } : null
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) throw new Error("Network error");
      
      const data = await res.json();
      setMessages((prev) => 
        prev.map((m) => m.id === assistantMsgId ? { ...m, content: data.reply } : m)
      );
    } catch (e) {
      setMessages((prev) => 
        prev.map((m) => m.id === assistantMsgId ? { ...m, content: "Sorry, I ran into an error processing your message." } : m)
      );
    }
  }, []);

  return (
    <div className="relative min-h-screen text-foreground bg-background">
      <AuroraBackground />
      <Sidebar />

      <div className="ml-[260px] flex flex-col h-screen relative z-10">
        <ChatArea messages={messages} />
        <PromptBar onSend={handleSend} />
      </div>
    </div>
  );
}
