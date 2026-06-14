import { useState } from "react";
import { Hash, MessagesSquare, Search, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import {
  getConversation,
  listDmContacts,
  listMessages,
  listTeams,
  postMessage,
  sendDirectMessage,
} from "../lib/api";
import { ChatThread, type ThreadMessage } from "../components/ChatThread";
import { Avatar, Loading, PageHeader } from "../components/ui";

type Selection =
  | { kind: "team"; id: string; name: string }
  | { kind: "dm"; id: string; name: string }
  | null;

export default function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Selection>(null);
  const [search, setSearch] = useState("");

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["dm-contacts"],
    queryFn: listDmContacts,
    refetchInterval: 15000,
  });

  const filteredTeams = teams.filter((tm) =>
    tm.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredContacts = contacts.filter((c) =>
    c.user.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  if (teamsLoading) return <Loading />;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title={t("messages.title")}
        subtitle={t("messages.subtitle")}
      />

      <div className="card flex min-h-0 flex-1 overflow-hidden">
        {/* Conversation list */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-slate-100 lg:flex lg:w-80 ${
            selected ? "hidden" : "flex"
          }`}
        >
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-9"
                placeholder={t("common.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <SectionLabel
              icon={<Hash size={13} />}
              label={t("messages.teamChannels")}
            />
            {filteredTeams.length === 0 ? (
              <Empty>{t("messages.noTeams")}</Empty>
            ) : (
              filteredTeams.map((tm) => (
                <button
                  key={tm.id}
                  onClick={() =>
                    setSelected({ kind: "team", id: tm.id, name: tm.name })
                  }
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${
                    selected?.kind === "team" && selected.id === tm.id
                      ? "bg-brand-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <Users size={16} />
                  </div>
                  <span className="truncate text-sm font-medium text-slate-800">
                    {tm.name}
                  </span>
                </button>
              ))
            )}

            <div className="mt-3">
              <SectionLabel
                icon={<MessagesSquare size={13} />}
                label={t("messages.directMessages")}
              />
              {filteredContacts.length === 0 ? (
                <Empty>{t("messages.noPeople")}</Empty>
              ) : (
                filteredContacts.map((c) => {
                  const active =
                    selected?.kind === "dm" && selected.id === c.user.id;
                  return (
                    <button
                      key={c.user.id}
                      onClick={() =>
                        setSelected({
                          kind: "dm",
                          id: c.user.id,
                          name: c.user.full_name,
                        })
                      }
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${
                        active ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <Avatar name={c.user.full_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">
                            {c.user.full_name}
                          </span>
                          {c.last_message_at && (
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {formatDistanceToNow(new Date(c.last_message_at), {
                                addSuffix: false,
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-400">
                            {c.last_message
                              ? `${c.last_from_me ? "You: " : ""}${c.last_message}`
                              : t(`roles.${c.user.role}`)}
                          </span>
                          {c.unread_count > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Active conversation */}
        <div
          className={`min-w-0 flex-1 flex-col ${
            selected ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
              <MessagesSquare size={36} />
              <p className="mt-3 text-sm">{t("messages.selectPrompt")}</p>
            </div>
          ) : selected.kind === "team" ? (
            <TeamConversation
              key={selected.id}
              teamId={selected.id}
              teamName={selected.name}
              currentUserId={user!.id}
              onBack={() => setSelected(null)}
            />
          ) : (
            <DirectConversation
              key={selected.id}
              userId={selected.id}
              name={selected.name}
              currentUserId={user!.id}
              onBack={() => setSelected(null)}
              onRead={() => {
                qc.invalidateQueries({ queryKey: ["dm-contacts"] });
                qc.invalidateQueries({ queryKey: ["dm-unread"] });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TeamConversation({
  teamId,
  teamName,
  currentUserId,
  onBack,
}: {
  teamId: string;
  teamName: string;
  currentUserId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", teamId],
    queryFn: () => listMessages(teamId),
    refetchInterval: 5000,
  });
  const sendMut = useMutation({
    mutationFn: (body: string) => postMessage(teamId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", teamId] }),
  });

  const thread: ThreadMessage[] = messages.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    senderId: m.sender.id,
    senderName: m.sender.full_name,
  }));

  return (
    <ChatThread
      title={teamName}
      subtitle={t("messages.teamChannelSub")}
      messages={thread}
      currentUserId={currentUserId}
      loading={isLoading}
      sending={sendMut.isPending}
      onSend={(b) => sendMut.mutate(b)}
      showSender
      emptyText={t("messages.teamEmpty")}
      onBack={onBack}
    />
  );
}

function DirectConversation({
  userId,
  name,
  currentUserId,
  onBack,
  onRead,
}: {
  userId: string;
  name: string;
  currentUserId: string;
  onBack: () => void;
  onRead: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["dm", userId],
    queryFn: async () => {
      const res = await getConversation(userId);
      onRead(); // opening marks messages read server-side
      return res;
    },
    refetchInterval: 5000,
  });
  const sendMut = useMutation({
    mutationFn: (body: string) => sendDirectMessage(userId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm", userId] });
      qc.invalidateQueries({ queryKey: ["dm-contacts"] });
    },
  });

  const thread: ThreadMessage[] = messages.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    senderId: m.sender_id,
    senderName: m.sender_id === currentUserId ? "You" : name,
  }));

  return (
    <ChatThread
      title={name}
      subtitle={t("messages.directSub")}
      messages={thread}
      currentUserId={currentUserId}
      loading={isLoading}
      sending={sendMut.isPending}
      onSend={(b) => sendMut.mutate(b)}
      emptyText={t("messages.directEmpty", { name })}
      onBack={onBack}
    />
  );
}

function SectionLabel({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {icon}
      {label}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-2 text-xs text-slate-400">{children}</p>;
}
