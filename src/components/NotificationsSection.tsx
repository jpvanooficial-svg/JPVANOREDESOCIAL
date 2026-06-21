import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { AppNotification, UserProfile } from "../types";
import { playNotificationSound } from "../lib/audio";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  Bell,
  Heart,
  MessageSquare,
  UserPlus,
  Mail,
  Trash2,
  Check,
  Volume2,
  VolumeX,
  Volume1,
  CheckCheck,
} from "lucide-react";

interface NotificationsSectionProps {
  currentUserProfile: UserProfile;
  onPostSelect?: (postId: string) => void;
  onChatSelect?: (activeUserId: string) => void;
}

export default function NotificationsSection({
  currentUserProfile,
  onPostSelect,
  onChatSelect,
}: NotificationsSectionProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("jpvano_sound_enabled") !== "false";
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    return parseFloat(localStorage.getItem("jpvano_sound_volume") || "0.5");
  });

  // Track if we have already played sound for loaded notification, to prevent audio replay on refresh
  const loadedNotificationsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", currentUserProfile.id)
    );

    // Snapshot database watcher
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AppNotification[] = [];
      let hasNewUnread = false;
      let lastIncomingType: any = null;

      snapshot.forEach((d) => {
        const notif = { id: d.id, ...d.data() } as AppNotification;
        list.push(notif);

        // Check if there is an unread notification we haven't seen in this session yet
        if (!notif.read && !loadedNotificationsRef.current[notif.id]) {
          hasNewUnread = true;
          lastIncomingType = notif.type;
        }

        // Lock it as seen so we don't replay chime on database re-read
        loadedNotificationsRef.current[notif.id] = true;
      });

      // Sort by absolute dates decreasing
      list.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      setNotifications(list);

      // Play custom node chimes inside sound queue
      if (hasNewUnread && lastIncomingType) {
        playNotificationSound(lastIncomingType);
      }
    });

    return () => unsubscribe();
  }, [currentUserProfile.id]);

  // Sync settings values to localStorage
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("jpvano_sound_enabled", String(next));
    if (next) playNotificationSound("test");
  };

  const handleChangeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setSoundVolume(vol);
    localStorage.setItem("jpvano_sound_volume", String(vol));
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error(error);
    }
  };

  const markSingleAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), { read: true });
    } catch (error) {
      console.error(error);
    }
  };

  // Clear specific notification
  const deleteNotification = async (notifId: string) => {
    try {
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (error) {
      console.error(error);
    }
  };

  // Delete all notifications
  const clearAllNotifications = async () => {
    if (notifications.length === 0) return;
    try {
      const q = query(
        collection(db, "notifications"),
        where("recipientId", "==", currentUserProfile.id)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    } catch (error) {
      console.error(error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart className="h-4.5 w-4.5 text-rose-500 fill-rose-500" />;
      case "comment":
        return <MessageSquare className="h-4.5 w-4.5 text-purple-400 fill-purple-400/20" />;
      case "follow":
        return <UserPlus className="h-4.5 w-4.5 text-blue-400" />;
      case "message":
        return <Mail className="h-4.5 w-4.5 text-amber-400" />;
      default:
        return <Bell className="h-4.5 w-4.5 text-zinc-400" />;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 font-sans animate-fade-in text-zinc-100">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
        
        {/* TITLE & SOUND OPTIONS */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-purple-600/10 rounded-xl text-purple-400">
              <Bell className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Notificações</h1>
              <p className="text-xs text-zinc-400">Notificações em tempo real com sons customizados</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 w-full sm:w-auto">
            <button
              id="sound-config-mute-btn"
              onClick={handleToggleSound}
              className={`p-2 rounded-lg transition-all cursor-pointer ${
                soundEnabled
                  ? "bg-purple-600/10 text-purple-400 hover:bg-purple-600/20"
                  : "bg-zinc-800 text-zinc-500 hover:text-white"
              }`}
              title={soundEnabled ? "Mutar Sons" : "Ativar Sons"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {soundEnabled && (
              <div className="flex items-center gap-2">
                <Volume1 className="h-3.5 w-3.5 text-zinc-400" />
                <input
                  id="sound-volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={soundVolume}
                  onChange={handleChangeVolume}
                  className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  title="Volume"
                />
              </div>
            )}
          </div>
        </div>

        {/* CONTROLS BAR */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-400 font-semibold font-display">
            {notifications.length}{" "}
            {notifications.length === 1 ? "notificação encontrada" : "notificações encontradas"}
          </span>

          <div className="flex items-center gap-3">
            {notifications.some((n) => !n.read) && (
              <button
                id="notif-mark-all-read-btn"
                onClick={markAllAsRead}
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-all cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar lidas
              </button>
            )}

            {notifications.length > 0 && (
              <button
                id="notif-clear-all-btn"
                onClick={clearAllNotifications}
                className="text-zinc-500 hover:text-rose-400 font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar histórico
              </button>
            )}
          </div>
        </div>

        {/* FEED NOTIFICATIONS */}
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-16 bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl p-6">
              <Bell className="h-12 w-12 text-zinc-600 mx-auto mb-3 opacity-50" />
              <p className="text-zinc-500 text-sm">Sua caixa está limpa por enquanto.</p>
              <p className="text-[11px] text-zinc-600 mt-1">
                Interações, curtidas e novidades aparecerão com sinal sonoro em tempo real.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`flex gap-3.5 items-start p-3.5 rounded-2xl border transition-all duration-200 animate-fade-in relative group ${
                  notif.read
                    ? "bg-zinc-950/40 border-zinc-850/60"
                    : "bg-purple-650/10 border-purple-550/30 shadow-lg glow-logo"
                }`}
              >
                {/* Visual Unread Ring */}
                {!notif.read && (
                  <span className="absolute top-4 left-3 w-2 h-2 rounded-full brand-gradient-bg animate-ping"></span>
                )}

                <div className="relative shrink-0 select-none">
                  <img
                    src={notif.senderPhotoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80"}
                    alt={notif.senderUsername}
                    className="w-10 h-10 rounded-full object-cover border border-zinc-800 cursor-pointer hover:border-purple-500 transition-all"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 p-1 bg-zinc-900 border border-zinc-800 rounded-full">
                    {getIcon(notif.type)}
                  </span>
                </div>

                <div className="flex-1 space-y-1 min-w-0">
                  <p className="text-xs text-zinc-350 leading-relaxed font-sans">
                    <span className="font-extrabold text-white text-sm cursor-pointer hover:underline block mb-0.5">
                      @{notif.senderUsername}
                    </span>{" "}
                    {notif.text}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-2.5 mt-2">
                    <span className="text-[10px] text-zinc-550 font-medium">
                      {new Date(notif.createdAt).toLocaleDateString()} ás{" "}
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>

                    {/* Navigation shortcut triggers */}
                    {notif.type === "message" && onChatSelect && (
                      <button
                        id={`notif-go-chat-${notif.id}`}
                        onClick={() => onChatSelect(notif.senderId)}
                        className="text-[10px] text-amber-400 font-semibold hover:underline cursor-pointer"
                      >
                        Responder no Chat
                      </button>
                    )}

                    {notif.postId && (notif.type === "like" || notif.type === "comment") && onPostSelect && (
                      <button
                        id={`notif-go-post-${notif.id}`}
                        onClick={() => onPostSelect(notif.postId!)}
                        className="text-[10px] text-purple-400 font-semibold hover:underline cursor-pointer"
                      >
                        Visualizar Post
                      </button>
                    )}
                  </div>
                </div>

                {/* Individual controls */}
                <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-all justify-end shrink-0 select-none self-center">
                  {!notif.read && (
                    <button
                      id={`notif-mark-single-${notif.id}`}
                      onClick={() => markSingleAsRead(notif.id)}
                      className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/80 rounded-lg transition-all cursor-pointer"
                      title="Marcar como lida"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    id={`notif-delete-single-${notif.id}`}
                    onClick={() => deleteNotification(notif.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 rounded-lg transition-all cursor-pointer"
                    title="Excluir notificação"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
