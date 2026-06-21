import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { AppNotification, UserProfile } from "../types";
import { playNotificationSound, playTone, AudioTone } from "../lib/audio";
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
  Sliders,
  Settings,
  Upload,
  Loader2,
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

  // Settings Dashboard States
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== "undefined" ? Notification.permission : "default";
  });

  const [toneLike, setToneLike] = useState(() => localStorage.getItem("jpvano_tone_like") || "bubble_pop");
  const [toneComment, setToneComment] = useState(() => localStorage.getItem("jpvano_tone_comment") || "harmonic_sweep");
  const [toneFollow, setToneFollow] = useState(() => localStorage.getItem("jpvano_tone_follow") || "arpeggio");
  const [toneMessage, setToneMessage] = useState(() => localStorage.getItem("jpvano_tone_message") || "bell_chime");
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  const [pushLike, setPushLike] = useState(() => localStorage.getItem("jpvano_push_like") !== "false");
  const [pushComment, setPushComment] = useState(() => localStorage.getItem("jpvano_push_comment") !== "false");
  const [pushFollow, setPushFollow] = useState(() => localStorage.getItem("jpvano_push_follow") !== "false");
  const [pushMessage, setPushMessage] = useState(() => localStorage.getItem("jpvano_push_message") !== "false");

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

      snapshot.forEach((d) => {
        const notif = { id: d.id, ...d.data() } as AppNotification;
        list.push(notif);

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
    }, (error) => {
      console.warn("Notifications onSnapshot query subscription error:", error);
    });

    return () => unsubscribe();
  }, [currentUserProfile.id]);

  // Request native OS notification permissions
  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      alert("Seu navegador não oferece suporte para notificações nativas de desktop.");
      return;
    }
    try {
      const status = await Notification.requestPermission();
      setPushPermission(status);
    } catch (err) {
      console.error("Erro de permissão push:", err);
    }
  };

  // Sound configuration helpers
  const handleToneChange = (category: "like" | "comment" | "follow" | "message", val: string) => {
    localStorage.setItem(`jpvano_tone_${category}`, val);
    if (category === "like") setToneLike(val);
    if (category === "comment") setToneComment(val);
    if (category === "follow") setToneFollow(val);
    if (category === "message") setToneMessage(val);

    // Live preview of custom synth tone
    playTone(val as any, soundVolume);
  };

  const uploadCustomTone = async (
    category: "like" | "comment" | "follow" | "message",
    file: File
  ) => {
    if (!file) return;
    setUploadingCategory(category);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileData: base64,
              originalMimeType: file.type,
              extension: file.name.split(".").pop(),
            })
          });
          const data = await res.json();
          if (data.url) {
            handleToneChange(category, data.url);
          } else {
            alert("Não foi possível processar o retorno do upload.");
          }
        } catch (e) {
          console.error(e);
          alert("Ocorreu um erro no processamento do arquivo de som.");
        } finally {
          setUploadingCategory(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploadingCategory(null);
    }
  };

  const handlePushToggle = (category: "like" | "comment" | "follow" | "message") => {
    if (category === "like") {
      const next = !pushLike;
      setPushLike(next);
      localStorage.setItem("jpvano_push_like", String(next));
    }
    if (category === "comment") {
      const next = !pushComment;
      setPushComment(next);
      localStorage.setItem("jpvano_push_comment", String(next));
    }
    if (category === "follow") {
      const next = !pushFollow;
      setPushFollow(next);
      localStorage.setItem("jpvano_push_follow", String(next));
    }
    if (category === "message") {
      const next = !pushMessage;
      setPushMessage(next);
      localStorage.setItem("jpvano_push_message", String(next));
    }
  };

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
        <div className="flex flex-col border-b border-zinc-800 pb-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-purple-600/10 rounded-xl text-purple-400">
                <Bell className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-white font-display">Notificações</h1>
                <p className="text-xs text-zinc-400">Sons e push customizados para likes, comentários, DMs e seguidores</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800 w-full sm:w-auto">
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
                <div className="flex items-center gap-1.5 pr-2">
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

              {/* TOGGLING EXPANDABLE SETTINGS PANEL BUTTON */}
              <button
                id="toggle-pref-dashboard-btn"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                  settingsOpen
                    ? "bg-purple-500 text-white font-bold"
                    : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300"
                }`}
                title="Configurar Notificações"
              >
                <Settings className={`h-4 w-4 ${settingsOpen ? "animate-spin" : ""}`} />
                <span className="text-xs hidden sm:inline">Configurações</span>
              </button>
            </div>
          </div>

          {/* HIDDEN PREFERENCES ACCORDION CARDS PANEL */}
          {settingsOpen && (
            <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-800/80 animate-fade-in text-xs space-y-4 font-sans select-none">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-900 pb-3">
                <div>
                  <span className="text-zinc-300 font-bold font-display block">Alerta Push & Canal Nativo:</span>
                  <span className="text-[10px] text-zinc-550 block">Receba notificações instantâneas no desktop mesmo com o app minimizado</span>
                </div>

                <div>
                  {pushPermission === "granted" ? (
                    <span className="bg-emerald-500/10 text-emerald-400 p-1 px-3 text-[10px] rounded-full font-black border border-emerald-500/20 block">
                      ✓ PERMISSÃO CONCEDIDA
                    </span>
                  ) : pushPermission === "denied" ? (
                    <span className="bg-rose-500/10 text-rose-400 p-1 px-3 text-[10px] rounded-full font-bold border border-rose-500/20 block" title="Vá em configurações do navegador para desbloquear.">
                      ⚠ BLOQUEADO NO NAVEGADOR
                    </span>
                  ) : (
                    <button
                      id="opt-request-push-perm-btn"
                      type="button"
                      onClick={requestPushPermission}
                      className="p-1.5 px-3 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-500 transition-all cursor-pointer text-[10px]"
                    >
                      ATIVAR CANAL NATIVO
                    </button>
                  )}
                </div>
              </div>

              {/* PREFERENCES PANEL SETTINGS FOR DIFFERENT EVENT TYPES */}
              <div className="space-y-4">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">Estilos para cada tipo de Interação:</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
                  
                  {/* LIKE SETTING */}
                  <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-850 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-rose-550/10 text-rose-500">
                          <Heart className="h-3.5 w-3.5 fill-rose-500" />
                        </span>
                        <span className="font-bold text-zinc-100 font-display text-xs">Curtidas (Likes)</span>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pushLike}
                          onChange={() => handlePushToggle("like")}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="text-[10px] text-zinc-400 font-bold ml-1.5">Push</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[10px] text-zinc-500 text-left shrink-0">Som do Alerta:</span>
                      <select
                        value={toneLike}
                        onChange={(e) => handleToneChange("like", e.target.value)}
                        className="bg-zinc-950 border border-zinc-805 text-zinc-300 rounded p-1 px-1.5 text-[11px] font-semibold focus:ring-1 focus:ring-purple-600 outline-none max-w-[130px] truncate"
                      >
                        <option value="bubble_pop">Bubble Pop 🫧</option>
                        <option value="harmonic_sweep">Slide Orgânico 🎼</option>
                        <option value="arpeggio">Arpejo 🎹</option>
                        <option value="bell_chime">Sino Cristal 🔔</option>
                        <option value="electronic_ping">Ping Agudo 📡</option>
                        <option value="none">Silencioso (Nenhum)</option>
                        {(toneLike.startsWith("/") || toneLike.startsWith("http")) && (
                          <option value={toneLike}>Personalizado 🎵</option>
                        )}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-zinc-850/60 flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight block">Som Personalizado (.mp3):</span>
                      <div className="relative">
                        <input
                          type="file"
                          accept="audio/*"
                          id="file-upload-like"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadCustomTone("like", file);
                          }}
                        />
                        <label
                          htmlFor="file-upload-like"
                          className="w-full py-2 px-2.5 rounded bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1.5 select-none transition-all leading-none"
                        >
                          {uploadingCategory === "like" ? (
                            <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Upload className="h-3 w-3 text-zinc-500" />
                          )}
                          <span>Enviar Toque 📁</span>
                        </label>
                      </div>
                      {(toneLike.startsWith("/") || toneLike.startsWith("http")) && (
                        <div className="text-[9px] text-emerald-400 font-bold block leading-none">✓ Toque personalizado ativo!</div>
                      )}
                    </div>
                  </div>

                  {/* COMMENT SETTING */}
                  <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-850 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-purple-550/10 text-purple-400">
                          <MessageSquare className="h-3.5 w-3.5 fill-purple-400/20" />
                        </span>
                        <span className="font-bold text-zinc-100 font-display text-xs">Comentários</span>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pushComment}
                          onChange={() => handlePushToggle("comment")}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="text-[10px] text-zinc-400 font-bold ml-1.5">Push</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[10px] text-zinc-500 text-left shrink-0">Som do Alerta:</span>
                      <select
                        value={toneComment}
                        onChange={(e) => handleToneChange("comment", e.target.value)}
                        className="bg-zinc-950 border border-zinc-805 text-zinc-300 rounded p-1 px-1.5 text-[11px] font-semibold focus:ring-1 focus:ring-purple-600 outline-none max-w-[130px] truncate"
                      >
                        <option value="bubble_pop">Bubble Pop 🫧</option>
                        <option value="harmonic_sweep">Slide Orgânico 🎼</option>
                        <option value="arpeggio">Arpejo 🎹</option>
                        <option value="bell_chime">Sino Cristal 🔔</option>
                        <option value="electronic_ping">Ping Agudo 📡</option>
                        <option value="none">Silencioso (Nenhum)</option>
                        {(toneComment.startsWith("/") || toneComment.startsWith("http")) && (
                          <option value={toneComment}>Personalizado 🎵</option>
                        )}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-zinc-850/60 flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight block">Som Personalizado (.mp3):</span>
                      <div className="relative">
                        <input
                          type="file"
                          accept="audio/*"
                          id="file-upload-comment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadCustomTone("comment", file);
                          }}
                        />
                        <label
                          htmlFor="file-upload-comment"
                          className="w-full py-2 px-2.5 rounded bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1.5 select-none transition-all leading-none"
                        >
                          {uploadingCategory === "comment" ? (
                            <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Upload className="h-3 w-3 text-zinc-500" />
                          )}
                          <span>Enviar Toque 📁</span>
                        </label>
                      </div>
                      {(toneComment.startsWith("/") || toneComment.startsWith("http")) && (
                        <div className="text-[9px] text-emerald-400 font-bold block leading-none">✓ Toque personalizado ativo!</div>
                      )}
                    </div>
                  </div>

                  {/* FOLLOW SETTING */}
                  <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-850 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-blue-550/10 text-blue-400">
                          <UserPlus className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-bold text-zinc-100 font-display text-xs">Seguidores</span>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pushFollow}
                          onChange={() => handlePushToggle("follow")}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="text-[10px] text-zinc-400 font-bold ml-1.5">Push</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[10px] text-zinc-500 text-left shrink-0">Som do Alerta:</span>
                      <select
                        value={toneFollow}
                        onChange={(e) => handleToneChange("follow", e.target.value)}
                        className="bg-zinc-950 border border-zinc-805 text-zinc-300 rounded p-1 px-1.5 text-[11px] font-semibold focus:ring-1 focus:ring-purple-600 outline-none max-w-[130px] truncate"
                      >
                        <option value="bubble_pop">Bubble Pop 🫧</option>
                        <option value="harmonic_sweep">Slide Orgânico 🎼</option>
                        <option value="arpeggio">Arpejo 🎹</option>
                        <option value="bell_chime">Sino Cristal 🔔</option>
                        <option value="electronic_ping">Ping Agudo 📡</option>
                        <option value="none">Silencioso (Nenhum)</option>
                        {(toneFollow.startsWith("/") || toneFollow.startsWith("http")) && (
                          <option value={toneFollow}>Personalizado 🎵</option>
                        )}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-zinc-850/60 flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight block">Som Personalizado (.mp3):</span>
                      <div className="relative">
                        <input
                          type="file"
                          accept="audio/*"
                          id="file-upload-follow"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadCustomTone("follow", file);
                          }}
                        />
                        <label
                          htmlFor="file-upload-follow"
                          className="w-full py-2 px-2.5 rounded bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1.5 select-none transition-all leading-none"
                        >
                          {uploadingCategory === "follow" ? (
                            <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Upload className="h-3 w-3 text-zinc-500" />
                          )}
                          <span>Enviar Toque 📁</span>
                        </label>
                      </div>
                      {(toneFollow.startsWith("/") || toneFollow.startsWith("http")) && (
                        <div className="text-[9px] text-emerald-400 font-bold block leading-none">✓ Toque personalizado ativo!</div>
                      )}
                    </div>
                  </div>

                  {/* PRIVATE MESSAGE SETTING */}
                  <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-850 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-amber-550/10 text-amber-500">
                          <Mail className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-bold text-zinc-100 font-display text-xs">Mensagens DMs</span>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pushMessage}
                          onChange={() => handlePushToggle("message")}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-300 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="text-[10px] text-zinc-400 font-bold ml-1.5">Push</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-[10px] text-zinc-500 text-left shrink-0">Som do Alerta:</span>
                      <select
                        value={toneMessage}
                        onChange={(e) => handleToneChange("message", e.target.value)}
                        className="bg-zinc-950 border border-zinc-805 text-zinc-300 rounded p-1 px-1.5 text-[11px] font-semibold focus:ring-1 focus:ring-purple-600 outline-none max-w-[130px] truncate"
                      >
                        <option value="bubble_pop">Bubble Pop 🫧</option>
                        <option value="harmonic_sweep">Slide Orgânico 🎼</option>
                        <option value="arpeggio">Arpejo 🎹</option>
                        <option value="bell_chime">Sino Cristal 🔔</option>
                        <option value="electronic_ping">Ping Agudo 📡</option>
                        <option value="none">Silencioso (Nenhum)</option>
                        {(toneMessage.startsWith("/") || toneMessage.startsWith("http")) && (
                          <option value={toneMessage}>Personalizado 🎵</option>
                        )}
                      </select>
                    </div>

                    <div className="pt-2 border-t border-zinc-850/60 flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight block">Som Personalizado (.mp3):</span>
                      <div className="relative">
                        <input
                          type="file"
                          accept="audio/*"
                          id="file-upload-message"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadCustomTone("message", file);
                          }}
                        />
                        <label
                          htmlFor="file-upload-message"
                          className="w-full py-2 px-2.5 rounded bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1.5 select-none transition-all leading-none"
                        >
                          {uploadingCategory === "message" ? (
                            <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Upload className="h-3 w-3 text-zinc-500" />
                          )}
                          <span>Enviar Toque 📁</span>
                        </label>
                      </div>
                      {(toneMessage.startsWith("/") || toneMessage.startsWith("http")) && (
                        <div className="text-[9px] text-emerald-400 font-bold block leading-none">✓ Toque personalizado ativo!</div>
                      )}
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}
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
