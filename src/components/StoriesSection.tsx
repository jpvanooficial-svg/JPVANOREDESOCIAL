import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { UserProfile } from "../types";
import { sendAppNotification } from "../lib/notifications";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  getDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import {
  Plus,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  Flame,
  Heart,
  MessageCircle,
  Loader2,
  Tv,
  Image as ImageIcon,
  Clock,
  CheckCircle,
} from "lucide-react";

// Story schema
export interface Story {
  id: string;
  userId: string;
  username: string;
  userPhotoURL: string;
  userVerified: boolean;
  type: "image" | "video";
  mediaURL: string;
  createdAt: string;
  expiresAt: string;
  reactions?: Record<string, string[]>; // emoji -> array of usernames
  replies?: Array<{
    id: string;
    userId: string;
    username: string;
    userPhotoURL: string;
    text: string;
    createdAt: string;
  }>;
}

interface StoriesSectionProps {
  currentUserProfile: UserProfile;
  onUserSelect?: (userId: string) => void;
}

// Preset visual stories to allow instant publication of gorgeous content
const PRESET_TEMPLATES = [
  {
    name: "⚡ Atleta & Foco",
    type: "video" as const,
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    poster: "https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&w=400&q=80",
    description: "Vídeo curto da rotina de disciplina e evolução."
  },
  {
    name: "🌆 Neon Vibes",
    type: "image" as const,
    url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1080&q=80",
    description: "Estilo anime retro cyberpunk de luzes noturnas."
  },
  {
    name: "🌊 Sunset Loop",
    type: "video" as const,
    url: "https://assets.mixkit.co/videos/preview/mixkit-glory-of-a-bright-orange-sunset-over-the-sea-40118-large.mp4",
    poster: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80",
    description: "Vídeo em loop de um por do sol dourado no mar."
  },
  {
    name: "🥋 Karatê Shotokan",
    type: "image" as const,
    url: "https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&w=1080&q=80",
    description: "Arte marcial com foco, garra e determinação."
  },
  {
    name: "🏔️ Natureza Brutal",
    type: "image" as const,
    url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1080&q=80",
    description: "Paisagem montanhosa inspiradora sob o sol da manhã."
  }
];

