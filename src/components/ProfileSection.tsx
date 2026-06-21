import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { UserProfile, Post } from "../types";
import { sendAppNotification } from "../lib/notifications";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
} from "firebase/firestore";
import {
  User,
  Settings,
  Edit3,
  Link as LinkIcon,
  Globe,
  Calendar,
  Image as ImageIcon,
  BadgeCheck,
  Grid,
  CheckCircle,
  FolderMinus,
  Sparkles,
  Heart,
  MessageCircle,
  FileText,
  UserCheck,
  UserX,
  X,
  Loader2,
  LogOut,
} from "lucide-react";

interface ProfileSectionProps {
  profileId: string; // The profile to view/render
  currentUserProfile: UserProfile; // The logged in user
  onEditSuccess?: () => void;
  onPostSelect?: (postId: string) => void;
}

export default function ProfileSection({
  profileId,
  currentUserProfile,
  onEditSuccess,
  onPostSelect,
}: ProfileSectionProps) {
  const isOwnProfile = profileId === currentUserProfile.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);

  // Edit fields
  const [editing, setEditing] = useState(false);
  const [bioInput, setBioInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [customAvatarBase64, setCustomAvatarBase64] = useState<string | null>(null);
  const [customBannerBase64, setCustomBannerBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showFollowersModal, setShowFollowersModal] = useState(false);

  useEffect(() => {
    // 1. Listen to targeted profile model updates
    const unsubProfile = onSnapshot(doc(db, "users", profileId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        setBioInput(data.bio || "");
        setLinkInput(data.link || "");
      }
    }, (error) => {
      console.warn("Profile fetch snapshot error:", error);
    });

    // 2. Fetch custom posts of this profile in real-time
    const qPosts = query(collection(db, "posts"), where("userId", "==", profileId));
    const unsubPosts = onSnapshot(qPosts, (snap) => {
      const pList: Post[] = [];
      snap.forEach((d) => {
        pList.push({ id: d.id, ...d.data() } as Post);
      });
      // Sort newest first
      pList.sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt) || 0);
      setPosts(pList);
    }, (error) => {
      console.warn("Profile posts query snapshot error:", error);
    });

    // 3. Realtime counts of following list
    const qFollowing = query(collection(db, "follows"), where("followerId", "==", profileId));
    const unsubFollowing = onSnapshot(qFollowing, (snap) => {
      setFollowingCount(snap.size);
    }, (error) => {
      console.warn("Following counts snapshot error:", error);
    });

    // 4. Realtime counts of followers list
    const qFollowers = query(collection(db, "follows"), where("followingId", "==", profileId));
    const unsubFollowers = onSnapshot(qFollowers, (snap) => {
      setFollowersCount(snap.size);
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setFollowersList(list);
    }, (error) => {
      console.warn("Followers counts snapshot error:", error);
    });

    // 5. Check if logged-in user is currently following this targeted user
    const followDocId = `${currentUserProfile.id}_${profileId}`;
    const unsubCheckFollow = onSnapshot(doc(db, "follows", followDocId), (docSnap) => {
      setIsFollowing(docSnap.exists());
    }, (error) => {
      console.warn("Is following status check snapshot error:", error);
    });

    return () => {
      unsubProfile();
      unsubPosts();
      unsubFollowing();
      unsubFollowers();
      unsubCheckFollow();
    };
  }, [profileId, currentUserProfile.id]);

  // Handle follow/unfollow trigger
  const handleFollowToggle = async () => {
    if (!profile) return;
    const followDocId = `${currentUserProfile.id}_${profileId}`;
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, "follows", followDocId));
      } else {
        await setDoc(doc(db, "follows", followDocId), {
          id: followDocId,
          followerId: currentUserProfile.id,
          followerUsername: currentUserProfile.username,
          followerPhotoURL: currentUserProfile.photoURL || "",
          followingId: profileId,
          createdAt: new Date().toISOString(),
        });

        // Trigger notification sound alert plus catalog entry
        await sendAppNotification(
          profileId,
          currentUserProfile.id,
          currentUserProfile.username,
          currentUserProfile.photoURL,
          "follow",
          "começou a seguir você!"
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomAvatarBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomBannerBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrMsg(null);

    try {
      let finalPhotoURL = profile?.photoURL;
      let finalBannerURL = profile?.bannerURL;

      // 1. Upload portrait if changed
      if (customAvatarBase64) {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: customAvatarBase64,
            originalMimeType: "image/jpeg",
            extension: "jpg",
          }),
        });
        const uploadResult = await res.json();
        if (uploadResult.url) finalPhotoURL = uploadResult.url;
      }

      // 2. Upload banner if changed
      if (customBannerBase64) {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData: customBannerBase64,
            originalMimeType: "image/jpeg",
            extension: "jpg",
          }),
        });
        const uploadResult = await res.json();
        if (uploadResult.url) finalBannerURL = uploadResult.url;
      }

      // 3. Update database doc profile parameters
      const userRef = doc(db, "users", currentUserProfile.id);
      await updateDoc(userRef, {
        bio: bioInput.trim(),
        link: linkInput.trim(),
        photoURL: finalPhotoURL,
        bannerURL: finalBannerURL,
      });

      // Synchronize changes in user's post cached elements
      const qUserPosts = query(collection(db, "posts"), where("userId", "==", currentUserProfile.id));
      const myPostsSnapshot = await getDocs(qUserPosts);
      myPostsSnapshot.forEach(async (postDoc) => {
        await updateDoc(doc(db, "posts", postDoc.id), {
          userPhotoURL: finalPhotoURL,
        });
      });

      setEditing(false);
      setCustomAvatarBase64(null);
      setCustomBannerBase64(null);
      if (onEditSuccess) onEditSuccess();
    } catch (err: any) {
      setErrMsg(err.message || "Erro ao atualizar informações");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] p-6 text-zinc-500 font-sans">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2 font-semibold">Carregando dados do perfil...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 font-sans animate-fade-in text-zinc-150">
      
      {/* BANNER LAYOUT */}
      <div className="relative h-48 md:h-64 rounded-t-3xl overflow-hidden bg-zinc-900 border-x border-t border-zinc-800">
        <img
          src={profile.bannerURL || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&h=400&q=80"}
          alt="User Banner"
          className="w-full h-full object-cover select-none"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent"></div>
        
        {isOwnProfile && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              id="profile-banner-edit-overlay-btn"
              onClick={() => setEditing(true)}
              className="p-2.5 bg-zinc-950/70 hover:bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 backdrop-blur-md shadow-lg"
            >
              <Settings className="h-4 w-4 text-purple-400" />
              <span>Editar Perfil</span>
            </button>
            <button
              id="profile-logout-overlay-btn"
              onClick={async () => {
                if (window.confirm("Deseja desconectar do JPvano?")) {
                  await signOut(auth);
                }
              }}
              className="p-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-900/30 rounded-xl text-rose-300 hover:text-white text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 backdrop-blur-md shadow-lg"
              title="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
        )}
      </div>

      {/* METADATA PROFILE BLOCK */}
      <div className="bg-zinc-900 border-x border-b border-zinc-800 rounded-b-3xl p-5 md:p-6 shadow-xl relative mb-6">
        
        {/* AVATAR OVERLAP */}
        <div className="absolute -top-16 left-6 md:left-8 select-none">
          <div className="relative inline-block">
            <img
              src={profile.photoURL}
              alt={profile.username}
              className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-zinc-900 bg-zinc-900 shadow-2xl"
              referrerPolicy="no-referrer"
            />
            {profile.verified && (
              <span className="absolute bottom-2 right-2 p-1 bg-zinc-900 border-2 border-zinc-900 rounded-full shadow-lg">
                <BadgeCheck className="h-6 w-6 text-white fill-blue-500 shrink-0" />
              </span>
            )}
          </div>
        </div>

        {/* PROFILE IDENTIFIERS & CONTROLS */}
        <div className="pl-36 md:pl-40 pt-1 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white font-display">
                @{profile.username}
              </h2>
              {profile.role === "root_admin" && (
                <span className="p-0.5 px-2.5 bg-amber-500/10 border border-amber-500/25 text-amber-400 font-bold rounded-full text-[9px] uppercase tracking-wider select-none">
                  Root Admin 👑
                </span>
              )}
              {profile.role === "admin" && (
                <span className="p-0.5 px-2.5 bg-purple-500/10 border border-purple-500/25 text-purple-400 font-semibold rounded-full text-[9px] uppercase tracking-wider select-none">
                  Staff Mod
                </span>
              )}
            </div>

            <p className="text-sm font-sans text-zinc-400 mt-1">{profile.email}</p>
          </div>

          {!isOwnProfile && (
            <button
              id="profile-toggle-follow-btn"
              onClick={handleFollowToggle}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold font-display uppercase tracking-wider cursor-pointer shadow-md active:scale-95 transition-all text-center ${
                isFollowing
                  ? "bg-zinc-800 hover:bg-zinc-750 text-zinc-350 border border-zinc-700"
                  : "brand-gradient-bg text-white hover:opacity-90"
              }`}
            >
              {isFollowing ? "Seguindo" : "Seguir"}
            </button>
          )}
        </div>

        {/* BIO & DATA ACCENTS */}
        <div className="mt-8 space-y-4 font-sans">
          <p className="text-sm text-zinc-300 leading-relaxed max-w-2xl whitespace-pre-line bg-zinc-950/20 p-3 rounded-2xl border border-zinc-800/40">
            {profile.bio || "Sem biografia cadastrada."}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            {profile.link && (
              <a
                href={profile.link.startsWith("http") ? profile.link : `https://${profile.link}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-purple-400 hover:underline hover:text-purple-300 font-semibold truncate max-w-xs"
              >
                <Globe className="h-4 w-4" />
                <span>{profile.link}</span>
              </a>
            )}

            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>Entrou em JPvano em Junho de 2026</span>
            </div>
          </div>

          {/* FOLLOWERS SUMMARY ACCENT */}
          <div className="flex items-center gap-6 border-t border-zinc-800 pt-4 mt-4 text-sm select-none">
            <button
              id="show-followers-btn"
              onClick={() => setShowFollowersModal(true)}
              className="hover:text-white transition-all text-left flex gap-1.5"
            >
              <span className="font-extrabold text-white text-base">{followersCount}</span>
              <span className="text-zinc-500 mt-0.5">seguidores</span>
            </button>

            <div className="flex gap-1.5">
              <span className="font-extrabold text-white text-base">{followingCount}</span>
              <span className="text-zinc-500 mt-0.5">seguindo</span>
            </div>

            <div className="flex gap-1.5 ml-auto">
              <span className="font-extrabold text-white text-base">{posts.length}</span>
              <span className="text-zinc-500 mt-0.5">publicações</span>
            </div>
          </div>
        </div>

      </div>

      {/* PORTFOLIO GRID OF POSTS */}
      <div className="space-y-4 font-sans mb-12">
        <h3 className="text-lg font-bold font-display text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
          <Grid className="h-5 w-5 text-purple-400" />
          Galeria de @{profile.username}
        </h3>

        {posts.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <FileText className="h-10 w-10 text-zinc-650 mx-auto mb-2 opacity-55" />
            <p className="text-zinc-500 text-sm">Nenhuma publicação por enquanto</p>
            <p className="text-[11px] text-zinc-650 mt-1">
              {isOwnProfile ? "Escreva algo, poste uma imagem ou áudio!" : "Acompanhe para novas atualizações."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                id={`profile-post-card-${post.id}`}
                onClick={() => onPostSelect?.(post.id)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden cursor-pointer hover:border-purple-500 transition-all group flex flex-col justify-between"
              >
                {post.type === "image" && post.mediaURL && (
                  <div className="aspect-square bg-zinc-950 overflow-hidden relative">
                    <img
                      src={post.mediaURL}
                      alt="Grid Content"
                      className="w-full h-full object-cover group-hover:scale-105 transition-all"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-transparent group-hover:bg-zinc-950/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <div className="flex gap-4 text-white text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <Heart className="h-4 w-4 fill-white text-white" />
                          {post.likes?.length || 0}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageCircle className="h-4 w-4 fill-white text-white" />
                          {post.commentsCount || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {post.type === "video" && post.mediaURL && (
                  <div className="aspect-square bg-zinc-950 relative flex items-center justify-center">
                    <video
                      src={post.mediaURL}
                      className="w-full h-full object-cover brightness-75"
                    />
                    <span className="absolute inset-0 flex items-center justify-center group-hover:bg-zinc-950/40 transition-all text-white text-xs bg-black/40">
                      ▶ Assistir Vídeo
                    </span>
                  </div>
                )}

                {post.type === "audio" && (
                  <div className="p-4 bg-zinc-950/60 aspect-square flex flex-col justify-center items-center text-center space-y-2 border-b border-zinc-850">
                    <span className="text-3xl text-purple-400">🎙️</span>
                    <span className="text-xs font-bold text-zinc-300">Publicação de Áudio</span>
                    <span className="text-[10px] text-zinc-550 block truncate max-w-[120px]">
                      {post.caption}
                    </span>
                  </div>
                )}

                {post.type === "text" && (
                  <div className="p-4 bg-zinc-950/40 aspect-square flex items-center justify-center text-center border-b border-zinc-850">
                    <p className="text-xs text-zinc-300 italic line-clamp-4">
                      &ldquo;{post.caption}&rdquo;
                    </p>
                  </div>
                )}

                {/* Caption description for media grids */}
                {post.type !== "text" && (
                  <div className="p-3 bg-zinc-900 border-t border-zinc-850">
                    <p className="text-xs text-zinc-400 line-clamp-1 italic">
                      {post.caption || "Sem legenda"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EDIT MODAL SECTION */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg p-6 relative font-sans shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              id="close-profile-modal-btn"
              onClick={() => {
                setEditing(false);
                setCustomAvatarBase64(null);
                setCustomBannerBase64(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold font-display text-white mb-5 flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400 animate-spin" />
              Editar Informações do Perfil
            </h3>

            {errMsg && (
              <div className="bg-rose-500/15 border-l-4 border-rose-500 p-2.5 rounded text-rose-200 text-xs mb-4">
                {errMsg}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              
              {/* IMAGE SELECTIONS */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Foto do Perfil (Avatar)
                </label>
                <div className="flex items-center gap-4 bg-zinc-950 p-2 rounded-2xl border border-zinc-850">
                  <img
                    src={customAvatarBase64 || profile.photoURL}
                    alt="Preview Portrait"
                    className="w-14 h-14 rounded-full object-cover border border-zinc-700 bg-zinc-900"
                    referrerPolicy="no-referrer"
                  />
                  <label className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-850 text-xs font-semibold cursor-pointer transition-all">
                    Alterar Foto
                    <input
                      id="profile-avatar-uploader"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Imagem de Banner
                </label>
                <div className="flex items-center gap-4 bg-zinc-950 p-2 rounded-2xl border border-zinc-850">
                  <img
                    src={customBannerBase64 || profile.bannerURL}
                    alt="Preview Banner"
                    className="w-32 h-12 rounded object-cover border border-zinc-850 bg-zinc-900"
                    referrerPolicy="no-referrer"
                  />
                  <label className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-850 text-xs font-semibold cursor-pointer transition-all">
                    Alterar Banner
                    <input
                      id="profile-banner-uploader"
                      type="file"
                      accept="image/*"
                      onChange={handleBannerFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* BIO INPUT */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Minha Biografia
                </label>
                <textarea
                  id="profile-bio-textarea"
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Conte um pouco sobre você aos visitantes do JPvano..."
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all resize-none"
                  maxLength={250}
                />
                <span className="text-[10px] text-zinc-650 flex justify-end">{bioInput.length}/250</span>
              </div>

              {/* EXTERNAL LINK */}
              <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Link Externo (Website / Portfólio)
                </label>
                <input
                  id="profile-link-input"
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="www.meusite.com"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-zinc-850">
                <button
                  id="profile-save-cancel-btn"
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setCustomAvatarBase64(null);
                    setCustomBannerBase64(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                
                <button
                  id="profile-save-submit-btn"
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white brand-gradient-bg hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* FOLLOWERS LIST MODAL */}
      {showFollowersModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-5 relative font-sans shadow-2xl animate-fade-in max-h-[70vh] overflow-y-auto">
            <button
              id="close-followers-modal-btn"
              onClick={() => setShowFollowersModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-all"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-lg font-bold font-display text-white mb-4">
              Seguidores de @{profile.username}
            </h3>

            <div className="space-y-3.5 mt-2">
              {followersList.length === 0 ? (
                <p className="text-xs text-zinc-550 text-center py-4 italic">Nenhum seguidor listado por enquanto.</p>
              ) : (
                followersList.map((fol) => (
                  <div key={fol.id} className="flex items-center gap-3 bg-zinc-950 p-2.5 rounded-xl border border-zinc-850 animate-fade-in">
                    <img
                      src={fol.followerPhotoURL}
                      alt={fol.followerUsername}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-extrabold text-xs block text-white">@{fol.followerUsername}</span>
                      <span className="text-[10px] text-zinc-500 block">Entrou no círculo social</span>
                    </div>
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
