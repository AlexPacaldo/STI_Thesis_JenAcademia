import { openSseStream } from "../utils/sseClient.js";
import axios from "axios";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "../assets/chatPanel.module.css";
import { API_BASE_URL } from "../utils/api.js";
import { AuthenticatedImage } from "../utils/authenticatedImage.jsx";

import { CHAT_PAGE_SIZE, mergeChatMessages } from "../utils/chatMessages.js";

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
  const [pagesByChat, setPagesByChat] = useState({});
  const [loadingOlderByChat, setLoadingOlderByChat] = useState({});
  const [messageErrors, setMessageErrors] = useState({});
  const [sendingByChat, setSendingByChat] = useState({});
  const bodyRefs = useRef({});
  const scrollState = useRef({});
  const pendingAnchors = useRef({});
  const requestVersions = useRef({});
  const requestsInFlight = useRef(new Set());
  const expandedChats = useRef([]);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => {
      setCompact(media.matches);
      if (media.matches) setOpenChats(current => current.slice(0, 1));
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => setViewport({ height: visual.height,
      bottom: Math.max(0, window.innerHeight - visual.height - visual.offsetTop) });
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    expandedChats.current = openChats.filter(chat => !chat.minimized).map(chat => String(chat.user_id));
  }, [openChats]);

  useLayoutEffect(() => {
    openChats.forEach(chat => {
      const id = String(chat.user_id);
      const body = bodyRefs.current[id];
      if (!body || chat.minimized) return;
      const anchor = pendingAnchors.current[id];
      const position = scrollState.current[id] || { bottom: true };
      if (anchor) {
        body.scrollTop = anchor.top + body.scrollHeight - anchor.height;
        delete pendingAnchors.current[id];
      } else if (position.bottom || position.force) body.scrollTop = body.scrollHeight;
      scrollState.current[id] = { bottom: body.scrollHeight - body.clientHeight - body.scrollTop < 48 };
    });
  }, [messagesByChat, openChats, loadingMessagesByChat, loadingOlderByChat]);


  const notifyChatUpdates = useCallback(() => {
    window.dispatchEvent(new Event("chatUpdated"));
  }, []);

  const applyReadReceipt = useCallback((receipt) => {
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
  }, []);

  const applyPresenceChange = useCallback((presence) => {
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
  }, []);

  const loadConversations = useCallback(async () => {
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
  }, [currentUserId]);

  const loadMessages = useCallback(async (chatId, before = null) => {
    if (!currentUserId || !chatId || requestsInFlight.current.has(chatId)) return;
    requestsInFlight.current.add(chatId);
    const version = (requestVersions.current[chatId] || 0) + 1;
    requestVersions.current[chatId] = version;
    const setLoading = before ? setLoadingOlderByChat : setLoadingMessagesByChat;
    setLoading(current => ({ ...current, [chatId]: true }));
    setMessageErrors(current => ({ ...current, [chatId]: "" }));
    try {
      const response = await axios.get(
        `${API}/api/chats/conversations/${currentUserId}/${chatId}/messages`,
        { params: { limit: CHAT_PAGE_SIZE, ...(before ? { before } : {}) } }
      );
      if (requestVersions.current[chatId] !== version) return;
      const next = (response.data.messages || []).map(row => normalizeMessage(row, currentUserId));
      const body = bodyRefs.current[chatId];
      if (before && body) pendingAnchors.current[chatId] = { height: body.scrollHeight, top: body.scrollTop };
      if (!before) scrollState.current[chatId] = { bottom: true, force: true };
      setMessagesByChat(current => ({ ...current, [chatId]: before
        ? mergeChatMessages(current[chatId] || [], next)
        : mergeChatMessages(next, (current[chatId] || []).filter(message => Number(message.id) > Number(next.at(-1)?.id || 0))) }));
      setPagesByChat(current => ({ ...current, [chatId]: {
        hasMore: Boolean(response.data.hasMore), nextBefore: response.data.nextBefore,
      } }));
      if (!before && expandedChats.current.includes(chatId) && document.visibilityState === "visible") {
        void axios.put(`${API}/api/chats/conversations/${currentUserId}/${chatId}/read`)
          .then(() => { void loadConversations(); notifyChatUpdates(); }).catch(console.error);
      }
    } catch (error) {
      if (requestVersions.current[chatId] !== version) return;
      setMessageErrors(current => ({ ...current, [chatId]: error.response?.data?.message || "Could not load messages. Please try again." }));
    } finally {
      if (requestVersions.current[chatId] === version) {
        requestsInFlight.current.delete(chatId);
        setLoading(current => ({ ...current, [chatId]: false }));
      }
    }
  }, [currentUserId, loadConversations, notifyChatUpdates]);

  useEffect(() => {
    if (!isOpen || !currentUserId) {
      return undefined;
    }

    loadConversations();
    return undefined;
  }, [isOpen, currentUserId, loadConversations]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let source = openSseStream(`${API}/api/chats/stream/${currentUserId}`, { reconnectMs: 5000,
      onOpen: () => expandedChats.current.forEach(chatId => { void loadMessages(chatId); }),
    });

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
          if (!current[chatId]) return current;
          return { ...current, [chatId]: mergeChatMessages(current[chatId], [incomingMessage]) };
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
                : (expandedChats.current.includes(chatId) && document.visibilityState === "visible")
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

        if (String(payload.sender_id) !== String(currentUserId) && (expandedChats.current.includes(chatId) && document.visibilityState === "visible")) {
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


    return () => {
      source?.close?.();
      source = null;
    };
  }, [currentUserId, loadMessages, applyReadReceipt, applyPresenceChange, notifyChatUpdates]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

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
    const keepIds = [chatId, ...openChats.map(item => String(item.user_id)).filter(id => id !== chatId)].slice(0, compact ? 1 : 3);
    setMessagesByChat(current => Object.fromEntries(keepIds.map(id => [id, current[id] || []])));
    Object.keys(requestVersions.current).filter(id => !keepIds.includes(id)).forEach(id => {
      requestVersions.current[id]++;
      requestsInFlight.current.delete(id);
    });
    setActiveChatId(chatId);
    setOpenChats((current) => {
      const next = current.filter((item) => String(item.user_id) !== chatId);
      return [{ ...chat, minimized: false }, ...next].slice(0, compact ? 1 : 3);
    });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      onClose();
    }
    scrollState.current[chatId] = { bottom: true, force: true };
    await loadMessages(chatId);
  };

  const closeConversation = (chatId) => {
    requestVersions.current[chatId] = (requestVersions.current[chatId] || 0) + 1;
    requestsInFlight.current.delete(chatId);
    delete scrollState.current[chatId];
    delete pendingAnchors.current[chatId];
    setMessagesByChat(current => { const next = { ...current }; delete next[chatId]; return next; });
    setOpenChats((current) => current.filter((chat) => String(chat.user_id) !== String(chatId)));
    setDrafts((current) => {
      const next = { ...current };
      delete next[chatId];
      return next;
    });
    setActiveChatId((current) => (String(current) === String(chatId) ? null : current));
  };

  const toggleMinimized = (chatId) => {
    const restoring = openChats.find(chat => String(chat.user_id) === chatId)?.minimized;
    setOpenChats(current => current.map(chat => String(chat.user_id) === chatId
      ? { ...chat, minimized: !chat.minimized } : chat));
    if (restoring) {
      scrollState.current[chatId] = { bottom: true, force: true };
      setActiveChatId(chatId);
      void loadMessages(chatId);
    }
  };

  const sendMessage = async (chatId) => {
    const message = String(drafts[chatId] || "").trim();
    if (!message || !currentUserId || sendingByChat[chatId]) return;

    const recipientId = Number(chatId);
    setSendingByChat(current => ({ ...current, [chatId]: true }));
    try {
      const response = await axios.post(`${API}/api/chats/messages`, {
        sender_id: currentUserId,
        recipient_id: recipientId,
        content: message,
      });
      if (response.data?.message?.message_id) {
        const sent = normalizeMessage(response.data.message, currentUserId);
        scrollState.current[chatId] = { bottom: true, force: true };
        setMessagesByChat(current => ({ ...current, [chatId]: mergeChatMessages(current[chatId] || [], [sent]) }));
      }
      setDrafts((current) => ({ ...current, [chatId]: current[chatId] === message ? "" : current[chatId] }));
      await loadConversations();
      notifyChatUpdates();
    } catch (err) {
      setMessageErrors(current => ({ ...current, [chatId]: err.response?.data?.message || "Message was not sent. Your draft is still here." }));
    } finally {
      setSendingByChat(current => ({ ...current, [chatId]: false }));
    }
  };

  const visibleChats = compact ? openChats.slice(0, 1) : openChats;
  const seenMessageIdsByChat = useMemo(() => {
    return Object.entries(messagesByChat).reduce((acc, [chatId, messages]) => {
      const lastSeen = [...messages].reverse().find((message) => message.sender === "me" && message.read_at);
      acc[chatId] = lastSeen ? lastSeen.id : null;
      return acc;
    }, {});
  }, [messagesByChat]);

  return (
    <>
      <aside className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`} aria-hidden={!isOpen} inert={!isOpen}>
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
                data-chat-contact={chat.id}
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

      <div className={`${styles.dock} ${isOpen ? styles.dockWithDrawer : ""}`} aria-label="Open chats"
        style={viewport ? { bottom: viewport.bottom, "--chat-viewport-height": `${viewport.height}px` } : undefined}>
        {visibleChats.map((chat) => {
          const chatId = String(chat.user_id);
          const messages = messagesByChat[chatId] || [];
          const minimized = Boolean(chat.minimized);

          return (
            <section key={chatId} aria-label={`Chat with ${chat.name}`} className={`${styles.window} ${minimized ? styles.windowMinimized : ""}`}>
              <header className={styles.windowHeader}>
                <button
                  type="button"
                  className={styles.windowTitle}
                  aria-label={`${minimized ? "Restore chat with" : "Conversation with"} ${chat.name}`}
                  onClick={() => { if (minimized) toggleMinimized(chatId); else setActiveChatId(chatId); }}
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
                  <div className={styles.windowBody} data-chat-thread={chatId}
                    ref={node => { if (node) bodyRefs.current[chatId] = node; else delete bodyRefs.current[chatId]; }}
                    onScroll={event => {
                      const body = event.currentTarget;
                      scrollState.current[chatId] = { bottom: body.scrollHeight - body.clientHeight - body.scrollTop < 48 };
                    }}>
                    {pagesByChat[chatId]?.hasMore && <button type="button" className={styles.historyButton}
                      disabled={loadingOlderByChat[chatId] || loadingMessagesByChat[chatId]}
                      onClick={() => loadMessages(chatId, pagesByChat[chatId].nextBefore)}>
                      {loadingOlderByChat[chatId] ? "Loading older messages?" : "Load older messages"}
                    </button>}
                    {messageErrors[chatId] && <div role="alert" className={styles.threadError}>
                      {messageErrors[chatId]} <button type="button" onClick={() => loadMessages(chatId,
                        messages.length ? pagesByChat[chatId]?.nextBefore : null)}>Retry</button>
                    </div>}
                    {loadingMessagesByChat[chatId] && !messages.length ? (
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
                            data-message-id={message.id}
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
                        aria-label={`Message ${chat.name}`}
                        maxLength={10000}
                        placeholder={`Say hi to ${chat.name.split(" ")[0]}…`}
                      />
                    </label>
                    <button type="button" className={styles.sendButton} disabled={sendingByChat[chatId] || !drafts[chatId]?.trim()}
                      onClick={() => sendMessage(chatId)}>
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
