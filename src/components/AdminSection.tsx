import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { UserProfile, Post, Comment } from "../types";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  ShieldAlert,
  Users,
  AlertTriangle,
  BadgeCheck,
  Ban,
  Trash2,
  FileText,
  UserCheck,
  UserX,
  Search,
  Check,
  Sparkles,
} from "lucide-react";

interface AdminSectionProps {
  currentUserProfile: UserProfile;
}

export default function AdminSection({ currentUserProfile }: AdminSectionProps) {
  const isRoot = currentUserProfile.email === "joaopedromoladeoliveira@gmail.com";
  const isAdmin = currentUserProfile.role === "admin" || isRoot;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionDoneMsg, setActionDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    // Real-time listen on all users to allow quick updates
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const uList: UserProfile[] = [];
      snap.forEach((d) => {
        uList.push(d.data() as UserProfile);
      });
      setUsers(uList);
    });

    // Realtime listen on post reports
    const unsubReports = onSnapshot(collection(db, "reports"), (snap) => {
      const rList: any[] = [];
      snap.forEach((d) => {
        rList.push({ id: d.id, ...d.data() });
      });
      setReports(rList);
    });

    // Simple aggregate counts of database metrics
    getDocs(collection(db, "posts")).then((snapshots) => {
      setPostsCount(snapshots.size);
    });
    getDocs(collection(db, "comments")).then((snapshots) => {
      setCommentsCount(snapshots.size);
    });

    return () => {
      unsubUsers();
      unsubReports();
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center font-sans">
        <ShieldAlert className="h-16 w-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-bold font-display text-white">Acesso Restrito</h2>
        <p className="text-zinc-400 max-w-md mt-2">
          Você não possui privilégios administrativos necessários para acessar o controlador global da rede JPvano.
        </p>
      </div>
    );
  }

  // 1. Give / Toggle blue verified badge
  const toggleVerification = async (targetUser: UserProfile) => {
    // HARD PROTECTION: The Root Admin always stays verified
    if (targetUser.email === "joaopedromoladeoliveira@gmail.com" && targetUser.verified) {
      setActionDoneMsg("Proteção rígida: O Admin Root não pode ter a verificação revogada.");
      setTimeout(() => setActionDoneMsg(null), 3500);
      return;
    }

    try {
      const userRef = doc(db, "users", targetUser.id);
      await updateDoc(userRef, {
        verified: !targetUser.verified,
      });
      setActionDoneMsg(`Status de verificação de @${targetUser.username} atualizado!`);
      setTimeout(() => setActionDoneMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  // 2. Ban / Unban User Account
  const toggleBanStatus = async (targetUser: UserProfile) => {
    // HARD PROTECTION: Root admin can NEVER be banned or locked
    if (targetUser.email === "joaopedromoladeoliveira@gmail.com") {
      setActionDoneMsg("Proteção rígida: O Admin Root NÃO pode ser banido, suspenso ou bloqueado.");
      setTimeout(() => setActionDoneMsg(null), 3500);
      return;
    }

    // Secondary protecting rules: Admins cannot ban other admins unless they are root
    if (targetUser.role === "admin" && !isRoot) {
      setActionDoneMsg("Permissão insuficiente: Administradores comuns não podem suspender outros administradores.");
      setTimeout(() => setActionDoneMsg(null), 3500);
      return;
    }

    try {
      const userRef = doc(db, "users", targetUser.id);
      await updateDoc(userRef, {
        restricted: !targetUser.restricted,
      });
      setActionDoneMsg(`@${targetUser.username} foi ${!targetUser.restricted ? "banido" : "desbanido"} com sucesso!`);
      setTimeout(() => setActionDoneMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  // 3. Promote to Admin or Demote to Standard User
  const toggleAdminRole = async (targetUser: UserProfile) => {
    // HARD PROTECTION: Root admin role cannot be edited
    if (targetUser.email === "joaopedromoladeoliveira@gmail.com") {
      setActionDoneMsg("Proteção rígida: O cargo de Admin Root é imutável.");
      setTimeout(() => setActionDoneMsg(null), 3500);
      return;
    }

    // Only Root Admin can promote others to admins
    if (!isRoot) {
      setActionDoneMsg("Permissão Insuficiente: Apenas o Admin Root pode nomear ou revogar administradores.");
      setTimeout(() => setActionDoneMsg(null), 3500);
      return;
    }

    try {
      const newRole = targetUser.role === "admin" ? "user" : "admin";
      const userRef = doc(db, "users", targetUser.id);
      await updateDoc(userRef, {
        role: newRole,
      });
      setActionDoneMsg(`Cargo de @${targetUser.username} alterado para: ${newRole.toUpperCase()}`);
      setTimeout(() => setActionDoneMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  // 4. Force Delete reported or malicious Post
  const deletePostForce = async (postId: string) => {
    try {
      await deleteDoc(doc(db, "posts", postId));
      
      // Clear associated reports
      const q = query(collection(db, "reports"), where("postId", "==", postId));
      const qSnap = await getDocs(q);
      qSnap.forEach(async (repDoc) => {
        await deleteDoc(doc(db, "reports", repDoc.id));
      });

      setActionDoneMsg("Postagem excluída permanentemente pelo time de moderação!");
      setTimeout(() => setActionDoneMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  // 5. Clear Report on Post without deleting it
  const dismissReport = async (reportId: string) => {
    try {
      await deleteDoc(doc(db, "reports", reportId));
      setActionDoneMsg("Denúncia arquivada sem exclusão da postagem original.");
      setTimeout(() => setActionDoneMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 font-sans text-zinc-100 animate-fade-in">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold rounded-lg text-xs uppercase tracking-widest font-display">
              {isRoot ? "Root Admin" : "Moderador"}
            </span>
          </div>
          <h1 className="text-3xl font-bold font-display text-white mt-1">
            Painel Administrativo JPvano
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Controle absoluto de usuários, moderação de denúncias, verificação (selo azul) e métricas globais.
          </p>
        </div>

        <div className="flex gap-4 items-center bg-zinc-900 border border-zinc-800 p-3 rounded-2xl">
          <img
            src={currentUserProfile.photoURL}
            alt="Admin Avatar"
            className="w-10 h-10 rounded-full object-cover border border-purple-500"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-zinc-300">@{currentUserProfile.username}</span>
              <BadgeCheck className="h-4 w-4 text-sky-400 fill-sky-400" />
            </div>
            <p className="text-[10px] text-zinc-500 block">{currentUserProfile.email}</p>
          </div>
        </div>
      </div>

      {actionDoneMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-purple-600 text-white font-semibold text-sm px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-fade-in border border-purple-400">
          <Check className="h-4 w-4 bg-purple-700 rounded-full p-0.5" />
          <span>{actionDoneMsg}</span>
        </div>
      )}

      {/* SYSTEM SUMMARY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-purple-600/10 rounded-xl text-purple-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-400 font-semibold block uppercase">Usuários</span>
            <span className="text-2xl font-bold text-white font-display">{users.length}</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-pink-500/10 rounded-xl text-pink-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-400 font-semibold block uppercase">Postagens</span>
            <span className="text-2xl font-bold text-white font-display">{postsCount}</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-400 font-semibold block uppercase">Denúncias</span>
            <span className="text-2xl font-bold text-white font-display">{reports.length}</span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-400 font-semibold block uppercase">Selo Azul</span>
            <span className="text-2xl font-bold text-white font-display">
              {users.filter((u) => u.verified).length}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* USERS ACCREDITATIONS & PERMISSIONS TREE */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Gerenciamento de Contas
            </h2>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                id="admin-user-search"
                type="text"
                placeholder="Buscar usuário ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 font-semibold uppercase text-[10px] tracking-wider border-b border-zinc-850">
                <tr>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Permissões</th>
                  <th className="py-3 px-4 text-center">Selos</th>
                  <th className="py-3 px-4 text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-zinc-500">
                      Nenhum usuário correspondente encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isRootAccount = user.email === "joaopedromoladeoliveira@gmail.com";
                    
                    return (
                      <tr key={user.id} className="hover:bg-zinc-850/40 transition-colors">
                        <td className="py-3 px-4 flex items-center gap-3">
                          <img
                            src={user.photoURL}
                            alt={user.username}
                            className={`w-9 h-9 rounded-full object-cover border ${
                              isRootAccount ? "border-amber-500" : "border-zinc-700"
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-white">@{user.username}</span>
                              {user.verified && (
                                <BadgeCheck className="h-3.5 w-3.5 text-sky-400 fill-sky-400" />
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-500 block">
                              Criação: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="break-all text-zinc-400">{user.email}</span>
                        </td>

                        <td className="py-3 px-4 font-sans">
                          {isRootAccount ? (
                            <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 font-black rounded-full text-[10px] uppercase">
                              Admin Root 👑
                            </span>
                          ) : user.role === "admin" ? (
                            <button
                              id={`role-btn-${user.id}`}
                              onClick={() => toggleAdminRole(user)}
                              disabled={!isRoot}
                              className={`inline-flex items-center gap-1 p-1 px-2.5 bg-purple-500/15 border border-purple-500/20 text-purple-400 font-bold rounded-full text-[10px] uppercase transition-all ${
                                isRoot ? "hover:bg-purple-500/30 cursor-pointer" : "cursor-default"
                              }`}
                            >
                              Administrador
                            </button>
                          ) : (
                            <button
                              id={`role-btn-${user.id}`}
                              onClick={() => toggleAdminRole(user)}
                              disabled={!isRoot}
                              className={`inline-flex items-center gap-1 p-1 px-2.5 bg-zinc-800 text-zinc-500 rounded-full text-[10px] uppercase transition-all ${
                                isRoot ? "hover:bg-purple-600/30 hover:text-purple-400 cursor-pointer" : "cursor-default"
                              }`}
                            >
                              Usuário Comum
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            id={`verify-toggle-${user.id}`}
                            onClick={() => toggleVerification(user)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              user.verified
                                ? "bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20"
                                : "bg-zinc-800 border-zinc-750 text-zinc-500 hover:text-white"
                            }`}
                            title={user.verified ? "Revogar Verificado (Badge)" : "Conceder Verificado (Badge)"}
                          >
                            <BadgeCheck className="h-4 w-4" />
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {user.restricted ? (
                            <button
                              id={`restrict-toggle-${user.id}`}
                              onClick={() => toggleBanStatus(user)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35 transition-all text-[10px] font-bold uppercase cursor-pointer"
                            >
                              Desbanir
                            </button>
                          ) : (
                            <button
                              id={`restrict-toggle-${user.id}`}
                              onClick={() => toggleBanStatus(user)}
                              disabled={isRootAccount}
                              className={`px-2.5 py-1.5 rounded-lg transition-all text-[10px] font-bold uppercase ${
                                isRootAccount
                                  ? "bg-zinc-800 text-zinc-600 border border-transparent cursor-not-allowed"
                                  : "bg-rose-500/15 border border-rose-500/20 text-rose-400 hover:bg-rose-500/35 cursor-pointer"
                              }`}
                            >
                              Banir
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODERATION REVIEWS LIST */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6">
          <h2 className="text-xl font-bold text-white font-display flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse" />
            Denúncias Pendentes
          </h2>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {reports.length === 0 ? (
              <div className="text-center py-10 bg-zinc-950 rounded-xl border border-zinc-850 p-4">
                <p className="text-zinc-500 text-xs">Comunidade segura.</p>
                <p className="text-[10px] text-zinc-600 mt-1">Nenhuma denúncia pendente de moderação.</p>
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-zinc-950 border border-zinc-850 rounded-xl p-3.5 space-y-3 animate-fade-in"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      Post Denunciado
                    </span>
                    <span className="text-[9px] text-zinc-500 font-sans">
                      {rep.createdAt ? new Date(rep.createdAt).toLocaleTimeString() : ""}
                    </span>
                  </div>

                  <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-850 text-xs space-y-1.5">
                    <p className="text-zinc-300 italic font-sans">
                      &ldquo;{rep.postCaption ? rep.postCaption : "Postagem sem texto"}&rdquo;
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-zinc-500">
                      <span>Ref: @{rep.postUsername || "desconhecido"}</span>
                      {rep.postId && (
                        <span className="font-mono text-[9px] text-zinc-600 block">ID: {rep.postId.substr(0, 8)}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-zinc-400 block text-[10px] uppercase">Motivo alegado:</span>
                    <p className="text-rose-300 font-sans">{rep.reason || "Não especificado"}</p>
                    <p className="text-[9px] text-zinc-600 block">Por: @{rep.reporterUsername || "anon"}</p>
                  </div>

                  <div className="flex gap-2 justify-end border-t border-zinc-850 pt-3">
                    <button
                      id={`dismiss-report-${rep.id}`}
                      onClick={() => dismissReport(rep.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white text-[10px] transition-all cursor-pointer font-bold"
                      title="Desconsiderar Denúncia"
                    >
                      Descartar
                    </button>
                    <button
                      id={`delete-report-post-${rep.id}`}
                      onClick={() => deletePostForce(rep.postId)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white text-[10px] transition-all cursor-pointer font-bold flex items-center gap-1"
                      title="Deletar Postagem"
                    >
                      <Trash2 className="h-3 w-3" />
                      Deletar Post
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