export default function StoriesSection({
  currentUserProfile,
  onUserSelect,
}: StoriesSectionProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals controls
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof PRESET_TEMPLATES[0] | null>(PRESET_TEMPLATES[0]);
  const [customUrl, setCustomUrl] = useState("");
  const [customType, setCustomType] = useState<"image" | "video">("image");
  const [posting, setPosting] = useState(false);

  // Viewer states
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeStoryUser, setActiveStoryUser] = useState<string | null>(null); // userId of active user's deck
  const [activeStoryIndex, setActiveStoryIndex] = useState(0); // index inside that user's stories list
  const [replyInput, setReplyInput] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [progressVal, setProgressVal] = useState(0);

  // 1. Subscribe to real-time stories collection in database
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "stories"), (snap) => {
      const all: Story[] = [];
      const now = new Date().toISOString();

      snap.forEach((d) => {
        const s = { id: d.id, ...d.data() } as Story;
        
        // Only include active stories (expiresAt > now)
        if (s.expiresAt > now) {
          all.push(s);
        } else {
          // Clean up expired stories dynamically from database
          deleteDoc(doc(db, "stories", d.id)).catch(() => {});
        }
      });

      // Sort chronological
      all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setStories(all);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Group stories by userId for chronological user sequences
  const groupedDecks = React.useMemo(() => {
    const map: Record<string, { user: Partial<UserProfile> & { username: string; photoURL: string; verified: boolean }; list: Story[] }> = {};
    
    stories.forEach((s) => {
      if (!map[s.userId]) {
        map[s.userId] = {
          user: {
            id: s.userId,
            username: s.username,
            photoURL: s.userPhotoURL,
            verified: s.userVerified,
          },
          list: [],
        };
      }
      map[s.userId].list.push(s);
    });

    // Sort users so that current logged user is always first if they have active story, followed by others
    return Object.values(map).sort((a, b) => {
      if (a.list[0].userId === currentUserProfile.id) return -1;
      if (b.list[0].userId === currentUserProfile.id) return 1;
      return b.list[0].createdAt.localeCompare(a.list[0].createdAt);
    });
  }, [stories, currentUserProfile.id]);

  // Current active story being viewed
  const activeUserDeck = groupedDecks.find((g) => g.user.id === activeStoryUser);
  const activeStory = activeUserDeck?.list[activeStoryIndex];

  // 2. Automagic Timer Progress Bar for story slides (6 seconds duration)
  useEffect(() => {
    if (!viewerOpen || !activeStory) {
      setProgressVal(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setProgressVal(0);
    const stepMs = 50; // every 50ms update progress
    const durationMs = 6000; // 6 seconds
    const increment = (stepMs / durationMs) * 100;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setProgressVal((prev) => {
        if (prev >= 100) {
          handleNextStory();
          return 100;
        }
        return prev + increment;
      });
    }, stepMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [viewerOpen, activeStoryUser, activeStoryIndex]);

  const handleNextStory = () => {
    if (!activeUserDeck) return;
    if (activeStoryIndex < activeUserDeck.list.length - 1) {
      setActiveStoryIndex((prev) => prev + 1);
    } else {
      // Find next user's deck
      const currentDeckIndex = groupedDecks.findIndex((g) => g.user.id === activeStoryUser);
      if (currentDeckIndex !== -1 && currentDeckIndex < groupedDecks.length - 1) {
        const nextUserDeck = groupedDecks[currentDeckIndex + 1];
        setActiveStoryUser(nextUserDeck.user.id || null);
        setActiveStoryIndex(0);
      } else {
        // End of all stories
        closeViewer();
      }
    }
  };

  const handlePrevStory = () => {
    if (!activeUserDeck) return;
    if (activeStoryIndex > 0) {
      setActiveStoryIndex((prev) => prev - 1);
    } else {
      // Find previous user's deck
      const currentDeckIndex = groupedDecks.findIndex((g) => g.user.id === activeStoryUser);
      if (currentDeckIndex > 0) {
        const prevUserDeck = groupedDecks[currentDeckIndex - 1];
        setActiveStoryUser(prevUserDeck.user.id || null);
        setActiveStoryIndex(prevUserDeck.list.length - 1);
      } else {
        // Restart current story
        setProgressVal(0);
      }
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setActiveStoryUser(null);
    setActiveStoryIndex(0);
    setProgressVal(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // 3. Post Story Action
  const handlePostStory = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);

    try {
      let finalUrl = "";
      let finalType: "image" | "video" = "image";

      if (selectedTemplate) {
        finalUrl = selectedTemplate.url;
        finalType = selectedTemplate.type;
      } else {
        if (!customUrl.trim()) return;
        finalUrl = customUrl.trim();
        finalType = customType;
      }

      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours later

      await addDoc(collection(db, "stories"), {
        userId: currentUserProfile.id,
        username: currentUserProfile.username,
        userPhotoURL: currentUserProfile.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80",
        userVerified: currentUserProfile.verified || false,
        type: finalType,
        mediaURL: finalUrl,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        reactions: {},
        replies: [],
      });

      // Clear states & close
      setCreatorOpen(false);
      setCustomUrl("");
      setSelectedTemplate(PRESET_TEMPLATES[0]);
    } catch (err) {
      console.error(err);
      alert("Falha ao publicar story.");
    } finally {
      setPosting(false);
    }
  };

  // 4. Quick React and Dispatch app notifications
  const handleStoryReact = async (emoji: string) => {
    if (!activeStory) return;

    try {
      const storyRef = doc(db, "stories", activeStory.id);
      const existingReactions = activeStory.reactions || {};
      const emojiUsers = existingReactions[emoji] || [];

      // Add username if not already in list to avoid duplicates
      if (!emojiUsers.includes(currentUserProfile.username)) {
        emojiUsers.push(currentUserProfile.username);
      }

      await updateDoc(storyRef, {
        [`reactions.${emoji}`]: emojiUsers,
      });

      // Trigger standard JPvano in-app notification
      await sendAppNotification(
        activeStory.userId,
        currentUserProfile.id,
        currentUserProfile.username,
        currentUserProfile.photoURL,
        "like",
        `reagiu com ${emoji} ao seu Story!`,
        `story_${activeStory.id}`
      );
    } catch (e) {
      console.error(e);
    }
  };

  // 5. Send Story Reply. Creates direct message and notification instantly
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !replyInput.trim() || sendingReply) return;

    setSendingReply(true);
    const textMsg = replyInput.trim();
    setReplyInput("");

    try {
      const storyRef = doc(db, "stories", activeStory.id);
      
      // Save localized reply directly to the story
      const existingReplies = activeStory.replies || [];
      const newReply = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: currentUserProfile.id,
        username: currentUserProfile.username,
        userPhotoURL: currentUserProfile.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80",
        text: textMsg,
        createdAt: new Date().toISOString(),
      };
      
      await updateDoc(storyRef, {
        replies: [...existingReplies, newReply],
      });

      // Generate DM schema (matches ChatSection.tsx exactly)
      if (activeStory.userId !== currentUserProfile.id) {
        const sortedIds = [currentUserProfile.id, activeStory.userId].sort();
        const uniqueChatId = `chat_${sortedIds[0]}_${sortedIds[1]}`;
        const chatDocRef = doc(db, "chats", uniqueChatId);
        const chatSnap = await getDoc(chatDocRef);

        const replyPrefix = `💬 Respondeu ao seu story: "${textMsg}"`;

        if (!chatSnap.exists()) {
          // Initialize DM thread parameters
          await setDoc(chatDocRef, {
            id: uniqueChatId,
            userIds: sortedIds,
            lastMessage: replyPrefix,
            lastMessageAt: new Date().toISOString(),
            unreadCount: {
              [currentUserProfile.id]: 0,
              [activeStory.userId]: 1,
            },
            typingState: {
              [currentUserProfile.id]: false,
              [activeStory.userId]: false,
            },
          });
        } else {
          const currentData = chatSnap.data();
          const targetUnreads = (currentData?.unreadCount?.[activeStory.userId] || 0) + 1;
          await updateDoc(chatDocRef, {
            lastMessage: replyPrefix,
            lastMessageAt: new Date().toISOString(),
            [`unreadCount.${activeStory.userId}`]: targetUnreads,
          });
        }

        // Add message doc
        await addDoc(collection(db, "messages"), {
          chatId: uniqueChatId,
          senderId: currentUserProfile.id,
          recipientId: activeStory.userId,
          text: replyPrefix,
          type: "text",
          status: "sent",
          createdAt: new Date().toISOString(),
        });

        // Trigger message notification
        await sendAppNotification(
          activeStory.userId,
          currentUserProfile.id,
          currentUserProfile.username,
          currentUserProfile.photoURL,
          "message",
          `respondeu ao seu story: "${textMsg}"`
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="font-sans select-none mb-6">
      
      {/* STORIES ROW BAR */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 md:p-5 shadow-lg flex items-center gap-4 overflow-x-auto scrollbar-none">
        
        {/* ADD STORY CIRCLE */}
        <div className="flex flex-col items-center shrink-0">
          <button
            id="open-story-creator-btn"
            onClick={() => setCreatorOpen(true)}
            className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center relative cursor-pointer group hover:border-purple-500 hover:bg-zinc-900 transition-all active:scale-95 duration-250 shadow-md"
          >
            <div className="w-14 h-14 rounded-full border border-dashed border-zinc-750 flex items-center justify-center group-hover:border-purple-400 group-hover:scale-105 transition-all">
              <Plus className="h-6 w-6 text-purple-450 group-hover:text-purple-300 group-hover:rotate-90 transition-all duration-300" />
            </div>
            {/* Tiny blue dynamic indicators */}
            <span className="absolute bottom-0 right-0 p-1 rounded-full bg-purple-600 border border-zinc-900 shadow">
              <Plus className="h-2.5 w-2.5 text-white stroke-2" />
            </span>
          </button>
          <span className="text-[10px] text-zinc-400 font-bold tracking-tight mt-2 font-display">Criar Story</span>
        </div>

        {/* LOADING INDICATOR */}
        {loading && (
          <div className="flex items-center gap-3 py-4 pl-3">
            <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
            <span className="text-xs text-zinc-500 italic">Sincronizando stories...</span>
          </div>
        )}

        {/* LIST OF ACTIVE DECKS */}
        {!loading && groupedDecks.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-4 text-center">
            <p className="text-xs text-zinc-550 italic font-medium">Nenhum story ativo hoje. Poste algo e apareça aqui!</p>
          </div>
        )}

        {groupedDecks.map((deck) => {
          const isCurrentUser = deck.user.id === currentUserProfile.id;
          const userAvatar = deck.user.photoURL;
          const userLabel = isCurrentUser ? "Seu Story" : `@${deck.user.username}`;
          
          return (
            <div
              key={deck.user.id}
              className="flex flex-col items-center shrink-0"
            >
              <button
                id={`view-story-deck-btn-${deck.user.id}`}
                onClick={() => {
                  setActiveStoryUser(deck.user.id || null);
                  setActiveStoryIndex(0);
                  setViewerOpen(true);
                }}
                className="w-16 h-16 rounded-full p-[3px] border-2 border-transparent brand-gradient-bg cursor-pointer hover:scale-105 transition-all duration-300 bg-clip-border flex items-center justify-center shadow-lg active:scale-95 focus:outline-none glow-logo"
              >
                <div className="w-[52px] h-[52px] rounded-full overflow-hidden bg-zinc-950 p-[2px] border border-zinc-900 shrink-0">
                  <img
                    src={userAvatar}
                    alt={deck.user.username}
                    className="w-full h-full object-cover rounded-full"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </button>
              <span className="text-[11px] font-semibold text-zinc-300 mt-2 truncate max-w-16 text-center font-display leading-tight">
                {userLabel}
              </span>
            </div>
          );
        })}

      </div>

      {/* STORY CREATION MODAL */}
      {creatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl p-5 md:p-6 relative font-sans shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              id="close-story-creator-btn"
              onClick={() => setCreatorOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all border border-zinc-800/20"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-purple-550/10 text-purple-400">
                <Tv className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-xl font-black text-white font-display">Criar Novo Story JPvano</h3>
                <p className="text-xs text-zinc-400 leading-tight">Poste fotos ou vídeos que desaparecem automaticamente após 24 horas.</p>
              </div>
            </div>

            <form onSubmit={handlePostStory} className="space-y-5 mt-4">
              
              {/* BRANDED PRESETS CHOICES */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-300 font-display block">Escolha uma Legenda Visual ou Modelo:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {PRESET_TEMPLATES.map((tmpl) => {
                    const isSelected = selectedTemplate?.name === tmpl.name;
                    return (
                      <div
                        key={tmpl.name}
                        onClick={() => {
                          setSelectedTemplate(tmpl);
                          setCustomUrl("");
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-2.5 items-center ${
                          isSelected
                            ? "bg-purple-950/25 border-purple-500/50"
                            : "bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900"
                        }`}
                      >
                        <img
                          src={tmpl.poster}
                          alt={tmpl.name}
                          className="w-10 h-10 object-cover rounded-xl border border-zinc-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-zinc-100 block truncate">{tmpl.name}</span>
                          <span className="text-[10px] text-zinc-400 block truncate leading-none mt-1">{tmpl.description}</span>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-4 w-4 text-purple-400 shrink-0 ml-auto" />
                        )}
                      </div>
                    );
                  })}

                  <div
                    onClick={() => setSelectedTemplate(null)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-2.5 items-center ${
                      selectedTemplate === null
                        ? "bg-purple-950/25 border-purple-500/50"
                        : "bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-850 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-zinc-450" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-100 block">Link Customizado</span>
                      <span className="text-[10px] text-zinc-500 block leading-none mt-1">Cole qualquer imagem/vídeo da web.</span>
                    </div>
                    {selectedTemplate === null && (
                      <CheckCircle className="h-4 w-4 text-purple-400 shrink-0 ml-auto" />
                    )}
                  </div>
                </div>
              </div>

              {/* CUSTOM DESIGNS FIELDS */}
              {selectedTemplate === null && (
                <div className="bg-zinc-950/50 p-4 border border-zinc-800 rounded-2xl space-y-3.5 animate-fade-in">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">Tipo do Story:</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomType("image")}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          customType === "image"
                            ? "bg-purple-550/15 border-purple-500 text-purple-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        📷 Imagem / Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType("video")}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          customType === "video"
                            ? "bg-purple-550/15 border-purple-500 text-purple-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        🎥 Vídeo Curto
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">URL Absoluta do Arquivo:</label>
                    <input
                      id="story-custom-url-input"
                      type="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="https://exemplo.com/sua-foto.jpg"
                      required={selectedTemplate === null}
                      className="w-full text-xs p-3 rounded-xl bg-zinc-950 text-white border border-zinc-850 placeholder-zinc-700 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* SUBMIT BUTTON */}
              <button
                id="publish-new-story-btn"
                type="submit"
                disabled={posting}
                className="w-full py-3 rounded-2xl brand-gradient-bg text-white font-bold font-display shadow-lg hover:opacity-95 text-xs tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {posting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Publicando storie real-time...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>PUBLICAR STORY JPvano</span>
                  </>
                )}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* FULLSCREEN STORIES VIEWER */}
      {viewerOpen && activeUserDeck && activeStory && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col md:flex-row items-center justify-center p-0 md:p-6 text-zinc-100 select-none">
          
          {/* HEADER BACKGROUND FOR AMBIENT CONTRAST */}
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md hidden md:block"></div>

          {/* CONTROL ARROWMAPS (DESKTOP BACK / FORWARD SHORTCUTS) */}
          <button
            id="story-viewer-prev-btn"
            onClick={handlePrevStory}
            className="absolute left-8 z-50 p-3 bg-zinc-900/60 hover:bg-zinc-800/80 rounded-full border border-zinc-800/40 text-white hover:scale-105 active:scale-95 transition-all text-xs cursor-pointer hidden md:block"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button
            id="story-viewer-next-btn"
            onClick={handleNextStory}
            className="absolute right-8 z-50 p-3 bg-zinc-900/60 hover:bg-zinc-800/80 rounded-full border border-zinc-800/40 text-white hover:scale-105 active:scale-95 transition-all text-xs cursor-pointer hidden md:block"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* MAIN STORIES WRAPPER */}
          <div className="w-full max-w-[480px] h-full md:h-[85vh] bg-zinc-950 border-0 md:border md:border-zinc-850 rounded-none md:rounded-3xl relative overflow-hidden flex flex-col shadow-2xl z-45">
            
            {/* 1. TOP SEGMENTED PROGRESS BARS */}
            <div className="absolute top-3 inset-x-3 z-50 flex gap-1.5 px-1.5 pb-2">
              {activeUserDeck.list.map((st, i) => {
                let fill = 0;
                if (i < activeStoryIndex) fill = 100;
                else if (i === activeStoryIndex) fill = progressVal;

                return (
                  <div key={st.id} className="flex-1 h-1 bg-zinc-850/70 rounded-full overflow-hidden">
                    <div
                      className="h-full brand-gradient-bg transition-all"
                      style={{
                        width: `${fill}%`,
                        transitionDuration: "50ms",
                      }}
                    ></div>
                  </div>
                );
              })}
            </div>

            {/* 2. STORY HEADER (AVATAR + TIME) */}
            <div className="absolute top-7 inset-x-4 z-50 flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/60 to-transparent p-2 rounded-t-xl">
              <div className="flex items-center gap-2.5">
                <img
                  src={activeUserDeck.user.photoURL}
                  alt={activeUserDeck.user.username}
                  onClick={() => {
                    closeViewer();
                    if (activeUserDeck.user.id && onUserSelect) onUserSelect(activeUserDeck.user.id);
                  }}
                  className="w-10 h-10 object-cover rounded-full border-2 border-purple-500 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span
                      onClick={() => {
                        closeViewer();
                        if (activeUserDeck.user.id && onUserSelect) onUserSelect(activeUserDeck.user.id);
                      }}
                      className="font-extrabold text-sm text-white hover:underline cursor-pointer"
                    >
                      @{activeUserDeck.user.username}
                    </span>
                    {activeUserDeck.user.verified && (
                      <span className="w-3.5 h-3.5 text-sky-400 bg-white rounded-full flex items-center justify-center p-0.5 scale-90">✓</span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-300 font-medium flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(activeStory.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>

              {/* Close and Delete buttons */}
              <div className="flex items-center gap-1">
                <button
                  id="close-story-viewer-btn"
                  onClick={closeViewer}
                  className="p-1 px-2.5 rounded-lg bg-zinc-950/60 hover:bg-zinc-850 text-white cursor-pointer transition-all border border-zinc-800/10 text-xs font-bold"
                  title="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* 3. CORE MEDIA STAGE */}
            <div className="flex-1 w-full bg-zinc-950 flex items-center justify-center relative select-none">
              
              {/* Left/Right click triggers for quick tap navigating */}
              <div
                onClick={handlePrevStory}
                className="absolute left-0 inset-y-16 w-1/4 z-30 cursor-pointer"
                title="Voltar"
              ></div>
              <div
                onClick={handleNextStory}
                className="absolute right-0 inset-y-16 w-1/4 z-30 cursor-pointer"
                title="Avançar"
              ></div>

              {activeStory.type === "video" ? (
                <video
                  src={activeStory.mediaURL}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={activeStory.mediaURL}
                  alt="JPvano Story screen"
                  className="w-full h-full object-cover focus:outline-none"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            {/* 4. REACTION FLOATING DRAWER */}
            <div className="bg-gradient-to-t from-zinc-950 to-transparent p-4 pt-10 relative z-40 select-none">
              
              <div className="flex justify-around items-center gap-2 mb-4 bg-black/60 backdrop-blur border border-zinc-900/60 p-2.5 rounded-2xl">
                {["🔥", "❤️", "😂", "😮", "👏"].map((emoji) => {
                  const reactionsCount = activeStory.reactions?.[emoji]?.length || 0;
                  return (
                    <button
                      key={emoji}
                      id={`react-story-emoji-${emoji}`}
                      onClick={() => handleStoryReact(emoji)}
                      className="text-2xl hover:scale-130 active:scale-90 transition-all flex flex-col items-center cursor-pointer group"
                      title={`Reagir com ${emoji}`}
                    >
                      <span className="group-hover:animate-bounce">{emoji}</span>
                      {reactionsCount > 0 && (
                        <span className="text-[10px] text-zinc-400 font-display mt-0.5 bg-zinc-850 px-1.5 py-0.5 rounded-full font-black leading-none">
                          {reactionsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 5. LIVE DISCUSSION SUBSECTION */}
              <div className="space-y-3.5">
                {activeStory.replies && activeStory.replies.length > 0 && (
                  <div className="max-h-24 overflow-y-auto space-y-2 pr-1 mb-2 bg-transparent p-1.5 rounded-xl">
                    <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Últimas Interações:</span>
                    {activeStory.replies.map((rep) => (
                      <div key={rep.id} className="text-xs text-zinc-200 flex items-start gap-1.5">
                        <span className="font-extrabold text-white text-[11px]">@{rep.username}:</span>
                        <p className="italic leading-snug">{rep.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* REPLY INPUT TEXT FORM */}
                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                  <input
                    id="story-reply-text-input"
                    type="text"
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    placeholder={`Responder a @${activeUserDeck.user.username}...`}
                    className="flex-1 text-xs px-4 py-3 bg-black/70 text-white rounded-2xl border border-zinc-850 focus:border-purple-500 outline-none placeholder-zinc-550 transition-all focus:ring-1 focus:ring-purple-600"
                    required
                  />
                  <button
                    id="submit-story-reply-btn"
                    type="submit"
                    disabled={!replyInput.trim() || sendingReply}
                    className="p-3 rounded-2xl brand-gradient-bg text-white hover:opacity-95 active:scale-95 transition-all cursor-pointer shadow disabled:opacity-50 shrink-0"
                  >
                    {sendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
