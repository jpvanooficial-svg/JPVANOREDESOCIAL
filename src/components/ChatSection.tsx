import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { UserProfile, Chat, Message } from "../types";
import { sendAppNotification } from "../lib/notifications";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  Send,
  Plus,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Check,
  CheckCheck,
  Smile,
  X,
  FileAudio,
  UserPlus,
  Sparkles,
  Loader2,
  Trash2,
  Phone,
  Video,
  BadgeCheck,
} from "lucide-react";

interface ChatSectionProps {
  currentUserProfile: UserProfile;
  initialTargetUserId?: string; // Option to seed chats immediately from shortcuts
}

export default function ChatSection({
  currentUserProfile,
  initialTargetUserId,
}: ChatSectionProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRecipient, setActiveRecipient] = useState<UserProfile | null>(null);

  // Recipient search helpers
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Input bindings
  const [inputText, setInputText] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Voice recording helpers (Standard HTML5 MediaRecorder)
  const [recording, setRecording] = useState(false);
  const [audioBlobBase64, setAudioBlobBase64] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // DOM auto scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    // 1. Fetch available chat listings for current user in real-time
    const qChats = query(
      collection(db, "chats"),
      where("userIds", "array-contains", currentUserProfile.id)
    );

    const unsubChats = onSnapshot(qChats, (snap) => {
      const cList: Chat[] = [];
      snap.forEach((d) => {
        cList.push({ id: d.id, ...d.data() } as Chat);
      });
      // Sort oldest to newest message or last timestamp
      cList.sort((a, b) => b.lastMessageAt?.localeCompare?.(a.lastMessageAt) || 0);
      setChats(cList);
    });

    // 2. Fetch list of all potential directory users for initiating first-time chat
    getDocs(collection(db, "users")).then((snap) => {
      const uList: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.id !== currentUserProfile.id) {
          uList.push(u);
        }
      });
      setAvailableUsers(uList);
    });

    return () => {
      unsubChats();
    };
  }, [currentUserProfile.id]);

  // Handle shortcut trigger if active chat is requested from out-of-context notifs or profile follow redirect
  useEffect(() => {
    if (initialTargetUserId) {
      startChatWithUser(initialTargetUserId);
    }
  }, [initialTargetUserId, availableUsers]);

  // Active chat snapshot messages listener
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      setActiveRecipient(null);
      return;
    }

    // 1. Identify recipient user info
    const recipientId = activeChat.userIds.find((uid) => uid !== currentUserProfile.id);
    if (recipientId) {
      getDoc(doc(db, "users", recipientId)).then((snap) => {
        if (snap.exists()) {
          setActiveRecipient(snap.data() as UserProfile);
        }
      });
    }

    // 2. Clear unread tallies inside active chat document for current user
    const curUnread = activeChat.unreadCount?.[currentUserProfile.id] || 0;
    if (curUnread > 0) {
      updateDoc(doc(db, "chats", activeChat.id), {
        [`unreadCount.${currentUserProfile.id}`]: 0,
      });
    }

    // 3. Sync other messages in real-time
    const qMessages = query(
      collection(db, "messages"),
      where("chatId", "==", activeChat.id)
    );

    const unsubMessages = onSnapshot(qMessages, (snap) => {
      const mList: Message[] = [];
      snap.forEach((d) => {
        const msg = { id: d.id, ...d.data() } as Message;
        mList.push(msg);

        // Auto mark received unread messages as read
        if (msg.senderId !== currentUserProfile.id && msg.status !== "read") {
          updateDoc(doc(db, "messages", msg.id), {
            status: "read",
          });
        }
      });

      // Sort chronological
      mList.sort((a, b) => a.createdAt?.localeCompare?.(b.createdAt) || 0);
      setMessages(mList);

      // Auto scroll to bottom
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    });

    return () => {
      unsubMessages();
    };
  }, [activeChat, currentUserProfile.id]);

  // Typing status publisher inside Firestore
  const handleTypingPulse = () => {
    if (!activeChat) return;

    if (activeChat.typingState?.[currentUserProfile.id]) {
      // Refresh timeout
      clearTimeout(typingTimeoutRef.current);
    } else {
      // Set to digiting true
      updateDoc(doc(db, "chats", activeChat.id), {
        [`typingState.${currentUserProfile.id}`]: true,
      });
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateDoc(doc(db, "chats", activeChat.id), {
        [`typingState.${currentUserProfile.id}`]: false,
      });
    }, 2800);
  };

  // Setup the chat instance with recipient
  const startChatWithUser = async (targetUserId: string) => {
    setShowRecipientModal(false);
    const sortedIds = [currentUserProfile.id, targetUserId].sort();
    const uniqueChatId = `chat_${sortedIds[0]}_${sortedIds[1]}`;

    const chatDocRef = doc(db, "chats", uniqueChatId);
    const chatDoc = await getDoc(chatDocRef);

    if (chatDoc.exists()) {
      setActiveChat({ id: uniqueChatId, ...chatDoc.data() } as Chat);
    } else {
      // Create new chat room parameters
      const newChatData: any = {
        id: uniqueChatId,
        userIds: sortedIds,
        lastMessage: "Discussão iniciada",
        lastMessageAt: new Date().toISOString(),
        unreadCount: {
          [currentUserProfile.id]: 0,
          [targetUserId]: 0,
        },
        typingState: {
          [currentUserProfile.id]: false,
          [targetUserId]: false,
        },
      };

      await setDoc(chatDocRef, newChatData);
      setActiveChat({ id: uniqueChatId, ...newChatData });
    }
  };

  // Message dispatcher
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || (!inputText.trim() && !photoPreview && !audioBlobBase64)) return;

    const recipientId = activeChat.userIds.find((uid) => uid !== currentUserProfile.id)!;
    const workingText = inputText.trim();
    setInputText("");

    // Clear typing states
    clearTimeout(typingTimeoutRef.current);
    updateDoc(doc(db, "chats", activeChat.id), {
      [`typingState.${currentUserProfile.id}`]: false,
    });

    try {
      let type: "text" | "image" | "audio" = "text";
      let mediaURL = "";

      // 1. Upload custom in-chat Photo to disk if present
      if (photoPreview) {
        setUploadingMedia(true);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: photoPreview,
            originalMimeType: "image/jpeg",
            extension: "jpg",
          }),
        });
        const uploadResult = await res.json();
        if (uploadResult.url) {
          mediaURL = uploadResult.url;
          type = "image";
        }
        setPhotoPreview(null);
      }

      // 2. Upload audio recorded message
      if (audioBlobBase64) {
        setUploadingMedia(true);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: audioBlobBase64,
            originalMimeType: "audio/webm",
            extension: "webm",
          }),
        });
        const uploadResult = await res.json();
        if (uploadResult.url) {
          mediaURL = uploadResult.url;
          type = "audio";
        }
        setAudioBlobBase64(null);
      }

      const cleanTextMsg = type === "text" ? workingText : type === "image" ? "📷 Foto postada" : "🎙️ Mensagem de voz";

      // 3. Save Message Document inside Firestore
      await addDoc(collection(db, "messages"), {
        chatId: activeChat.id,
        senderId: currentUserProfile.id,
        recipientId,
        text: type === "text" ? workingText : "",
        type,
        mediaURL,
        status: "sent",
        createdAt: new Date().toISOString(),
      });

      // 4. Update Chat references with latest metadata counters
      const otherUnreadTally = (activeChat.unreadCount?.[recipientId] || 0) + 1;
      await updateDoc(doc(db, "chats", activeChat.id), {
        lastMessage: cleanTextMsg,
        lastMessageAt: new Date().toISOString(),
        [`unreadCount.${recipientId}`]: otherUnreadTally,
      });

      // 5. Trigger notifications channel
      await sendAppNotification(
        recipientId,
        currentUserProfile.id,
        currentUserProfile.username,
        currentUserProfile.photoURL,
        "message",
        `te enviou uma mensagem privada: "${cleanTextMsg.substring(0, 30)}..."`
      );

    } catch (err) {
      console.error(err);
    } finally {
      setUploadingMedia(false);
    }
  };

  // MICROPHONE VOICE CAPTURE IMPLEMENTATION
  const startRecordingAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioBlobBase64(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        // Turn off stream tracks to free mic resource
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.warn("Could not start recording audio, check browser permissions:", err);
    }
  };

  const stopRecordingAudio = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Read message attachment file selection
  const handlePhotoAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const filteredUsers = availableUsers.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 font-sans text-zinc-100 flex flex-col md:flex-row gap-5 h-[80vh] animate-fade-in select-none">
      
      {/* LEFT COLUMN: CHAT INBOX CHANNELS LIST */}
      <div className="w-full md:w-80 bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col h-full overflow-hidden shrink-0">
        <div className="p-4 border-b border-zinc-805 flex justify-between items-center bg-zinc-950/20">
          <h2 className="text-lg font-bold font-display text-white">Mensagens</h2>
          <button
            id="chat-add-partner-btn"
            onClick={() => setShowRecipientModal(true)}
            className="p-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white transition-all cursor-pointer text-xs font-bold font-display flex items-center gap-1.5"
            title="Nova Conversa"
          >
            <Plus className="h-4 w-4" />
            Nova
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chats.length === 0 ? (
            <div className="text-center py-10 text-zinc-550 italic text-xs space-y-1">
              <p>Nenhuma discussão iniciada.</p>
              <p className="text-[10px] text-zinc-650">Clique em &ldquo;Nova&rdquo; para prosseguir.</p>
            </div>
          ) : (
            chats.map((ch) => {
              const otherUserId = ch.userIds!.find((uid) => uid !== currentUserProfile.id)!;
              const unreadNum = ch.unreadCount?.[currentUserProfile.id] || 0;
              const isSearchingActive = activeChat?.id === ch.id;

              return (
                <InboxRow
                  key={ch.id}
                  chat={ch}
                  otherUserId={otherUserId}
                  isActive={isSearchingActive}
                  unreadCount={unreadNum}
                  onClick={() => setActiveChat(ch)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: ACTIVE WINDOW CHAT ROOM */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col h-full overflow-hidden relative">
        {activeChat && activeRecipient ? (
          <>
            {/* ROOM HEADER */}
            <div className="p-4 border-b border-zinc-805 bg-zinc-950/20 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={activeRecipient.photoURL}
                  alt={activeRecipient.username}
                  className="w-10 h-10 rounded-full object-cover border border-purple-500"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold text-sm text-white">@{activeRecipient.username}</span>
                    {activeRecipient.verified && (
                      <BadgeCheck className="h-3.5 w-3.5 text-sky-400 fill-sky-400" />
                    )}
                  </div>
                  {activeChat.typingState?.[activeRecipient.id] ? (
                    <span className="text-[10px] text-purple-400 font-bold tracking-wider animate-pulse uppercase">Digitando...</span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 block">Sincronizado em tempo real</span>
                  )}
                </div>
              </div>

              {/* Decorative headers icons */}
              <div className="flex gap-2 text-zinc-500">
                <button className="p-2 hover:text-white rounded-lg transition-colors cursor-default"><Phone className="h-4.5 w-4.5" /></button>
                <button className="p-2 hover:text-white rounded-lg transition-colors cursor-default"><Video className="h-4.5 w-4.5" /></button>
              </div>
            </div>

            {/* CHAT MESSAGES BODY */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-center text-zinc-550 text-xs">
                  <Sparkles className="h-8 w-8 text-purple-400 mb-2 animate-bounce" />
                  <p>Início da conversa com @{activeRecipient.username}.</p>
                  <p className="text-[10px] text-zinc-650 mt-1">Todas as mensagens são criptografadas localmente.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderId === currentUserProfile.id;
                  
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isMe ? "justify-end animate-fade-in" : "justify-start animate-fade-in"}`}
                    >
                      <div className={`max-w-[70%] rounded-2xl p-3.5 ${
                        isMe
                          ? "bg-purple-650 text-white rounded-tr-none shadow-md"
                          : "bg-zinc-800 text-zinc-150 rounded-tl-none border border-zinc-750"
                      }`}>
                        {/* Text Message Content */}
                        {m.type === "text" && (
                          <p className="text-xs break-words leading-relaxed font-sans">{m.text}</p>
                        )}

                        {/* Image Upload Message Content */}
                        {m.type === "image" && m.mediaURL && (
                          <div className="rounded-xl overflow-hidden mb-1.5 border border-zinc-700 max-w-full select-none">
                            <img
                              src={m.mediaURL}
                              alt="In-chat upload"
                              className="w-full object-cover max-h-48"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}

                        {/* Audio Clip Player Content */}
                        {m.type === "audio" && m.mediaURL && (
                          <div className="flex items-center gap-2.5 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 shrink-0 select-none">
                            <span className="text-xl">🎙️</span>
                            <audio src={m.mediaURL} controls className="w-40 h-8 custom-audio-player contrast-110 shrink" />
                          </div>
                        )}

                        {/* Message Metadata metrics (status check and hour) */}
                        <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[9px] text-zinc-400 select-none font-sans">
                          <span>
                            {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                          {isMe && (
                            <span>
                              {m.status === "read" ? (
                                <CheckCheck className="h-3 w-3 text-sky-400" />
                              ) : (
                                <Check className="h-3 w-3 text-zinc-400" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={scrollRef} />
            </div>

            {/* MESSAGE ATTACHMENTS BAR PREVIEW */}
            {(photoPreview || audioBlobBase64 || uploadingMedia) && (
              <div className="p-3 bg-zinc-950 border-t border-zinc-850 flex items-center gap-3 shrink-0 animate-fade-in">
                {photoPreview && (
                  <div className="relative inline-block select-none">
                    <img src={photoPreview} alt="Upload draft" className="w-16 h-16 rounded-xl object-cover border border-zinc-700" />
                    <button
                      id="clear-photo-draft-btn"
                      onClick={() => setPhotoPreview(null)}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-rose-500 rounded-full text-white cursor-pointer hover:bg-rose-600 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {audioBlobBase64 && (
                  <div className="flex items-center gap-2 bg-zinc-900 p-2.5 rounded-xl border border-zinc-700">
                    <FileAudio className="h-5 w-5 text-purple-400" />
                    <span className="text-xs font-bold text-zinc-300">Mensagem de voz pronta!</span>
                    <button
                      id="clear-audio-draft-btn"
                      onClick={() => setAudioBlobBase64(null)}
                      className="p-1 hover:text-rose-400 rounded transition-all cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {uploadingMedia && (
                  <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Preparando mídia...</span>
                  </div>
                )}
              </div>
            )}

            {/* SENDING INPUT CONTAINER FORM */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-805 bg-zinc-950/20 shrink-0 flex items-center gap-2">
              <label className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white cursor-pointer transition-all">
                <ImageIcon className="h-4.5 w-4.5" />
                <input
                  id="chat-photo-attachment-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoAttachment}
                  className="hidden"
                />
              </label>

              {recording ? (
                <button
                  id="stop-audio-recording-btn"
                  type="button"
                  onClick={stopRecordingAudio}
                  className="p-2.5 rounded-xl bg-rose-600 text-white cursor-pointer hover:bg-rose-500 transition-all flex items-center gap-1.5 animate-pulse shrink-0"
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                  Gravar
                </button>
              ) : (
                <button
                  id="start-audio-recording-btn"
                  type="button"
                  onClick={startRecordingAudio}
                  className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white cursor-pointer transition-all shrink-0"
                  title="Enviar mensagem de voz"
                >
                  <Mic className="h-4.5 w-4.5" />
                </button>
              )}

              <input
                id="chat-text-input"
                type="text"
                placeholder="Digite sua mensagem privada..."
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  handleTypingPulse();
                }}
                disabled={uploadingMedia}
                className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-500 text-xs transition-all"
              />

              <button
                id="chat-submit-btn"
                type="submit"
                disabled={uploadingMedia || (!inputText.trim() && !photoPreview && !audioBlobBase64)}
                className="p-2.5 rounded-xl brand-gradient-bg text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow disabled:opacity-50"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col justify-center items-center text-center p-6 text-zinc-550 font-sans">
            <Smile className="h-14 w-14 text-zinc-700 mb-3" />
            <h3 className="text-base font-bold text-zinc-400 font-display">Selecione uma Discussão</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-xs leading-relaxed">
              Inicie conexões ou tire dúvidas enviando mensagens em tempo real no chat JPvano.
            </p>
          </div>
        )}
      </div>

      {/* RECIPIENT SELECTION MODAL */}
      {showRecipientModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-5 relative font-sans shadow-2xl animate-fade-in max-h-[70vh] overflow-y-auto">
            <button
              id="close-recipient-modal-btn"
              onClick={() => setShowRecipientModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold font-display text-white mb-4">Iniciar Conversa Direta</h3>

            <input
              id="recipient-search-input"
              type="text"
              placeholder="Buscar por nome de usuário..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-500 text-xs transition-all mb-4"
            />

            <div className="space-y-2 mt-2">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-zinc-650 italic text-center py-4">Nenhum usuário correspondente encontrado.</p>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    id={`recipient-choice-btn-${user.id}`}
                    onClick={() => startChatWithUser(user.id)}
                    className="flex justify-between items-center bg-zinc-950 hover:bg-zinc-850 p-2.5 rounded-xl border border-zinc-850 cursor-pointer transition-all animate-fade-in"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={user.photoURL}
                        alt={user.username}
                        className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex items-center gap-0.5">
                          <span className="font-extrabold text-xs text-white">@{user.username}</span>
                          {user.verified && (
                            <BadgeCheck className="h-3 w-3 text-sky-400 fill-sky-400" />
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 block truncate max-w-[150px]">{user.email}</span>
                      </div>
                    </div>
                    <UserPlus className="h-4 w-4 text-purple-400" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Sub-component row for Inbox
interface InboxRowProps {
  key?: string;
  chat: Chat;
  otherUserId: string;
  isActive: boolean;
  unreadCount: number;
  onClick: () => void;
}

function InboxRow({ chat, otherUserId, isActive, unreadCount, onClick }: InboxRowProps) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Read the user once or watch real-time status updates
    const unsub = onSnapshot(doc(db, "users", otherUserId), (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [otherUserId]);

  if (!userProfile) return null;

  return (
    <button
      id={`inbox-row-${chat.id}`}
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all border cursor-pointer ${
        isActive
          ? "bg-purple-650/10 border-purple-550/30 text-white"
          : "bg-zinc-950/20 border-transparent text-zinc-400 hover:bg-zinc-850"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={userProfile.photoURL}
          alt={userProfile.username}
          className="w-9 h-9 rounded-full object-cover border border-zinc-800 relative grow-0 shrink-0"
          referrerPolicy="no-referrer"
        />
        <div className="text-left min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`text-xs truncate font-extrabold max-w-[130px] block ${isActive ? "text-white" : "text-zinc-200"}`}>
              @{userProfile.username}
            </span>
            {userProfile.verified && (
              <BadgeCheck className="h-3.5 w-3.5 text-sky-400 fill-sky-400 grow-0 shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-zinc-500 truncate block max-w-[130px] italic">
            {chat.lastMessage || "Discussão iniciada"}
          </p>
        </div>
      </div>

      {unreadCount > 0 && (
        <span className="p-1 px-1.5 bg-rose-500 text-white font-bold text-[9px] rounded-full min-w-4 text-center shrink-0">
          {unreadCount}
        </span>
      )}
    </button>
  );
}
