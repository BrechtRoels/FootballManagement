import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { Avatar, Spinner } from "./ui";

export interface ThreadMessage {
  id: string;
  body: string;
  created_at: string;
  senderId: string;
  senderName: string;
}

interface Props {
  title: string;
  subtitle?: string;
  messages: ThreadMessage[];
  currentUserId: string;
  loading: boolean;
  sending: boolean;
  onSend: (body: string) => void;
  /** Show the sender's name + avatar (useful in group/team chat). */
  showSender?: boolean;
  emptyText?: string;
  onBack?: () => void;
}

export function ChatThread({
  title,
  subtitle,
  messages,
  currentUserId,
  loading,
  sending,
  onSend,
  showSender = false,
  emptyText = "No messages yet.",
  onBack,
}: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (text) {
      onSend(text);
      setBody("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
            {emptyText}
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.senderId === currentUserId;
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              !isSameDay(new Date(prev.created_at), new Date(m.created_at));
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 text-center text-xs font-medium text-slate-400">
                    {format(new Date(m.created_at), "EEEE d MMMM")}
                  </div>
                )}
                <div
                  className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
                >
                  {!mine && showSender && (
                    <Avatar name={m.senderName} size={30} />
                  )}
                  <div className="max-w-[75%]">
                    {!mine && showSender && (
                      <p className="mb-0.5 ml-1 text-xs font-medium text-slate-500">
                        {m.senderName}
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm ${
                        mine
                          ? "rounded-br-sm bg-brand-600 text-white"
                          : "rounded-bl-sm bg-slate-100 text-slate-800"
                      }`}
                    >
                      {m.body}
                    </div>
                    <p
                      className={`mt-0.5 text-[10px] text-slate-400 ${
                        mine ? "text-right" : "ml-1"
                      }`}
                    >
                      {format(new Date(m.created_at), "HH:mm")}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-slate-100 p-3"
      >
        <input
          className="input flex-1"
          placeholder={t("messages.typeMessage")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={!body.trim() || sending}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
