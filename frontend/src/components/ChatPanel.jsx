import { openSseStream } from "../utils/sseClient.js";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import styles from "../assets/chatPanel.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";

const API = API_BASE_URL;


const formatClock = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function getInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function profileInitialColor(role) {
  const palette = {
    student: "#5f7fb4",
    teacher: "#4f7f68",
    admin: "#8f6bb8",
  };
  return palette[String(role || "").toLowerCase()] || "#6d8db2";
}

function friendlyStatus(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();

  if (!lower) return "";
  if (
    lower.includes("not active") ||
    lower.includes("inactive") ||
    lower.includes("offline") ||
    lower.includes("away")
  ) {
    return "Away";
  }
  if (lower.includes("active") || lower.includes("online")) {
    return "Here now";
  }
  return text;
}

function normalizeConversation(row, currentUserId) {
  const name = `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email || "Unknown";
  const lastMessage = String(row.last_message || "").trim();
  const online = Boolean(row.online);
  const status =
    friendlyStatus(row.status_label || row.status || "") ||
    (online ? "Here now" : "Away");

  return {
    id: String(row.user_id),
    user_id: row.user_id,
    name,
    roleLabel: String(row.role || "").replace(/^\w/, (c) => c.toUpperCase()) || "Chat",
    status,
    online,
    accent: profileInitialColor(row.role),
    profileImageUrl: row.profile_image_url || row.profileImageUrl || null,
    lastMessage: lastMessage || "Say hello!",
    unread: Number(row.unread_count || 0),
    lastMessageAt: row.last_message_at || null,
    currentUserId,
  };
}

function normalizeMessage(row, currentUserId) {
  return {
    id: row.message_id,
    sender: Number(row.sender_id) === Number(currentUserId) ? "me" : "them",
    text: row.content || "",
    time: formatClock(row.sent_at),
    sent_at: row.sent_at,
    read_at: row.read_at || null,
    is_read: Boolean(row.is_read),
  };
}

export default function ChatPanel({ user, userId, isOpen, onClose }) {
  const currentUserId = userId || user?.id || user?.user_id || user?.userId || null;
  const currentRole = String(user?.role || "").toLowerCase();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [openChats, setOpenChats] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [messagesByChat, setMessagesByChat] = useState({});
  const [loadingMessagesByChat, setLoadingMessagesByChat] = useState({});

  const notifyChatUpdates = () => {
    window.dispatchEvent(new Event("chatUpdated"));
  };

  const applyReadReceipt = (receipt) => {
    const chatId = String(receipt?.reader_id || "");
    if (!chatId) return;

    setMessagesByChat((current) => {
      const messages = current[chatId];
      if (!messages || !messages.length) return current;

      const cutoffId = Number(receipt.last_read_message_id || 0);
      return {
        ...current,
        [chatId]: messages.map((message) => {
          if (message.sender !== "me") return message;
          if (cutoffId && Number(message.id) > cutoffId) return message;
          return {
            ...message,
            is_read: true,
            read_at: receipt.read_at || message.read_at || new Date().toISOString(),
          };
        }),
      };
    });
  };

  const applyPresenceChange = (presence) => {
    const chatId = String(presence?.user_id || "");
    if (!chatId) return;

    const active = Boolean(presence.active);
    const statusLabel = active ? "Here now" : "Away";

    const updateConversation = (chat) =>
      String(chat.user_id) === chatId
        ? {
            ...chat,
            online: active,
            status: statusLabel,
          }
        : chat;

    setConversations((current) => current.map(updateConversation));
    setOpenChats((current) => current.map(updateConversation));
  };

  const loadConversations = async () => {
    if (!currentUserId) {
      setConversations([]);
      return;
    }

    setLoadingConversations(true);
    try {
      const response = await axios.get(`${API}/api/chats/conversations/${currentUserId}`);
      const next = (response.data.conversations || []).map((row) => normalizeConversation(row, currentUserId));
      setConversations(next);
    } catch (err) {
      console.error("Error loading conversations:", err);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (chatId) => {
    if (!currentUserId || !chatId) return;

    setLoadingMessagesByChat((current) => ({ ...current, [chatId]: true }));
    try {
      const response = await axios.get(
        `${API}/api/chats/conversations/${currentUserId}/${chatId}/messages`
      );
      const nextMessages = (response.data.messages || []).map((row) => normalizeMessage(row, currentUserId));
      setMessagesByChat((current) => ({ ...current, [chatId]: nextMessages }));
      await axios.put(`${API}/api/chats/conversations/${currentUserId}/${chatId}/read`);
      await loadConversations();
    } catch (err) {
      console.error("Error loading chat thread:", err);
      setMessagesByChat((current) => ({ ...current, [chatId]: [] }));
    } finally {
      setLoadingMessagesByChat((current) => ({ ...current, [chatId]: false }));
    }
  };

  useEffect(() => {
    if (!isOpen || !currentUserId) {
      return undefined;
    }

    loadConversations();
    return undefined;
  }, [isOpen, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let source = openSseStream(`${API}/api/chats/stream/${currentUserId}`);

    const handleChatMessage = async (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload?.message_id) return;

        const chatId = String(
          Number(payload.sender_id) === Number(currentUserId)
            ? payload.recipient_id
            : payload.sender_id
        );

        const incomingMessage = normalizeMessage(payload, currentUserId);

        setMessagesByChat((current) => {
          const existing = current[chatId] || [];
          if (existing.some((message) => String(message.id) === String(incomingMessage.id))) {
            return current;
          }
          return {
            ...current,
            [chatId]: [...existing, incomingMessage],
          };
        });

        setConversations((current) => {
          const existingIndex = current.findIndex((chat) => String(chat.user_id) === chatId);
          const counterpartName =
            Number(payload.sender_id) === Number(currentUserId)
              ? payload.recipient_name
              : payload.sender_name;

          const baseConversation = existingIndex >= 0 ? current[existingIndex] : null;
          const nextConversation = {
            id: chatId,
            user_id: Number(chatId),
            name: counterpartName || baseConversation?.name || "New chat",
            roleLabel: baseConversation?.roleLabel || "Chat",
            status: baseConversation?.status || "Active now",
            online: true,
            accent: baseConversation?.accent || "#6d8db2",
            profileImageUrl:
              Number(payload.sender_id) === Number(currentUserId)
                ? payload.recipient_profile_image_url || baseConversation?.profileImageUrl || null
                : payload.sender_profile_image_url || baseConversation?.profileImageUrl || null,
            lastMessage: payload.content || "",
            unread:
              Number(payload.sender_id) === Number(currentUserId)
                ? 0
                : String(activeChatId) === chatId
                  ? 0
                  : (Number(baseConversation?.unread || 0) + 1),
            lastMessageAt: payload.sent_at || new Date().toISOString(),
            currentUserId,
          };

          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = { ...next[existingIndex], ...nextConversation };
            return next.sort((a, b) => {
              const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return bTime - aTime;
            });
          }

          return [nextConversation, ...current];
        });

        if (String(payload.sender_id) !== String(currentUserId) && String(activeChatId) === chatId) {
          await axios.put(`${API}/api/chats/conversations/${currentUserId}/${chatId}/read`);
          setConversations((current) =>
            current.map((chat) =>
              String(chat.user_id) === chatId ? { ...chat, unread: 0 } : chat
            )
          );
        }

        notifyChatUpdates();
      } catch (err) {
        console.error("Error handling live chat event:", err);
      }
    };

    const handleReadReceipt = (event) => {
      try {
        const receipt = JSON.parse(event.data || "{}");
        if (!receipt?.reader_id) return;
        if (String(receipt.sender_id) !== String(currentUserId)) return;
        applyReadReceipt(receipt);
        notifyChatUpdates();
      } catch (err) {
        console.error("Error handling chat read receipt:", err);
      }
    };

    const handlePresenceChange = (event) => {
      try {
        const presence = JSON.parse(event.data || "{}");
        if (!presence?.user_id) return;
        applyPresenceChange(presence);
        notifyChatUpdates();
      } catch (err) {
        console.error("Error handling chat presence change:", err);
      }
    };

    source.addEventListener("chat-message", handleChatMessage);
    source.addEventListener("chat-read-receipt", handleReadReceipt);
    source.addEventListener("chat-presence-change", handlePresenceChange);
    source.addEventListener("error", () => {
      source?.close?.();
    });

    return () => {
      source?.close?.();
      source = null;
    };
  }, [currentUserId, activeChatId]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!activeChatId) return;
    const loaded = messagesByChat[activeChatId];
    if (!loaded) {
      loadMessages(activeChatId);
    }
  }, [activeChatId]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((chat) => {
      if (filter === "unread" && !(chat.unread > 0)) return false;
      if (filter === "teachers" && chat.roleLabel.toLowerCase() !== "teacher") return false;

      if (!query) return true;
      const haystack = `${chat.name} ${chat.roleLabel} ${chat.lastMessage}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, search, filter]);

  const unreadCount = useMemo(
    () => conversations.reduce((total, chat) => total + chat.unread, 0),
    [conversations]
  );

  const drawerSubtitle =
    currentRole === "teacher"
      ? "Talk to your students and team."
      : currentRole === "admin"
        ? "Talk to your school community."
        : "Talk to your teacher and friends.";

  const hasSearch = Boolean(search.trim());
  const emptyTitle = hasSearch
    ? "No one found"
    : filter === "unread"
      ? "No new chats"
      : filter === "teachers"
        ? "No teachers yet"
        : "No chats yet";
  const emptyText = hasSearch
    ? "Try another name."
    : filter === "unread"
      ? "You're all caught up! 🎉"
      : filter === "teachers"
        ? "Your teacher chats will show up here."
        : "When someone says hello, they will show up here.";

  const openConversation = async (chat) => {
    const chatId = String(chat.user_id);
    setActiveChatId(chatId);
    setOpenChats((current) => {
      const next = current.filter((item) => String(item.user_id) !== chatId);
      return [{ ...chat, minimized: false }, ...next].slice(0, 3);
    });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      onClose();
    }
    await loadMessages(chatId);
  };

  const closeConversation = (chatId) => {
    setOpenChats((current) => current.filter((chat) => String(chat.user_id) !== String(chatId)));
    setDrafts((current) => {
      const next = { ...current };
      delete next[chatId];
      return next;
    });
    setActiveChatId((current) => (String(current) === String(chatId) ? null : current));
  };

  const toggleMinimized = (chatId) => {
    setOpenChats((current) =>
      current.map((chat) =>
        String(chat.user_id) === String(chatId) ? { ...chat, minimized: !chat.minimized } : chat
      )
    );
  };

  const sendMessage = async (chatId) => {
    const message = String(drafts[chatId] || "").trim();
    if (!message || !currentUserId) return;

    const recipientId = Number(chatId);
    try {
      await axios.post(`${API}/api/chats/messages`, {
        sender_id: currentUserId,
        recipient_id: recipientId,
        content: message,
      });
      setDrafts((current) => ({ ...current, [chatId]: "" }));
      await loadConversations();
      notifyChatUpdates();
    } catch (err) {
      console.error("Error sending chat message:", err);
    }
  };

  const visibleChats = openChats.filter((chat) => messagesByChat[String(chat.user_id)]);
  const seenMessageIdsByChat = useMemo(() => {
    return Object.entries(messagesByChat).reduce((acc, [chatId, messages]) => {
      const lastSeen = [...messages].reverse().find((message) => message.sender === "me" && message.read_at);
      acc[chatId] = lastSeen ? lastSeen.id : null;
      return acc;
    }, {});
  }, [messagesByChat]);

  return (
    <>
      <aside className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`} aria-hidden={!isOpen}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderMain}>
            <span className={styles.headerIcon} aria-hidden="true">💬</span>
            <div className={styles.headerText}>
              <div className={styles.headerTitleRow}>
                <h3>Chats</h3>
                {unreadCount > 0 && <span className={styles.unreadTotal}>{unreadCount} new</span>}
              </div>
              <p>{drawerSubtitle}</p>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close chats">
            ×
          </button>
        </div>

        <label className={styles.searchField}>
          <span className={styles.searchIcon} aria-hidden="true">🔎</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find someone"
            aria-label="Search chats"
          />
        </label>

        <div className={styles.filterRow} role="group" aria-label="Chat filters">
          <button
            type="button"
            className={`${styles.filterChip} ${filter === "all" ? styles.filterChipActive : ""}`}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`${styles.filterChip} ${filter === "unread" ? styles.filterChipActive : ""}`}
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            New
          </button>
          <button
            type="button"
            className={`${styles.filterChip} ${filter === "teachers" ? styles.filterChipActive : ""}`}
            aria-pressed={filter === "teachers"}
            onClick={() => setFilter("teachers")}
          >
            Teachers
          </button>
        </div>

        <div className={styles.chatList}>
          {loadingConversations ? (
            <div className={styles.skeletonList} role="status" aria-busy="true">
              <span className={styles.srOnly}>Loading chats…</span>
              {[0, 1, 2].map((index) => (
                <div className={styles.skeletonItem} key={index} aria-hidden="true">
                  <span className={styles.skeletonAvatar} />
                  <span className={styles.skeletonBody}>
                    <span className={styles.skeletonLine} />
                    <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                  </span>
                </div>
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">{hasSearch ? "🔎" : "💬"}</span>
              <strong className={styles.emptyTitle}>{emptyTitle}</strong>
              <span className={styles.emptyText}>{emptyText}</span>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`${styles.chatItem} ${String(chat.id) === String(activeChatId) ? styles.chatItemActive : ""} ${chat.unread > 0 ? styles.chatItemUnread : ""}`}
                onClick={() => openConversation(chat)}
              >
                <div className={styles.avatarWrap}>
                  <AuthenticatedImage
                    src={chat.profileImageUrl}
                    alt={chat.name}
                    className={styles.avatarImage}
                    fallback={
                      <div className={styles.avatar} style={{ background: chat.accent }}>
                        {getInitials(chat.name)}
                      </div>
                    }
                  />
                  {chat.online && <span className={styles.onlineDot} />}
                </div>

                <div className={styles.chatMeta}>
                  <div className={styles.chatTopRow}>
                    <span className={styles.chatName}>{chat.name}</span>
                    <span className={`${styles.statusPill} ${chat.online ? styles.statusPillOnline : ""}`}>
                      {chat.online ? "Here now" : chat.status || "Away"}
                    </span>
                  </div>
                  <div className={styles.chatBottomRow}>
                    <span className={styles.chatRole}>{chat.roleLabel}</span>
                    <span className={styles.chatPreview}>{chat.lastMessage}</span>
                  </div>
                </div>

                {chat.unread > 0 && <span className={styles.unreadBadge}>{chat.unread}</span>}
              </button>
            ))
          )}
        </div>
      </aside>

      <div className={`${styles.dock} ${isOpen ? styles.dockWithDrawer : ""}`} aria-label="Open chats">
        {visibleChats.map((chat) => {
          const chatId = String(chat.user_id);
          const messages = messagesByChat[chatId] || [];
          const minimized = Boolean(chat.minimized);

          return (
            <section key={chatId} className={`${styles.window} ${minimized ? styles.windowMinimized : ""}`}>
              <header className={styles.windowHeader}>
                <button
                  type="button"
                  className={styles.windowTitle}
                  onClick={() => setActiveChatId(chatId)}
                >
                  <AuthenticatedImage
                    src={chat.profileImageUrl}
                    alt={chat.name}
                    className={styles.avatarCompactImage}
                    fallback={
                      <div className={styles.avatarCompact} style={{ background: chat.accent }}>
                        {getInitials(chat.name)}
                      </div>
                    }
                  />
                  <div className={styles.windowTitleText}>
                    <strong>{chat.name}</strong>
                    <span className={styles.windowStatus}>
                      <span className={`${styles.statusDot} ${chat.online ? styles.statusDotOnline : ""}`} aria-hidden="true" />
                      {chat.online ? "Here now" : chat.status || "Away"}
                    </span>
                  </div>
                </button>

                <div className={styles.windowActions}>
                  <button
                    type="button"
                    className={styles.windowAction}
                    onClick={() => toggleMinimized(chatId)}
                    aria-label={minimized ? "Restore chat" : "Minimize chat"}
                  >
                    <span aria-hidden="true">{minimized ? "▲" : "–"}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.windowAction}
                    onClick={() => closeConversation(chatId)}
                    aria-label="Close chat"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </header>

              {!minimized && (
                <>
                  <div className={styles.windowBody}>
                    {loadingMessagesByChat[chatId] ? (
                      <div className={styles.windowEmpty}>
                        <span className={styles.windowEmptyIcon} aria-hidden="true">⏳</span>
                        <strong>Loading messages…</strong>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className={styles.windowEmpty}>
                        <span className={styles.windowEmptyIcon} aria-hidden="true">💬</span>
                        <strong>Say hello!</strong>
                        <span>Send the first message to start your chat.</span>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const showSeen =
                          message.sender === "me" &&
                          String(seenMessageIdsByChat[chatId] || "") === String(message.id);

                        return (
                          <div
                            key={message.id}
                            className={`${styles.messageRow} ${message.sender === "me" ? styles.messageRowMe : styles.messageRowThem}`}
                          >
                            {message.sender !== "me" && (
                              <div className={styles.messageAvatarWrap}>
                                <AuthenticatedImage
                                  src={chat.profileImageUrl}
                                  alt={chat.name}
                                  className={styles.messageAvatar}
                                  fallback={
                                    <div className={styles.messageAvatarFallback}>{getInitials(chat.name)}</div>
                                  }
                                />
                              </div>
                            )}
                            <div className={styles.messageBubble}>
                              <span>{message.text}</span>
                              <small>{showSeen ? "Seen ✓" : message.time}</small>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <footer className={styles.windowFooter}>
                    <button type="button" className={styles.iconButton} aria-label="Add attachment">
                      <span aria-hidden="true">＋</span>
                    </button>
                    <label className={styles.messageInputWrap}>
                      <input
                        type="text"
                        value={drafts[chatId] || ""}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [chatId]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            sendMessage(chatId);
                          }
                        }}
                        placeholder={`Say hi to ${chat.name.split(" ")[0]}…`}
                      />
                    </label>
                    <button type="button" className={styles.sendButton} onClick={() => sendMessage(chatId)}>
                      <span aria-hidden="true">➤</span>
                      Send
                    </button>
                  </footer>
                  <div className={styles.windowHint}>Your messages are saved safely.</div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
