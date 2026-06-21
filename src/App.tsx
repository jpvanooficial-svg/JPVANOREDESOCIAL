import { useState, useEffect, useRef } from "react";
import { auth, db } from "./lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { UserProfile } from "./types";
import { playNotificationSound } from "./lib/audio";
import AuthScreen from "./components/AuthScreen";
import ThemeToggle from "./components/ThemeToggle";
import FeedSection from "./components/FeedSection";
import ChatSection from "./components/ChatSection";
import NotificationsSection from "./components/NotificationsSection";
import ProfileSection from "./components/ProfileSection";
import AdminSection from "./components/AdminSection";
import jpvanoLogo from "./assets/images/logo.jpg";
import {
  Sparkles,
  Compass,
  MessageSquare,
  Bell,
  User as UserIcon,
  Shield,
  LogOut,
  Loader2,
  BadgeCheck,
} from "lucide-react";

type ActiveTab = "feed" | "chats" | "notifications" | "profile" | "admin";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("feed");

  // Selected profile shortcuts for navigation redirects
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Notifications alert count indicators
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. Listen to global firebase auth session changes
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setProfile(null);
        setAppLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. Watch active user profile collection in real-time
  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const uProfile = snap.data() as UserProfile;
        
        // Anti-Spam Community Ban Rule: If profile is suspended, trigger logs disconnect instantly!
        if (uProfile.restricted) {
          signOut(auth);
          alert("Sua conta foi suspensa temporariamente por violar as diretrizes de fomento JPvano.");
          setProfile(null);
          return;
        }

        setProfile(uProfile);
      }
      setAppLoading(false);
    });

    return () => unsubProfile();
  }, [user]);

  // 3. Watch real-time notification counters & trigger global audio chimes / native push notifications
  const loadedNotifsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile) return;

    // Load initial ones first so we do not spam chime play on page loading
    let populatedFirstRound = false;

    // Watch unread messages / notification badges in notifications collection
    const qNotifs = query(
      collection(db, "notifications"),
      where("recipientId", "==", profile.id)
    );
    const unsubUnread = onSnapshot(
      qNotifs,
      (snap) => {
        let unreads = 0;
        let hasNewUnread = false;
        let newestIncoming: any = null;

        snap.forEach((d) => {
          const data = d.data();
          const id = d.id;

          if (data.recipientId === profile.id) {
            if (!data.read) {
              unreads++;

              // If it's a completely brand new notification doc and not seen before
              if (populatedFirstRound && !loadedNotifsRef.current[id]) {
                hasNewUnread = true;
                newestIncoming = {
                  id,
                  type: data.type, // 'like' | 'comment' | 'follow' | 'message'
                  senderUsername: data.senderUsername,
                  text: data.text || "te enviou um alerta em tempo real!",
                };
              }
            }
            // Add to session cache list to prevent loops
            loadedNotifsRef.current[id] = true;
          }
        });

        // Toggle first run flat after parsing the snap
        if (!populatedFirstRound) {
          populatedFirstRound = true;
        }

        setUnreadCount(unreads);

        // Execute dynamic synthesized audio tone & direct OS browser native push notifications
        if (hasNewUnread && newestIncoming) {
          const { type, senderUsername, text } = newestIncoming;

          // 1. Play category tone:
          playNotificationSound(type);

          // 2. Dispatch Native Browser Push Notification if permission is granted
          if ("Notification" in window && Notification.permission === "granted") {
            const pushEnabled = localStorage.getItem(`jpvano_push_${type}`) !== "false";
            
            if (pushEnabled) {
              const categoryTitle = 
                type === "message" ? `DM de @${senderUsername}` :
                type === "like" ? `@${senderUsername} curtiu` :
                type === "comment" ? `@${senderUsername} comentou` :
                `@${senderUsername} te seguiu`;

              const pNotif = new Notification(`JPvano: ${categoryTitle}`, {
                body: text,
                icon: "/favicon.ico",
              });

              pNotif.onclick = () => {
                window.focus();
              };
            }
          }
        }
      }
    );

    return () => unsubUnread();
  }, [profile]);

  if (appLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-sans">
        <div className="mb-4">
          <img
            src={jpvanoLogo}
            alt="JPvano Loading..."
            className="w-24 h-24 object-contain rounded-2xl border border-zinc-850 shadow-2xl animate-pulse glow-logo"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-xl font-bold font-display text-white tracking-widest animate-pulse">JPvano Social</h2>
        <p className="text-zinc-500 text-xs mt-1.5 leading-none">Carregando ambiente em tempo real...</p>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthScreen />;
  }

  const handleLogOut = async () => {
    if (window.confirm("Deseja desconectar do JPvano?")) {
      await signOut(auth);
    }
  };

  const navigateToProfile = (uid: string) => {
    setSelectedProfileId(uid);
    setActiveTab("profile");
  };

  const navigateToPost = (postId: string) => {
    setSelectedPostId(postId);
    setActiveTab("feed");
  };

  const navigateToChat = (uid: string) => {
    setSelectedProfileId(uid); // pass target uid
    setActiveTab("chats");
  };

  const isAdmin = profile.role === "admin" || profile.role === "root_admin";

  return (
    <div className="min-h-screen bg-zinc-950 dark:bg-zinc-950 light:bg-zinc-50 transition-colors text-zinc-100 dark:text-zinc-100 text-zinc-800 duration-200">
      
      {/* GLOBAL DESKTOP & MOBILE RESPONSIVE HEADER BAR */}
      <header className="sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800 backdrop-blur-md bg-opacity-80 px-4 md:px-8 py-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5">
          <img
            src={jpvanoLogo}
            alt="JPvano Logo"
            className="w-9 h-9 object-contain rounded-lg border border-zinc-800 shadow cursor-pointer hover:scale-105 transition-all"
            onClick={() => {
              setSelectedProfileId(null);
              setSelectedPostId(null);
              setActiveTab("feed");
            }}
            referrerPolicy="no-referrer"
          />
          <span
            onClick={() => {
              setSelectedProfileId(null);
              setSelectedPostId(null);
              setActiveTab("feed");
            }}
            className="text-2xl font-black font-display tracking-tight text-white cursor-pointer"
          >
            JP<span className="brand-gradient-text font-extrabold uppercase">vano</span>
          </span>
        </div>

        {/* CONTROLS AREA */}
        <div className="flex items-center gap-3">
          
          {/* Light toggle loader */}
          <ThemeToggle />

          {/* User portfolio access button */}
          <button
            id="nav-shortcut-myprofile-btn"
            onClick={() => navigateToProfile(profile.id)}
            className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 rounded-xl hover:bg-zinc-850 bg-zinc-950 transition-all cursor-pointer text-xs font-semibold"
          >
            <img
              src={profile.photoURL}
              alt="My Avatar"
              className="w-5.5 h-5.5 rounded-full object-cover border border-purple-500"
              referrerPolicy="no-referrer"
            />
            <span className="hidden sm:inline lowercase text-zinc-300">@{profile.username}</span>
          </button>
          
          <button
            id="header-logout-btn"
            onClick={handleLogOut}
            className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 hover:text-white hover:bg-rose-600 transition-all cursor-pointer"
            title="Sair do JPvano"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* CORE WRAPPER LAYOUT */}
      <div className="max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-77px)] relative">
        
        {/* VIEW BODY CONTENT */}
        <main className="flex-1 pb-24 md:pb-6">
          {activeTab === "feed" && (
            <FeedSection
              currentUserProfile={profile}
              initialSelectedPostId={selectedPostId || undefined}
              onUserSelect={(uid) => {
                setSelectedProfileId(uid);
                setActiveTab("profile");
              }}
            />
          )}

          {activeTab === "chats" && (
            <ChatSection
              currentUserProfile={profile}
              initialTargetUserId={selectedProfileId || undefined}
            />
          )}

          {activeTab === "notifications" && (
            <NotificationsSection
              currentUserProfile={profile}
              onPostSelect={navigateToPost}
              onChatSelect={navigateToChat}
            />
          )}

          {activeTab === "profile" && (
            <ProfileSection
              profileId={selectedProfileId || profile.id}
              currentUserProfile={profile}
              onPostSelect={navigateToPost}
            />
          )}

          {activeTab === "admin" && isAdmin && (
            <AdminSection currentUserProfile={profile} />
          )}
        </main>

        {/* NAV ROUTERS TAB RAIL (RESPONSIVE BOTH SCALES BOTTOM FIXED BAR FOR EASY ACCESSIBILITY) */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-805 py-3 px-6 flex justify-around items-center select-none shadow-2xl backdrop-blur-md">
          <button
            id="nav-tab-feed"
            onClick={() => {
              setSelectedPostId(null);
              setActiveTab("feed");
            }}
            className={`flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
              activeTab === "feed" ? "text-jp-pink font-bold scale-110" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Compass className="h-5.5 w-5.5" />
            <span className="text-[10px] uppercase font-display tracking-wider font-semibold">Feed</span>
          </button>

          <button
            id="nav-tab-chats"
            onClick={() => {
              setSelectedProfileId(null);
              setActiveTab("chats");
            }}
            className={`flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
              activeTab === "chats" ? "text-jp-pink font-bold scale-110" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <MessageSquare className="h-5.5 w-5.5" />
            <span className="text-[10px] uppercase font-display tracking-wider font-semibold">Mensagens</span>
          </button>

          <button
            id="nav-tab-notifications"
            onClick={() => setActiveTab("notifications")}
            className={`flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer relative ${
              activeTab === "notifications" ? "text-jp-pink font-bold scale-110" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Bell className="h-5.5 w-5.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-rose-500 text-white font-extrabold text-[9px] rounded-full w-4.5 h-4.5 flex items-center justify-center animate-pulse border border-zinc-900 shadow">
                {unreadCount}
              </span>
            )}
            <span className="text-[10px] uppercase font-display tracking-wider font-semibold">Alertas</span>
          </button>

          <button
            id="nav-tab-profile"
            onClick={() => {
              setSelectedProfileId(profile.id);
              setActiveTab("profile");
            }}
            className={`flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
              activeTab === "profile" && selectedProfileId === profile.id
                ? "text-jp-pink font-bold scale-110"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <UserIcon className="h-5.5 w-5.5" />
            <span className="text-[10px] uppercase font-display tracking-wider font-semibold">Perfil</span>
          </button>

          {isAdmin && (
            <button
              id="nav-tab-admin"
              onClick={() => setActiveTab("admin")}
              className={`flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                activeTab === "admin" ? "text-amber-400 font-bold scale-110" : "text-zinc-550 hover:text-zinc-400"
              }`}
            >
              <Shield className="h-5.5 w-5.5" />
              <span className="text-[10px] uppercase font-display tracking-wider font-semibold text-amber-500">Admin</span>
            </button>
          )}
        </nav>

      </div>
    </div>
  );
}
