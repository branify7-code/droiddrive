"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { AppHeader } from "../shell";

interface Msg {
  from: "me" | "them";
  text: string;
}

interface Thread {
  id: string;
  name: string;
  color: string;
  preview: string;
  messages: Msg[];
  reply: string;
}

const INITIAL: Thread[] = [
  {
    id: "ava",
    name: "Ava Chen",
    color: "from-rose-400 to-orange-400",
    preview: "Did you try the new cloud phone?",
    messages: [
      { from: "them", text: "Hey! Did you try the new cloud phone?" },
      { from: "me", text: "Yes - all my files live on Google Drive now, 5 TB of storage!" },
      { from: "them", text: "That is wild. Your phone storage is basically infinite." },
    ],
    reply: "Nice! Sync me a photo sometime.",
  },
  {
    id: "sam",
    name: "Sam Okafor",
    color: "from-emerald-400 to-teal-500",
    preview: "The upload speed is impressive",
    messages: [
      { from: "them", text: "The upload speed is impressive for a virtual device." },
    ],
    reply: "Right? Resumable uploads do the heavy lifting.",
  },
  {
    id: "cloud",
    name: "Cloud Storage Report",
    color: "from-amber-400 to-orange-500",
    preview: "Weekly storage summary available",
    messages: [
      { from: "them", text: "Your weekly storage summary is ready. Open Settings to see usage details." },
    ],
    reply: "You can review usage any time in Settings.",
  },
];

export default function MessagesApp() {
  const [threads, setThreads] = useState<Thread[]>(INITIAL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const openApp = usePhone((s) => s.openApp);

  const thread = threads.find((t) => t.id === openId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread?.messages.length, openId]);

  const send = () => {
    if (!draft.trim() || !thread) return;
    const text = draft.trim();
    setDraft("");
    setThreads((ts) =>
      ts.map((t) => (t.id === thread.id ? { ...t, messages: [...t.messages, { from: "me", text }], preview: text } : t))
    );
    setTimeout(() => {
      setThreads((ts) =>
        ts.map((t) =>
          t.id === thread.id ? { ...t, messages: [...t.messages, { from: "them", text: t.reply }], preview: t.reply } : t
        )
      );
    }, 1100);
  };

  if (thread) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader
          title={thread.name}
          onBack={() => setOpenId(null)}
          right={
            <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${thread.color} text-xs font-bold text-white`}>
              {thread.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
          }
        />
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 pb-2 phone-scroll">
          {thread.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-3xl px-3.5 py-2 text-[12.5px] leading-snug ${
                  m.from === "me"
                    ? "rounded-br-md bg-emerald-500 text-white"
                    : "rounded-bl-md bg-white/[0.1] text-white/90"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 pb-16 pt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Text message"
            className="flex-1 rounded-full bg-white/10 px-4 py-2.5 text-xs text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-emerald-400"
          />
          <button
            onClick={send}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 active:scale-90"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        title="Messages"
        subtitle="Simulation - no real SMS is sent or received"
        onBack={() => usePhone.getState().closeApp()}
      />
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-16 phone-scroll">
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpenId(t.id)}
            className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-3 text-left transition hover:bg-white/[0.07]"
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-xs font-bold text-white`}>
              {t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white/90">{t.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-white/45">{t.preview}</span>
            </span>
            <ChevronLeft className="h-4 w-4 rotate-180 text-white/25" />
          </button>
        ))}
      </div>
      <p className="pb-14 text-center text-[10px] text-white/25">
        Demo conversations - try uploading a file in Files
      </p>
      <button className="sr-only" onClick={() => openApp("files")}>open files</button>
    </div>
  );
}
