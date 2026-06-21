import React, { useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { LogIn, UserPlus, HelpCircle, Loader2, KeyRound, Sparkles } from "lucide-react";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
  "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=150&h=150&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80",
];

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [customAvatarBase64, setCustomAvatarBase64] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Handle uploading custom profile photo via server proxy
  const handleCustomAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError("A foto do perfil deve ter menos que 8MB");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setCustomAvatarBase64(base64);
        
        setError(null);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao ler imagem local");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Double check if account user document is banned
      const userRef = doc(db, "users", credential.user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const profile = userSnap.data();
        if (profile.restricted) {
          await auth.signOut();
          setError("Esta conta está suspensa por violar as diretrizes da comunidade.");
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Email ou senha incorretos.");
      } else {
        setError(err.message || "Erro ao fazer login");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !username) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-str0-9_]/g, "");
    if (cleanUsername.length < 3) {
      setError("O nome de usuário deve conter no mínimo 3 caracteres alfanuméricos ou sublinhados");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Check if username is already taken in database
      const q = query(collection(db, "users"), where("username", "==", cleanUsername));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        setError("Este nome de usuário já está sendo usado por outra pessoa");
        setLoading(false);
        return;
      }

      // 2. Upload file avatar to disk upload API if available, else fallback to preset
      let photoURL = selectedAvatar;
      if (customAvatarBase64) {
        try {
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
          if (uploadResult.url) {
            photoURL = uploadResult.url;
          }
        } catch {
          console.warn("Avatar upload failed, falling back to local preset selection");
        }
      }

      // 3. Create active Auth Account
      const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      
      const emailLower = email.trim().toLowerCase();
      // Enforce Admin permissions rules based on requirements
      let role: "root_admin" | "admin" | "user" = "user";
      let verified = false;

      if (emailLower === "joaopedromoladeoliveira@gmail.com") {
        role = "root_admin";
        verified = true;
      } else if (emailLower === "jpvanoredesocial@gmail.com") {
        role = "admin";
        verified = true;
      }

      // 4. Register profile inside Firestore mapping db
      await setDoc(doc(db, "users", userCred.user.uid), {
        id: userCred.user.uid,
        username: cleanUsername,
        email: emailLower,
        photoURL,
        bannerURL: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&h=400&q=80", // preset abstract banner
        bio: bio.trim() || `Olá, sou ${username}! Bem-vindo ao JPvano Social.`,
        link: "",
        verified,
        role,
        restricted: false,
        createdAt: new Date().toISOString(),
      });

    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("Este endereço de e-mail já está cadastrado.");
      } else if (err.code === "auth/weak-password") {
        setError("A senha deve conter pelo menos 6 caracteres.");
      } else {
        setError(err.message || "Erro no cadastro de conta.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Por favor, digite seu e-mail cadastrado.");
      return;
    }

    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("Link de redefinição enviado com sucesso para o e-mail informado!");
    } catch (err: any) {
      setError(err.message || "Erro ao solicitar recuperação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-12 relative overflow-hidden">
      {/* Decorative Brand Circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-jp-pink/10 rounded-full filter blur-3xl -translate-y-12"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-jp-purple/10 rounded-full filter blur-3xl translate-y-12"></div>

      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 transition-all">
        {/* LOGO */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl brand-gradient-bg mb-3 glow-logo shadow-lg">
            <Sparkles className="h-8 w-8 text-white animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-white mt-1">
            JP<span className="brand-gradient-text font-extrabold uppercase">vano</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5 font-sans">
            {mode === "login" && "Conecte, Compartilhe e Evolua"}
            {mode === "register" && "Crie sua conta para entrar na rede"}
            {mode === "forgot" && "Recuperação de acesso seguro"}
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border-l-4 border-rose-500 p-3 rounded text-rose-200 text-xs mb-5 animate-fade-in font-sans">
            {error}
          </div>
        )}

        {msg && (
          <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-3 rounded text-emerald-200 text-xs mb-5 animate-fade-in font-sans">
            {msg}
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4 font-sans">
            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                E-mail
              </label>
              <input
                id="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@email.com"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider">
                  Senha
                </label>
                <button
                  type="button"
                  id="forgot-switch-btn"
                  onClick={() => {
                    setError(null);
                    setMsg(null);
                    setMode("forgot");
                  }}
                  className="text-zinc-500 hover:text-jp-pink text-xs font-medium cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <input
                id="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
              />
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3 px-4 rounded-xl font-display font-semibold text-white brand-gradient-bg hover:opacity-90 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Entrar na JPvano
                </>
              )}
            </button>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-4 font-sans">
            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Nome de Usuário (@username)
              </label>
              <input
                id="register-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="seu_usuario"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Apenas letras minúsculas, números e sublinhados (_).
              </p>
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                E-mail
              </label>
              <input
                id="register-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@email.com"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Senha (mínimo 6 caracteres)
              </label>
              <input
                id="register-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha secreta"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Bio ou Frase Curta
              </label>
              <input
                id="register-bio-input"
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Um pouco sobre você..."
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Escolha sua Foto de Perfil
              </label>
              <div className="flex gap-2 flex-wrap mb-3 justify-center">
                {PRESET_AVATARS.map((avatar, idx) => (
                  <button
                    key={avatar}
                    id={`preset-avatar-btn-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedAvatar(avatar);
                      setCustomAvatarBase64(null);
                    }}
                    className={`p-1 rounded-full border-2 transition-all cursor-pointer ${
                      selectedAvatar === avatar && !customAvatarBase64
                        ? "border-jp-pink scale-110 shadow-lg"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={avatar}
                      alt={`Avatar ${idx}`}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-xs">Ou faça upload da sua:</span>
                <label className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white bg-zinc-950 hover:bg-zinc-900 text-xs font-semibold cursor-pointer transition-all">
                  Selecionar Foto
                  <input
                    id="profile-picker-input"
                    type="file"
                    accept="image/*"
                    onChange={handleCustomAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>

              {customAvatarBase64 && (
                <div className="mt-3 flex items-center gap-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800 animate-fade-in">
                  <img
                    src={customAvatarBase64}
                    alt="Custom Avatar Preview"
                    className="w-12 h-12 rounded-full object-cover border border-zinc-700"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-emerald-400 text-xs font-bold">Foto selecionada pronta!</span>
                </div>
              )}
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3 px-4 rounded-xl font-display font-semibold text-white brand-gradient-bg hover:opacity-90 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Cadastrar minha Conta
                </>
              )}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgot} className="space-y-4 font-sans">
            <p className="text-zinc-400 text-xs mb-3">
              Insira o endereço de e-mail associado à sua conta. Enviaremos um link de redefinição de senha imediatamente.
            </p>
            <div>
              <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">
                E-mail Cadastrado
              </label>
              <input
                id="forgot-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@email.com"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-white rounded-xl focus:ring-1 focus:ring-jp-pink focus:outline-none placeholder-zinc-600 text-sm transition-all"
                required
              />
            </div>

            <button
              id="forgot-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3 px-4 rounded-xl font-display font-semibold text-white brand-gradient-bg hover:opacity-90 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  Enviar Link de Recuperação
                </>
              )}
            </button>
          </form>
        )}

        {/* SWITCH MODES */}
        <div className="mt-8 text-center border-t border-zinc-800/60 pt-5 font-sans">
          {mode === "login" && (
            <p className="text-zinc-500 text-xs">
              Não tem uma conta?{" "}
              <button
                id="switch-register-btn"
                onClick={() => {
                  setError(null);
                  setMsg(null);
                  setMode("register");
                }}
                className="text-jp-pink hover:underline font-semibold cursor-pointer"
              >
                Cadastre-se aqui
              </button>
            </p>
          )}

          {mode === "register" && (
            <p className="text-zinc-500 text-xs">
              Já possui uma conta?{" "}
              <button
                id="switch-login-btn"
                onClick={() => {
                  setError(null);
                  setMsg(null);
                  setMode("login");
                }}
                className="text-jp-pink hover:underline font-semibold cursor-pointer"
              >
                Faça login
              </button>
            </p>
          )}

          {mode === "forgot" && (
            <button
              id="forgot-back-login-btn"
              onClick={() => {
                setError(null);
                setMsg(null);
                setMode("login");
              }}
              className="text-zinc-400 hover:text-white text-xs font-semibold hover:underline cursor-pointer flex items-center gap-1.5 mx-auto"
            >
              Voltar ao login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
