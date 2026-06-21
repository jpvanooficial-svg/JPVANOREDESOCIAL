import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import { UserProfile, Post, Comment } from "../types";
import { sendAppNotification } from "../lib/notifications";
import StoriesSection from "./StoriesSection";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Heart,
  MessageCircle,
  Send,
  Trash2,
  AlertTriangle,
  Sparkles,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  MoreHorizontal,
  Loader2,
  PlusCircle,
  Globe,
  Users,
  Check,
  X,
  BadgeCheck,
  Volume2,
  Music,
  Film,
  Disc,
} from "lucide-react";

interface FeedSectionProps {
  currentUserProfile: UserProfile;
  initialSelectedPostId?: string; // option to auto focus standard post from dashboard notifs
  onUserSelect?: (userId: string) => void;
}

export default function FeedSection({
  currentUserProfile,
  initialSelectedPostId,
  onUserSelect,
}: FeedSectionProps) {
  const [feedMode, setFeedMode] = useState<"global" | "following" | "reels">("global");
  const [posts, setPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // Songs selections
  const [songs, setSongs] = useState<any[]>([]);
  const [selectedSong, setSelectedSong] = useState<any | null>(null);
  const [songStartSeconds, setSongStartSeconds] = useState<number>(0);
  const [songEndSeconds, setSongEndSeconds] = useState<number>(15);
  const [songPlayDuration, setSongPlayDuration] = useState<number>(15);
  const [isSavingSongMetadata, setIsSavingSongMetadata] = useState(false);
  const [isPostReel, setIsPostReel] = useState(false);
  const [songsModalOpen, setSongsModalOpen] = useState(false);

  // Audio system for post music segments
  const [activePlaybackPostId, setActivePlaybackPostId] = useState<string | null>(null);
  const playbackTimerRef = useRef<any>(null);
  const audioObjRef = useRef<HTMLAudioElement | null>(null);

  // Post composer state
  const [textComposer, setTextComposer] = useState("");
  const [mediaData, setMediaData] = useState<{ base64: string; mimeType: string; ext: string } | null>(null);
  const [mediaPreviewType, setMediaPreviewType] = useState<"image" | "video" | "audio" | null>(null);
  const [composing, setComposing] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Audio recording states
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Active post comments overlay modal
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [commentReplyTo, setCommentReplyTo] = useState<Comment | null>(null);
  const [commentsList, setCommentsList] = useState<Comment[]>([]);

  // Feedback notifications
  const [alertText, setAlertText] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Listen to active following IDs of the current logged-in user in real-time
  useEffect(() => {
    const qFollows = query(
      collection(db, "follows"),
      where("followerId", "==", currentUserProfile.id)
    );
    const unsubscribeFollows = onSnapshot(qFollows, (snap) => {
      const ids: string[] = [];
      snap.forEach((d) => {
        ids.push(d.data().followingId);
      });
      setFollowingIds(ids);
    }, (error) => {
      console.warn("Follows snapshot error:", error);
    });

    return () => unsubscribeFollows();
  }, [currentUserProfile.id]);

  // 1.5. Real-time subscription to admin-uploaded songs
  useEffect(() => {
    const unsubSongs = onSnapshot(collection(db, "songs"), (snap) => {
      const sList: any[] = [];
      snap.forEach((d) => {
        sList.push({ id: d.id, ...d.data() });
      });
      setSongs(sList);
    }, (error) => {
      console.warn("Songs snapshot error:", error);
    });
    return () => unsubSongs();
  }, []);

  // 2. Listen to global Posts feed in real-time (pure WebSockets onSnapshot event-driven)
  useEffect(() => {
    const unsubPosts = onSnapshot(collection(db, "posts"), (snapshot) => {
      const pList: Post[] = [];
      snapshot.forEach((d) => {
        pList.push({ id: d.id, ...d.data() } as Post);
      });
 
      // Sort newest first
      pList.sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt) || 0);
      setPosts(pList);
    }, (error) => {
      console.warn("Posts snapshot error:", error);
    });
 
    return () => unsubPosts();
  }, []);
 
  // 3. Reactively filter posts based on selected feed filter (Global, Following or Reels)
  useEffect(() => {
    if (feedMode === "following") {
      // Filter where post creator is followed by currentUser
      const relative = posts.filter((p) => (followingIds.includes(p.userId) || p.userId === currentUserProfile.id) && !p.isReel);
      setFilteredPosts(relative);
    } else if (feedMode === "reels") {
      // Filter only short video reels
      const relative = posts.filter((p) => p.isReel === true);
      setFilteredPosts(relative);
    } else {
      // Global feed: standard posts only
      const relative = posts.filter((p) => !p.isReel);
      setFilteredPosts(relative);
    }
  }, [posts, feedMode, followingIds, currentUserProfile.id]);

  // 4. Focus post from outer notifications if specified immediately
  useEffect(() => {
    if (initialSelectedPostId) {
      const item = posts.find((p) => p.id === initialSelectedPostId);
      if (item) setActiveCommentPost(item);
    }
  }, [initialSelectedPostId, posts]);

  // 5. Watch selected Post comments in real-time snapshot
  useEffect(() => {
    if (!activeCommentPost) {
      setCommentsList([]);
      setCommentReplyTo(null);
      return;
    }

    const qComments = query(
      collection(db, "comments"),
      where("postId", "==", activeCommentPost.id)
    );

    const unsubComments = onSnapshot(qComments, (snapshot) => {
      const cList: Comment[] = [];
      snapshot.forEach((d) => {
        cList.push({ id: d.id, ...d.data() } as Comment);
      });
      // Sort oldest first (natural conversation thread)
      cList.sort((a, b) => a.createdAt?.localeCompare?.(b.createdAt) || 0);
      setCommentsList(cList);
    }, (error) => {
      console.warn("Comments snapshot error:", error);
    });

    return () => unsubComments();
  }, [activeCommentPost]);

  // Call Gemini AI Auto Caption Helper via Server SDK Proxy
  const generateAICaption = async () => {
    setAiGenerating(true);
    try {
      const payload: any = {
        prompt: textComposer.trim() || "Crie uma legenda sobre estar se divertindo nas redes sociais hoje!",
      };
      if (mediaData && mediaPreviewType === "image") {
        payload.mediaBase64 = mediaData.base64;
        payload.mimeType = mediaData.mimeType;
      }

      const res = await fetch("/api/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.text) {
        setTextComposer(data.text);
        setAlertText("✨ Legenda reescrita pelo JPvano AI!");
        setTimeout(() => setAlertText(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setAlertText("⚠️ Falha ao se conectar com JPvano AI");
      setTimeout(() => setAlertText(null), 3000);
    } finally {
      setAiGenerating(false);
    }
  };

  // Upload and handle media picker local files
  const handleMediaAttach = (type: "image" | "video") => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "image" ? "image/*" : "video/*";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setAlertText("⚠️ Arquivo excedeu o limite máximo de 15MB");
      setTimeout(() => setAlertText(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const parsedExt = file.name.split(".").pop() || "bin";
      setMediaData({
        base64: result,
        mimeType: file.type,
        ext: parsedExt,
      });
      setMediaPreviewType(file.type.startsWith("image/") ? "image" : "video");
    };
    reader.readAsDataURL(file);
  };

  // MICROPHONE VOICE CAPTURE IMPLEMENTATION (audio posts)
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
          setMediaData({
            base64: reader.result as string,
            mimeType: "audio/webm",
            ext: "webm",
          });
          setMediaPreviewType("audio");
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.warn("Could not start recording audio context:", err);
    }
  };

  const stopRecordingAudio = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Clear drafts
  const handleDiscardComposerMedia = () => {
    setMediaData(null);
    setMediaPreviewType(null);
  };

  const handleSelectSongAndPreload = (song: any) => {
    setSelectedSong(song);
    const start = typeof song.startSec === "number" ? song.startSec : 0;
    const end = typeof song.endSec === "number" ? song.endSec : 15;
    setSongStartSeconds(start);
    setSongEndSeconds(end);
    setSongPlayDuration(end - start > 0 ? end - start : 15);
  };

  const handleSaveSongMetadataToFirestore = async () => {
    if (!selectedSong) return;
    setIsSavingSongMetadata(true);
    try {
      await updateDoc(doc(db, "songs", selectedSong.id), {
        startSec: songStartSeconds,
        endSec: songEndSeconds,
        duration: songEndSeconds - songStartSeconds > 0 ? songEndSeconds - songStartSeconds : 15
      });
      setSelectedSong((prev: any) => prev ? {
        ...prev,
        startSec: songStartSeconds,
        endSec: songEndSeconds
      } : prev);
      setAlertText("✨ Ajustes de áudio salvos com sucesso no Firestore!");
      setTimeout(() => setAlertText(null), 3500);
    } catch (err: any) {
      console.error(err);
      setAlertText(`❌ Erro ao salvar: ${err.message}`);
      setTimeout(() => setAlertText(null), 3500);
    } finally {
      setIsSavingSongMetadata(false);
    }
  };

  const startSegmentPlayback = (postId: string, songURL: string, startSec: number, duration: number) => {
    // If already playing this post, stop it!
    if (activePlaybackPostId === postId) {
      stopSegmentPlayback();
      return;
    }

    stopSegmentPlayback();

    const audio = new Audio(songURL);
    audioObjRef.current = audio;
    setActivePlaybackPostId(postId);

    audio.currentTime = startSec || 0;
    audio.volume = 0.8;
    audio.play().catch(err => {
      console.warn("Audio play prevented:", err);
    });

    playbackTimerRef.current = setTimeout(() => {
      stopSegmentPlayback();
    }, (duration || 15) * 1000);
  };

  const stopSegmentPlayback = () => {
    if (audioObjRef.current) {
      audioObjRef.current.pause();
      audioObjRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setActivePlaybackPostId(null);
  };

  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      if (audioObjRef.current) {
        audioObjRef.current.pause();
      }
    };
  }, []);

  // Create post submit payload handler
  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textComposer.trim() && !mediaData) {
      setAlertText("⚠️ Escreva ou selecione uma mídia antes de postar");
      setTimeout(() => setAlertText(null), 3500);
      return;
    }

    setComposing(true);
    try {
      let finalMediaUrl = "";
      let type: "text" | "image" | "video" | "audio" = "text";

      // 1. If media has been attached, upload to server disk to avoid 1MB Firestore limitations!
      if (mediaData) {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: mediaData.base64,
            originalMimeType: mediaData.mimeType,
            extension: mediaData.ext,
          }),
        });
        const uploadResult = await res.json();
        if (uploadResult.url) {
          finalMediaUrl = uploadResult.url;
          type = uploadResult.type;
        }
      }

      // 2. Save complete Post element doc in Firestore
      await addDoc(collection(db, "posts"), {
        userId: currentUserProfile.id,
        username: currentUserProfile.username,
        userPhotoURL: currentUserProfile.photoURL || "",
        userVerified: currentUserProfile.verified,
        type,
        mediaURL: finalMediaUrl,
        caption: textComposer.trim(),
        likes: [],
        commentsCount: 0,
        reportsCount: 0,
        createdAt: new Date().toISOString(),
        // Music & Reels metadata extension fields
        songId: selectedSong ? selectedSong.id : "",
        songTitle: selectedSong ? selectedSong.title : "",
        songArtist: selectedSong ? selectedSong.artist : "",
        songURL: selectedSong ? (selectedSong.audioURL || selectedSong.url || "") : "",
        songStartSec: selectedSong ? songStartSeconds : 0,
        songDuration: selectedSong ? songPlayDuration : 15,
        isReel: isPostReel,
      });

      // 3. Clear composer state upon successful addition
      setTextComposer("");
      setMediaData(null);
      setMediaPreviewType(null);
      setSelectedSong(null);
      setSongStartSeconds(0);
      setSongPlayDuration(15);
      setIsPostReel(false);
      setAlertText("✨ Publicado com sucesso!");
      setTimeout(() => setAlertText(null), 3000);

    } catch (err: any) {
      console.error(err);
      setAlertText(`⚠️ Erro ao publicar: ${err.message || "tente de novo"}`);
      setTimeout(() => setAlertText(null), 3000);
    } finally {
      setComposing(false);
    }
  };

  // Likes trigger
  const handleLikePost = async (post: Post) => {
    const isLiked = post.likes?.includes(currentUserProfile.id);
    const nextLikes = isLiked
      ? post.likes.filter((uid) => uid !== currentUserProfile.id)
      : [...(post.likes || []), currentUserProfile.id];

    try {
      await updateDoc(doc(db, "posts", post.id), {
        likes: nextLikes,
      });

      // Notify profile creator when liked
      if (!isLiked) {
        await sendAppNotification(
          post.userId,
          currentUserProfile.id,
          currentUserProfile.username,
          currentUserProfile.photoURL,
          "like",
          "curtiu sua publicação!",
          post.id
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create post comments
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommentPost || !commentInput.trim()) return;

    const textToSubmit = commentInput.trim();
    setCommentInput("");

    // Read the parentId if we are responding to some specific existing comments thread
    const parentIdValue = commentReplyTo ? commentReplyTo.id : null;
    const authorOfOrigComment = commentReplyTo ? commentReplyTo.userId : activeCommentPost.userId;

    setCommentReplyTo(null);

    try {
      // 1. Write the new subcomment
      await addDoc(collection(db, "comments"), {
        postId: activeCommentPost.id,
        userId: currentUserProfile.id,
        username: currentUserProfile.username,
        userPhotoURL: currentUserProfile.photoURL || "",
        text: textToSubmit,
        parentId: parentIdValue,
        createdAt: new Date().toISOString(),
      });

      // 2. Atomically increment comment tally in post doc
      const updatedCount = (activeCommentPost.commentsCount || 0) + 1;
      await updateDoc(doc(db, "posts", activeCommentPost.id), {
        commentsCount: updatedCount,
      });

      // 3. Update parent references
      setActiveCommentPost((prev) => (prev ? { ...prev, commentsCount: updatedCount } : null));

      // 4. Trigger notifications alerts
      await sendAppNotification(
        authorOfOrigComment,
        currentUserProfile.id,
        currentUserProfile.username,
        currentUserProfile.photoURL,
        "comment",
        parentIdValue ? "respondeu ao seu comentário!" : "comentou na sua publicação!",
        activeCommentPost.id
      );

    } catch (err) {
      console.error(err);
    }
  };

  // Submit Community Report on malicious Post
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportPostId || !reportReason.trim()) return;

    try {
      const selectedPost = posts.find((p) => p.id === reportPostId);
      await addDoc(collection(db, "reports"), {
        postId: reportPostId,
        postCaption: selectedPost?.caption || "",
        postUsername: selectedPost?.username || "",
        reporterId: currentUserProfile.id,
        reporterUsername: currentUserProfile.username,
        reason: reportReason.trim(),
        createdAt: new Date().toISOString(),
      });

      // Increment reports tag count of the post doc
      const reportsCount = (selectedPost?.reportsCount || 0) + 1;
      await updateDoc(doc(db, "posts", reportPostId), {
         reportsCount,
      });

      setReportPostId(null);
      setReportReason("");
      setAlertText("🚨 Publicidade denunciada. Obrigado por ajudar a proteger o JPvano!");
      setTimeout(() => setAlertText(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete own/collaborative post and clean associations
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm("Deseja realmente excluir esta publicação permanentemente?")) return;

    try {
      await deleteDoc(doc(db, "posts", postId));
      
      // Clean up comments of post
      const qC = query(collection(db, "comments"), where("postId", "==", postId));
      const qCSnap = await getDocs(qC);
      const batch = writeBatch(db);
      qCSnap.forEach((cd) => batch.delete(cd.ref));
      await batch.commit();

      setAlertText("🗑️ Publicação deletada com sucesso.");
      setTimeout(() => setAlertText(null), 2500);
      if (activeCommentPost?.id === postId) setActiveCommentPost(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 font-sans animate-fade-in text-zinc-100 select-none">
      
      {alertText && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-purple-500 rounded-2xl p-4 text-xs font-semibold shadow-2xl animate-fade-in flex items-center gap-2">
          <span>{alertText}</span>
        </div>
      )}

      {/* FEED FILTER SELECTORS BAR */}
      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2.5 rounded-2xl mb-6 shadow-md">
        <button
          id="feed-switch-global-btn"
          onClick={() => setFeedMode("global")}
          className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            feedMode === "global"
              ? "bg-purple-660 text-white shadow font-bold brand-gradient-bg glow-logo"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Globe className="h-4 w-4" />
          Feed Global
        </button>

        <button
          id="feed-switch-following-btn"
          onClick={() => setFeedMode("following")}
          className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            feedMode === "following"
              ? "bg-purple-660 text-white shadow font-bold brand-gradient-bg glow-logo"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Users className="h-4 w-4" />
          Meus Círculos
        </button>

        <button
          id="feed-switch-reels-btn"
          onClick={() => setFeedMode("reels")}
          className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            feedMode === "reels"
              ? "bg-purple-660 text-white shadow font-bold brand-gradient-bg glow-logo"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Film className="h-4 w-4" />
          Reels Curto
        </button>
      </div>

      {/* NEW POST COMPOSER PANEL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-5 mb-8 shadow-xl relative">
        <div className="flex gap-3">
          <img
            src={currentUserProfile.photoURL}
            alt="My Portrait"
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-purple-500"
            referrerPolicy="no-referrer"
          />
          <div className="flex-1 space-y-3 min-w-0">
            <textarea
              id="feed-composer-textarea"
              value={textComposer}
              onChange={(e) => setTextComposer(e.target.value)}
              placeholder="O que está acontecendo por aí? Compartilhe na JPvano..."
              rows={3}
              disabled={composing}
              className="w-full bg-zinc-950/60 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-500 text-xs p-3 transition-all resize-none"
            />

            {/* ATTACHMENT PREVIEWS AREA */}
            {mediaPreviewType && mediaData && (
              <div className="relative inline-block border border-zinc-800 rounded-2xl overflow-hidden mt-2 bg-zinc-950 p-2">
                {mediaPreviewType === "image" && (
                  <img src={mediaData.base64} alt="Attach Preview" className="max-h-48 rounded-xl object-contain" />
                )}

                {mediaPreviewType === "video" && (
                  <video src={mediaData.base64} controls className="max-h-48 rounded-xl" />
                )}

                {mediaPreviewType === "audio" && (
                  <div className="flex items-center gap-2 p-2 bg-zinc-900 rounded-3xl border border-zinc-800">
                    <span className="text-xl">🎙️</span>
                    <audio src={mediaData.base64} controls className="h-8 w-44 custom-audio-player" />
                  </div>
                )}

                <button
                  id="feed-discard-attach-btn"
                  onClick={handleDiscardComposerMedia}
                  className="absolute top-3 right-3 p-1.5 bg-zinc-950/70 hover:bg-zinc-900 text-white rounded-full cursor-pointer hover:text-rose-400 transition-all border border-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* SELECTED SONG INFO IN COMPOSER */}
            {selectedSong && (
              <div className="flex items-center justify-between gap-3 bg-purple-950/20 border border-purple-500/30 rounded-xl p-3 animate-fade-in mt-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 animate-pulse">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-zinc-100 block truncate">{selectedSong.title}</span>
                    <span className="text-[10px] text-zinc-400 block truncate leading-none mt-1">
                      {selectedSong.artist} • {songStartSeconds}s até {songEndSeconds}s ({songPlayDuration}s)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSong(null)}
                  className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg cursor-pointer transition-all"
                  title="Remover Música"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* CONTROLS BAR OF POST COMPOSER */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-850 pt-3 select-none">
              
              {/* Media attaches controls */}
              <div className="flex items-center gap-2">
                <button
                  id="attach-image-composer-btn"
                  type="button"
                  onClick={() => handleMediaAttach("image")}
                  disabled={composing}
                  className="p-2 bg-zinc-950/40 hover:bg-zinc-800/80 rounded-xl text-zinc-400 hover:text-white border border-zinc-800/60 cursor-pointer text-xs transition-all flex items-center gap-1"
                  title="Anexar Imagem"
                >
                  <ImageIcon className="h-4.5 w-4.5 text-pink-500" />
                  <span className="hidden sm:inline">Imagem</span>
                </button>
 
                <button
                  id="attach-video-composer-btn"
                  type="button"
                  onClick={() => handleMediaAttach("video")}
                  disabled={composing}
                  className="p-2 bg-zinc-950/40 hover:bg-zinc-800/80 rounded-xl text-zinc-400 hover:text-white border border-zinc-800/60 cursor-pointer text-xs transition-all flex items-center gap-1"
                  title="Anexar Vídeo"
                >
                  <VideoIcon className="h-4.5 w-4.5 text-amber-500" />
                  <span className="hidden sm:inline">Vídeo</span>
                </button>
 
                {recording ? (
                  <button
                    id="stop-audio-composer-btn"
                    type="button"
                    onClick={stopRecordingAudio}
                    className="p-2 px-3 bg-rose-600/10 border border-rose-600 text-rose-400 font-bold hover:bg-rose-600 hover:text-white rounded-xl cursor-pointer text-xs transition-all flex items-center gap-1 animate-pulse"
                  >
                    Parar Mic
                  </button>
                ) : (
                  <button
                    id="start-audio-composer-btn"
                    type="button"
                    onClick={startRecordingAudio}
                    disabled={composing}
                    className="p-2 bg-zinc-950/40 hover:bg-zinc-800/80 rounded-xl text-zinc-400 hover:text-white border border-zinc-800/60 cursor-pointer text-xs transition-all flex items-center gap-1"
                    title="Gravar Áudio"
                  >
                    <Mic className="h-4.5 w-4.5 text-purple-400" />
                    <span className="hidden sm:inline">Voz</span>
                  </button>
                )}
 
                <input
                  id="feed-generic-picker"
                  type="file"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  className="hidden"
                />

                {/* SELECT MUSIC BUTTON FOR POST */}
                <button
                  id="attach-song-composer-btn"
                  type="button"
                  onClick={() => setSongsModalOpen(true)}
                  disabled={composing}
                  className="p-2 bg-zinc-950/40 hover:bg-zinc-800/80 rounded-xl text-zinc-450 hover:text-white border border-zinc-800/60 cursor-pointer text-xs transition-all flex items-center gap-1"
                  title="Adicionar Música de Fundo"
                >
                  <Music className="h-4 w-4 text-purple-400" />
                  <span className="hidden sm:inline">Música</span>
                </button>

                {/* DYNAMIC REELS TOGGLE IF VIDEO MEDIA IS ATTACHED */}
                {mediaPreviewType === "video" && (
                  <button
                    id="toggle-reels-composer-btn"
                    type="button"
                    onClick={() => setIsPostReel(!isPostReel)}
                    disabled={composing}
                    className={`p-2 rounded-xl text-xs transition-all flex items-center gap-1 border cursor-pointer ${
                      isPostReel
                        ? "bg-purple-950/50 border-purple-500 text-purple-300 font-black"
                        : "bg-zinc-950/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-white border-zinc-800/60"
                    }`}
                    title="Publicar no Reel Feed"
                  >
                    <Film className="h-4 w-4 text-pink-400" />
                    <span>Vídeo Reels</span>
                  </button>
                )}
              </div>

              {/* Submit panel */}
              <div className="flex items-center gap-2 ml-auto">
                {/* GEMINI INTEGRATED CAPTION WRITER */}
                <button
                  id="ai-caption-composer-btn"
                  type="button"
                  onClick={generateAICaption}
                  disabled={aiGenerating || composing}
                  className="p-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="JPvano AI escreve uma legenda inteligente"
                >
                  {aiGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>Auxiliar IA</span>
                </button>

                <button
                  id="publish-feed-composer-btn"
                  type="button"
                  onClick={handlePublishPost}
                  disabled={composing}
                  className="px-5 py-2 rounded-xl text-xs font-bold font-display text-white brand-gradient-bg cursor-pointer hover:opacity-95 active:scale-95 transition-all outline-none"
                >
                  {composing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    "Publicar"
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* STORIES BAR */}
      <StoriesSection currentUserProfile={currentUserProfile} />

      {/* FEED LISTINGS */}
      <div className="space-y-6">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900 border border-zinc-850 rounded-2xl p-6">
            <Globe className="h-10 w-10 text-zinc-650 mx-auto mb-2 opacity-50" />
            <h4 className="text-sm font-bold text-zinc-450 font-display">Sem novidades no momento</h4>
            <p className="text-xs text-zinc-650 mt-1">Seja o primeiro a contar uma fofoca ou postar sua arte!</p>
          </div>
        ) : feedMode === "reels" ? (
          /* CINEMATIC REELS VIEW GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-center max-w-4xl mx-auto">
            {filteredPosts.map((post) => {
              const isLikedByMe = post.likes?.includes(currentUserProfile.id);
              const isSovereignUser =
                currentUserProfile.role === "root_admin" ||
                currentUserProfile.role === "admin" ||
                post.userId === currentUserProfile.id;

              return (
                <div
                  key={post.id}
                  className="bg-black border border-zinc-800 rounded-[32px] overflow-hidden relative shadow-2xl animate-fade-in w-full max-w-[360px] h-[580px] mx-auto flex flex-col justify-end"
                >
                  {/* REEL PLAYER INTERFACES */}
                  <div className="absolute inset-0 z-0 bg-zinc-950 flex items-center justify-center">
                    {post.type === "video" && post.mediaURL ? (
                      <video
                        src={post.mediaURL}
                        controls={false}
                        autoPlay
                        loop
                        playsInline
                        muted={activePlaybackPostId !== post.id}
                        className="w-full h-full object-cover"
                      />
                    ) : post.type === "image" && post.mediaURL ? (
                      <img
                        src={post.mediaURL}
                        alt="Reel content"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <span className="text-4xl block mb-2">🎬</span>
                        <p className="text-xs text-zinc-500 font-mono">Vídeo ausente</p>
                      </div>
                    )}
                    {/* Shadow overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40 pointer-events-none" />
                  </div>

                  {/* FLOATING ADMIN DELETE BUTTON */}
                  {isSovereignUser && (
                    <button
                      id={`delete-reel-post-${post.id}`}
                      onClick={() => handleDeletePost(post.id)}
                      className="absolute top-4 left-4 p-2.5 bg-black/60 hover:bg-rose-600/80 rounded-full text-white cursor-pointer hover:scale-105 transition-all z-20"
                      title="Excluir Reel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    id={`report-reel-post-btn-${post.id}`}
                    onClick={() => setReportPostId(post.id)}
                    className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-amber-600/80 rounded-full text-white cursor-pointer hover:scale-105 transition-all z-20"
                    title="Denunciar Reel"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>

                  {/* FLOATING ENGAGEMENT BAR ON RIGHT OVERLAY */}
                  <div className="absolute right-4 bottom-24 flex flex-col items-center gap-4.5 z-10 select-none">
                    {/* Like reel button */}
                    <button
                      onClick={() => handleLikePost(post)}
                      className="group flex flex-col items-center cursor-pointer active:scale-95 transition-all"
                    >
                      <div className={`p-3 rounded-full backdrop-blur-md transition-all shadow-md ${
                        isLikedByMe ? "bg-rose-500 text-white" : "bg-black/40 text-zinc-300 group-hover:bg-black/60"
                      }`}>
                        <Heart className={`h-5 w-5 ${isLikedByMe ? "fill-white" : ""}`} />
                      </div>
                      <span className="text-[10px] font-black text-rose-400 mt-1 shadow-sm font-sans">{post.likes?.length || 0}</span>
                    </button>

                    {/* Comment reel button */}
                    <button
                      onClick={() => setActiveCommentPost(post)}
                      className="group flex flex-col items-center cursor-pointer active:scale-95 transition-all"
                    >
                      <div className="p-3 rounded-full bg-black/40 hover:bg-black/60 text-zinc-300 backdrop-blur-md transition-all shadow-md">
                        <MessageCircle className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black text-purple-400 mt-1 shadow-sm font-sans">{post.commentsCount || 0}</span>
                    </button>

                    {/* Vinyl disc music rotator */}
                    {post.songURL && (
                      <button
                        onClick={() => startSegmentPlayback(post.id, post.songURL || "", post.songStartSec || 0, post.songDuration || 15)}
                        className="group flex flex-col items-center cursor-pointer active:scale-95 transition-all"
                        title={post.songTitle}
                      >
                        <div className={`p-3 rounded-full backdrop-blur-md transition-all shadow-md border ${
                          activePlaybackPostId === post.id 
                            ? "bg-rose-600 border-rose-500 text-white animate-spin" 
                            : "bg-black/40 border-zinc-850 text-purple-300 hover:bg-black/60"
                        }`}>
                          <Disc className="h-5 w-5" />
                        </div>
                        <span className="text-[8px] font-bold text-zinc-400 mt-1 block max-w-10 truncate">{post.songTitle}</span>
                      </button>
                    )}
                  </div>

                  {/* BOTTOM REEL DETAILS TEXT OVERLAY */}
                  <div className="p-5 space-y-3.5 z-10 overflow-hidden w-full select-text select-none">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={post.userPhotoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80"}
                        alt={post.username}
                        className="w-9 h-9 rounded-full border border-purple-500 object-cover shrink-0 cursor-pointer"
                        onClick={() => onUserSelect?.(post.userId)}
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span
                            onClick={() => onUserSelect?.(post.userId)}
                            className="font-bold text-xs text-white cursor-pointer truncate max-w-32 hover:underline"
                          >
                            @{post.username}
                          </span>
                          {post.userVerified && <BadgeCheck className="h-3.5 w-3.5 text-white fill-blue-500 shrink-0" />}
                        </div>
                        <span className="text-[9px] text-zinc-400 block font-mono">Reels Curto</span>
                      </div>
                    </div>

                    {post.caption && (
                      <p className="text-xs text-zinc-100 leading-tight max-w-full truncate font-sans line-clamp-2">
                        {post.caption}
                      </p>
                    )}

                    {/* MUSIC TICKER BOTTOM */}
                    {post.songURL && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-zinc-200">
                        <Music className="h-3.5 w-3.5 text-purple-400 shrink-0 animate-pulse" />
                        <div className="overflow-hidden relative flex-1">
                          <p className="whitespace-nowrap font-semibold truncate animate-marquee">
                            {post.songTitle} • {post.songArtist}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* TRADITIONAL COMPACT GRAPHIC FEED LISTING */
          filteredPosts.map((post) => {
            const isLikedByMe = post.likes?.includes(currentUserProfile.id);
            const isSovereignUser =
              currentUserProfile.role === "root_admin" ||
              currentUserProfile.role === "admin" ||
              post.userId === currentUserProfile.id;

            return (
              <div
                key={post.id}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden p-4 md:p-5 shadow-lg relative glow-logo space-y-4 animate-fade-in"
              >
                {/* POST AUTHOR SECTION */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={post.userPhotoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80"}
                      alt={post.username}
                      onClick={() => onUserSelect?.(post.userId)}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border border-zinc-800 cursor-pointer hover:border-purple-500 transition-all select-none"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          onClick={() => onUserSelect?.(post.userId)}
                          className="font-extrabold text-sm text-white hover:underline cursor-pointer"
                        >
                          @{post.username}
                        </span>
                        {post.userVerified && (
                          <BadgeCheck className="h-3.5 w-3.5 text-white fill-blue-500 shrink-0" />
                        )}
                        {post.userId === "joaopedromoladeoliveira@gmail.com" && (
                          <span className="p-0.5 px-2 bg-amber-500/10 text-[8px] text-amber-400 rounded-full font-black">ROOT</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-550 block font-sans">
                        {post.createdAt ? new Date(post.createdAt).toLocaleString() : "-"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 select-none">
                    {/* Delete options */}
                    {isSovereignUser && (
                      <button
                        id={`delete-feed-post-${post.id}`}
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 hover:text-rose-500 rounded-lg text-zinc-650 hover:bg-zinc-850/60 transition-color cursor-pointer"
                        title="Excluir Postagem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      id={`report-feed-post-btn-${post.id}`}
                      onClick={() => setReportPostId(post.id)}
                      className="p-1.5 hover:text-amber-500 rounded-lg text-zinc-650 hover:bg-zinc-850/60 transition-color cursor-pointer"
                      title="Denunciar Postagem"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* POST BODY CONTENT */}
                <div className="space-y-3">
                  {post.caption && (
                    <p className="text-xs md:text-sm text-zinc-200 leading-relaxed max-w-full whitespace-pre-line font-sans select-text">
                      {post.caption}
                    </p>
                  )}

                  {/* Rendering image attachment */}
                  {post.type === "image" && post.mediaURL && (
                    <div className="rounded-2xl overflow-hidden border border-zinc-850 bg-zinc-950/50 max-h-[450px] relative select-none">
                      <img
                        src={post.mediaURL}
                        alt="Post attachment JPvano"
                        className="w-full object-contain max-h-[450px] mx-auto filter brightness-95"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  {/* Rendering video attachments */}
                  {post.type === "video" && post.mediaURL && (
                    <div className="rounded-2xl overflow-hidden border border-zinc-850 bg-zinc-950/50 max-h-[400px] select-none">
                      <video
                        src={post.mediaURL}
                        controls
                        className="w-full max-h-[400px] object-contain mx-auto"
                      />
                    </div>
                  )}

                  {/* Rendering voice/audio attachments */}
                  {post.type === "audio" && post.mediaURL && (
                    <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-2xl border border-zinc-850 align-middle shadow max-w-sm select-none">
                      <span className="text-2xl">🎙️</span>
                      <div className="flex-1">
                        <span className="text-[10px] text-zinc-550 block mb-1">Mensagem de Voz JPvano</span>
                        <audio src={post.mediaURL} controls className="w-full h-8 custom-audio-player contrast-110" />
                      </div>
                    </div>
                  )}

                  {/* Rendering custom background music segment bar */}
                  {post.songURL && (
                    <div className="flex items-center justify-between gap-3 bg-purple-950/20 border border-purple-500/20 rounded-2xl p-3 select-none animate-fade-in max-w-md">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => startSegmentPlayback(post.id, post.songURL || "", post.songStartSec || 0, post.songDuration || 15)}
                          className={`p-2.5 rounded-full cursor-pointer transition-all flex items-center justify-center border shadow ${
                            activePlaybackPostId === post.id
                              ? "bg-rose-500/15 border-rose-500 text-rose-400"
                              : "bg-purple-500/20 border-purple-500 text-purple-300 hover:bg-purple-500/30"
                          }`}
                        >
                          {activePlaybackPostId === post.id ? (
                            <Disc className="h-5 w-5 animate-spin" />
                          ) : (
                            <Volume2 className="h-5 w-5" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-zinc-100 block truncate">{post.songTitle}</span>
                          <span className="text-[10px] text-zinc-400 block truncate leading-none mt-1">
                            {post.songArtist} • 🎵 Trecho de {post.songDuration || 15}s
                          </span>
                        </div>
                      </div>

                      {activePlaybackPostId === post.id && (
                        <div className="flex gap-0.5 items-end h-3 pr-2">
                          <div className="w-0.5 h-full bg-rose-400 rounded-full animate-pulse" />
                          <div className="w-0.5 h-2 bg-rose-450 rounded-full animate-pulse delay-75" />
                          <div className="w-0.5 h-3.5 bg-rose-450 rounded-full animate-pulse delay-150" />
                          <div className="w-0.5 h-1.5 bg-rose-440 rounded-full animate-pulse delay-300" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* POST ENGAGEMENT RATIOS TAB */}
                <div className="flex items-center gap-6 border-t border-zinc-850 pt-3 text-xs select-none">
                  <button
                    id={`like-post-btn-${post.id}`}
                    onClick={() => handleLikePost(post)}
                    className={`flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-all ${
                      isLikedByMe ? "text-rose-500 font-bold" : "text-zinc-650 hover:text-rose-500"
                    }`}
                  >
                    <Heart className={`h-4.5 w-4.5 ${isLikedByMe ? "fill-rose-500" : ""}`} />
                    <span>{post.likes?.length || 0}</span>
                  </button>

                  <button
                    id={`comment-post-btn-${post.id}`}
                    onClick={() => setActiveCommentPost(post)}
                    className="flex items-center gap-1.5 text-zinc-650 hover:text-purple-400 cursor-pointer hover:scale-105 active:scale-95 transition-all"
                  >
                    <MessageCircle className="h-4.5 w-4.5" />
                    <span>{post.commentsCount || 0}</span>
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* COMMENTS SHEET/MODAL OVERLAY (NATIVE REALTIME ON-DOC) */}
      {activeCommentPost && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg p-6 relative font-sans shadow-2xl animate-fade-in flex flex-col max-h-[85vh] overflow-hidden">
            <button
              id="close-comments-modal-btn"
              onClick={() => {
                setActiveCommentPost(null);
                setCommentReplyTo(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all border border-zinc-800/20"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold font-display text-white mb-3">Discussão Pública</h3>
            
            {/* Short preview of original post caption */}
            <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-850 text-xs mb-4 flex items-start gap-2 max-h-[20vh] overflow-y-auto">
              <span className="font-extrabold text-purple-400">@{activeCommentPost.username}:</span>
              <p className="text-zinc-300 italic whitespace-pre-wrap leading-relaxed">&ldquo;{activeCommentPost.caption}&rdquo;</p>
            </div>

            {/* COMMENTS TRAIL VIEW */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-2">
              {commentsList.length === 0 ? (
                <p className="text-center py-10 text-zinc-550 italic text-xs">Sem comentários. Comece a discussão!</p>
              ) : (
                commentsList.map((comm) => (
                  <div key={comm.id} className="bg-zinc-950 p-3 rounded-2xl border border-zinc-850 animate-fade-in flex gap-3">
                    <img
                      src={comm.userPhotoURL}
                      alt={comm.username}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-zinc-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-extrabold text-xs text-white">@{comm.username}</span>
                        <span className="text-[9px] text-zinc-500">
                          {comm.createdAt ? new Date(comm.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-350 break-words leading-relaxed">{comm.text}</p>
                      
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          id={`reply-comment-btn-${comm.id}`}
                          onClick={() => setCommentReplyTo(comm)}
                          className="text-[10px] text-purple-400 hover:underline font-semibold cursor-pointer"
                        >
                          Responder
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* REPLYING FOOTER NOTICE */}
            {commentReplyTo && (
              <div className="bg-purple-650/10 p-2 text-[11px] border-l-4 border-purple-500 flex justify-between items-center rounded mt-3 shrink-0">
                <span className="text-purple-300">
                  Respondendo ao comentário de <strong>@{commentReplyTo.username}</strong>
                </span>
                <button
                  id="cancel-reply-btn"
                  onClick={() => setCommentReplyTo(null)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* COMPOSER OF COMMENT */}
            <form onSubmit={handleAddComment} className="mt-4 border-t border-zinc-800 pt-3 shrink-0 flex items-center gap-2">
              <input
                id="comment-text-input"
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={commentReplyTo ? "Digite sua resposta..." : "Escreva um comentário público..."}
                className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-650 text-xs transition-all"
                required
              />
              <button
                id="comment-submit-btn"
                type="submit"
                disabled={!commentInput.trim()}
                className="p-2.5 rounded-xl brand-gradient-bg text-white hover:opacity-95 active:scale-95 transition-all cursor-pointer shadow disabled:opacity-50 shrink-0"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {reportPostId && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-5 relative font-sans shadow-2xl animate-fade-in">
            <button
              id="close-report-modal-btn"
              onClick={() => {
                setReportPostId(null);
                setReportReason("");
              }}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all border border-zinc-800/25"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-lg font-bold font-display text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
              Denunciar Publicação
            </h3>
            <p className="text-xs text-zinc-500 mb-3.5">
              Ajude a manter a JPvano um espaço de evolução segura. O que há de errado com esta postagem?
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <textarea
                id="report-reason-textarea"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Alegar abusos, discursos nocivos, spam, plágio, etc..."
                rows={3}
                required
                className="w-full p-2.5 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-rose-500 focus:outline-none placeholder-zinc-600 text-xs transition-all resize-none"
              />

              <div className="flex gap-2 justify-end border-t border-zinc-850 pt-3">
                <button
                  id="cancel-report-btn"
                  type="button"
                  onClick={() => {
                    setReportPostId(null);
                    setReportReason("");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-750 text-xs font-semibold cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  id="submit-report-btn"
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  Enviar Denúncia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SONG SELECTION MODAL */}
      {songsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-xl p-5 md:p-6 relative font-sans shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              id="close-songs-modal-btn"
              type="button"
              onClick={() => {
                setSongsModalOpen(false);
                stopSegmentPlayback();
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all border border-zinc-800/20"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2 border-b border-zinc-850 pb-3">
              <span className="p-2 rounded-xl bg-purple-550/10 text-purple-400">
                <Music className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-black text-white font-display">Músicas Oficiais JPvano</h3>
                <p className="text-xs text-zinc-400 leading-tight">Escolha uma trilha sonora para engajar seu post, story ou reels.</p>
              </div>
            </div>

            {/* SELECTION ZONE */}
            <div className="space-y-4 pt-2">
              <span className="text-xs font-bold text-zinc-300 font-display block">Escolha uma música disponível:</span>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {songs.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/20">
                    <p className="text-xs text-zinc-500 italic">Nenhuma música adicionada pelo administrador ainda.</p>
                  </div>
                ) : (
                  songs.map((song) => {
                    const isSelected = selectedSong?.id === song.id;
                    return (
                      <div
                        key={song.id}
                        onClick={() => handleSelectSongAndPreload(song)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 items-center ${
                          isSelected
                            ? "bg-purple-950/30 border-purple-500/70"
                            : "bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-900"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-lg glow-logo">
                          🎵
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-zinc-100 block truncate">{song.title}</span>
                          <span className="text-[10px] text-zinc-400 block truncate leading-none mt-1">{song.artist}</span>
                        </div>
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedSong && (
                <div className="bg-zinc-950/50 p-4 border border-zinc-800 rounded-2xl space-y-4 animate-fade-in text-left">
                  {/* COMPONENTE DE EDIÇÃO DE ÁUDIO SIMPLES (START/END) */}
                  <div className="space-y-4 border border-zinc-800/80 bg-zinc-950 p-4 rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                      <Music className="h-4 w-4" />
                      <span>Editor de Áudio Simples (Recorte de Trecho)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* START SLIDER/INPUT */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold">
                          <span>⏱️ SEGUNDO INICIAL (START):</span>
                          <span className="text-purple-400 font-mono text-xs">{songStartSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="120"
                          value={songStartSeconds}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSongStartSeconds(val);
                            // Ensure end seconds is always larger
                            const finalEnd = songEndSeconds <= val ? val + 15 : songEndSeconds;
                            setSongEndSeconds(finalEnd);
                            setSongPlayDuration(Math.max(1, finalEnd - val));
                            stopSegmentPlayback();
                          }}
                          className="w-full text-purple-600 accent-purple-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[8px] text-zinc-600 font-mono">
                          <span>0s</span>
                          <span>120s</span>
                        </div>
                      </div>

                      {/* END SLIDER/INPUT */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold">
                          <span>⏱️ SEGUNDO FINAL (END):</span>
                          <span className="text-pink-400 font-mono text-xs">{songEndSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min={songStartSeconds + 1}
                          max="180"
                          value={songEndSeconds}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSongEndSeconds(val);
                            setSongPlayDuration(Math.max(1, val - songStartSeconds));
                            stopSegmentPlayback();
                          }}
                          className="w-full text-pink-600 accent-pink-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[8px] text-zinc-600 font-mono">
                          <span>{songStartSeconds + 1}s</span>
                          <span>180s</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-medium text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-850">
                      <span>Duração Trecho: <strong className="text-white font-mono">{songPlayDuration}s</strong></span>
                      
                      <button
                        type="button"
                        onClick={handleSaveSongMetadataToFirestore}
                        disabled={isSavingSongMetadata}
                        className="py-1 px-3 rounded bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Salvar Metadados no Banco de Dados para esta Música"
                      >
                        {isSavingSongMetadata ? (
                          <>
                            <div className="w-3 h-3 border border-t-transparent border-white rounded-full animate-spin"></div>
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <span>Salvar Metadados na Música 💾</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        startSegmentPlayback(
                          "preview-tracker-player",
                          selectedSong.audioURL || selectedSong.url || "",
                          songStartSeconds,
                          songPlayDuration
                        )
                      }
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        activePlaybackPostId === "preview-tracker-player"
                          ? "bg-rose-500/10 border-rose-500 text-rose-400"
                          : "bg-purple-500/15 border-purple-500/40 text-purple-300 hover:bg-purple-500/20"
                      }`}
                    >
                      <Volume2 className="h-4 w-4" />
                      {activePlaybackPostId === "preview-tracker-player" ? "Parar Teste" : "Ouvir Meu Trecho 🎵"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSongsModalOpen(false);
                        stopSegmentPlayback();
                      }}
                      className="py-2 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
