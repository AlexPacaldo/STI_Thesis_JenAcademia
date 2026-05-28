import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import styles from "../assets/chatPanel.module.css";
import { API_BASE_URL } from "../utils/api.js";

const API = API_BASE_URL;

function profileSrc(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
}

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

function normalizeConversation(row, currentUserId) {
  const name = `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email || "Unknown";
  const lastMessage = String(row.last_message || "").trim();
  return {
    id: String(row.user_id),
    user_id: row.user_id,
    name,
    roleLabel: String(row.role || "").replace(/^\w/, (c) => c.toUpperCase()) || "Chat",
    status: row.status_label || (String(row.status || "").toLowerCase() === "active" ? "Active now" : row.status || ""),
    online: Boolean(row.online),
    accent: profileInitialColor(row.role),
    profileImageUrl: row.profile_image_url || row.profileImageUrl || null,
    lastMessage: lastMessage || "Start a conversation",
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
  const [search, setSearch] = useState("");
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
    const statusLabel = active ? "Active now" : "Not active";

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

    let source = new EventSource(`${API}/api/chats/stream/${currentUserId}`);

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
    if (!query) return conversations;
    return conversations.filter((chat) => {
      const haystack = `${chat.name} ${chat.roleLabel} ${chat.lastMessage}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, search]);

  const openConversation = async (chat) => {
    const chatId = String(chat.user_id);
    setActiveChatId(chatId);
    setOpenChats((current) => {
      const next = current.filter((item) => String(item.user_id) !== chatId);
      return [{ ...chat, minimized: false }, ...next].slice(0, 3);
    });
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
          <div>
            <h3>Chats</h3>
            <p>Messages and class updates</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close chats">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        <label className={styles.searchField}>
          <i className="bi bi-search" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
          />
        </label>

        <div className={styles.filterRow} aria-label="Chat filters">
          <button type="button" className={`${styles.filterChip} ${styles.filterChipActive}`}>All</button>
          <button type="button" className={styles.filterChip}>Unread</button>
          <button type="button" className={styles.filterChip}>Classes</button>
        </div>

        <div className={styles.chatList}>
          {loadingConversations ? (
            <div className={styles.emptyState}>Loading chats...</div>
          ) : filteredChats.length === 0 ? (
            <div className={styles.emptyState}>No chats yet.</div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`${styles.chatItem} ${String(chat.id) === String(activeChatId) ? styles.chatItemActive : ""}`}
                onClick={() => openConversation(chat)}
              >
                <div className={styles.avatarWrap}>
                  {chat.profileImageUrl ? (
                    <img
                      src={profileSrc(chat.profileImageUrl)}
                      alt={chat.name}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <div className={styles.avatar} style={{ background: chat.accent }}>
                      {getInitials(chat.name)}
                    </div>
                  )}
                  {chat.online && <span className={styles.onlineDot} />}
                </div>

                <div className={styles.chatMeta}>
                  <div className={styles.chatTopRow}>
                    <span className={styles.chatName}>{chat.name}</span>
                    <span className={styles.chatTime}>{chat.status}</span>
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
                  {chat.profileImageUrl ? (
                    <img
                      src={profileSrc(chat.profileImageUrl)}
                      alt={chat.name}
                      className={styles.avatarCompactImage}
                    />
                  ) : (
                    <div className={styles.avatarCompact} style={{ background: chat.accent }}>
                      {getInitials(chat.name)}
                    </div>
                  )}
                  <div className={styles.windowTitleText}>
                    <strong>{chat.name}</strong>
                    <span>{chat.online ? "Active now" : chat.status}</span>
                  </div>
                </button>

                <div className={styles.windowActions}>
                  <button type="button" onClick={() => toggleMinimized(chatId)} aria-label="Minimize chat">
                    <i className={`bi ${minimized ? "bi-chevron-up" : "bi-dash-lg"}`} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => closeConversation(chatId)} aria-label="Close chat">
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                </div>
              </header>

              {!minimized && (
                <>
                  <div className={styles.windowBody}>
                    {loadingMessagesByChat[chatId] ? (
                      <div className={styles.emptyState}>Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div className={styles.emptyState}>Say hello to start the thread.</div>
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
                                {chat.profileImageUrl ? (
                                  <img
                                    src={profileSrc(chat.profileImageUrl)}
                                    alt={chat.name}
                                    className={styles.messageAvatar}
                                  />
                                ) : (
                                  <div className={styles.messageAvatarFallback}>{getInitials(chat.name)}</div>
                                )}
                              </div>
                            )}
                            <div className={styles.messageBubble}>
                              <span>{message.text}</span>
                              <small>{showSeen ? "Seen" : message.time}</small>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <footer className={styles.windowFooter}>
                    <button type="button" className={styles.iconButton} aria-label="Add attachment">
                      <i className="bi bi-plus-lg" aria-hidden="true" />
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
                        placeholder={`Message ${chat.name.split(" ")[0]}`}
                      />
                    </label>
                    <button type="button" className={styles.sendButton} onClick={() => sendMessage(chatId)}>
                      <i className="bi bi-send-fill" aria-hidden="true" />
                    </button>
                  </footer>
                  <div className={styles.windowHint}>Messages are saved to the database.</div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
