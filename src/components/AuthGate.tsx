import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BriefcaseBusiness, LoaderCircle, LockKeyhole, ShieldCheck, UserRound, Users } from "lucide-react";
import { AuthContext } from "../lib/authContext";
import type { AccountRole, AuthUser } from "../lib/authContext";

type GoogleProfile = Pick<AuthUser, "email" | "name" | "pictureUrl">;
type AuthConfig = { enabled: boolean; clientId: string; state: string; signupCodeRequired: boolean };
type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; use_fedcm_for_prompt?: boolean }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

async function authRequest<T>(path: string, options?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || "Authentication request failed.");
  return payload as T;
}

function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let canceled = false;
    const render = () => {
      if (canceled || !container.current || !window.google) return;
      container.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
        use_fedcm_for_prompt: true,
      });
      const width = Math.min(360, Math.max(240, Math.floor(container.current.getBoundingClientRect().width)));
      window.google.accounts.id.renderButton(container.current, { type: "standard", theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (window.google) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.addEventListener("load", render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      canceled = true;
      window.google?.accounts.id.cancel();
    };
  }, [clientId, onCredential]);

  return <div className="flex min-h-11 w-full justify-center" ref={container} />;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page grid min-h-[100dvh] place-items-center px-4 py-8 text-slate-700 sm:px-6">
      <main className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.12)]">
        <header className="border-b border-slate-100 px-6 py-6 text-center sm:px-10">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-lagoon text-lg font-bold text-white">PP</div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">The Powerwashing Pros</p>
        </header>
        <section className="p-6 sm:p-10">{children}</section>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <AuthShell><div className="mx-auto flex items-center gap-3 text-sm font-semibold text-slate-500"><LoaderCircle className="animate-spin text-lagoon" size={22} />Checking your session</div></AuthShell>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [credential, setCredential] = useState("");
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [role, setRole] = useState<AccountRole>("employee");
  const [age, setAge] = useState("");
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      authRequest<AuthConfig>("/api/auth/config"),
      authRequest<{ user: AuthUser | null }>("/api/auth/session"),
    ]).then(([nextConfig, session]) => {
      if (!active) return;
      setConfig(nextConfig);
      setUser(session.user);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load sign-in.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const handleCredential = useCallback(async (nextCredential: string) => {
    if (!config) return;
    setWorking(true);
    setError("");
    try {
      const result = await authRequest<{ user?: AuthUser; needsProfile?: boolean; profile?: GoogleProfile }>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential: nextCredential, state: config.state }),
      });
      if (result.user) setUser(result.user);
      else if (result.needsProfile && result.profile) {
        setCredential(nextCredential);
        setProfile(result.profile);
      }
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Google sign-in failed.");
    } finally {
      setWorking(false);
    }
  }, [config]);

  async function register() {
    if (!config || !credential) return;
    setWorking(true);
    setError("");
    try {
      const result = await authRequest<{ user: AuthUser }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ credential, state: config.state, age: Number(age), role, accessCode }),
      });
      setUser(result.user);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Unable to create the account.");
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    await authRequest<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCredential("");
    setProfile(null);
    setAge("");
    setAccessCode("");
  }

  if (loading) return <LoadingScreen />;
  if (user) return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;

  if (!config?.enabled) {
    return <AuthShell><div className="w-full"><ShieldCheck className="text-lagoon" size={32} /><h2 className="mt-5 text-2xl font-bold text-ink">Sign-in setup required</h2><p className="mt-2 text-sm leading-6 text-slate-500">Google authentication has not been connected to this deployment yet.</p>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}</div></AuthShell>;
  }

  if (profile) {
    return (
      <AuthShell>
        <form className="w-full" onSubmit={(event) => { event.preventDefault(); void register(); }}>
          <div className="inline-flex items-center gap-2 rounded-md bg-mist px-2.5 py-1.5 text-xs font-semibold text-lagoon"><LockKeyhole size={14} />First-time setup</div>
          <h2 className="mt-4 text-2xl font-bold text-ink">Complete your profile</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Set your account details for this workspace.</p>
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            {profile.pictureUrl ? <img className="h-11 w-11 rounded-full" src={profile.pictureUrl} alt="" referrerPolicy="no-referrer" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-mist text-lagoon"><UserRound size={20} /></span>}
            <div className="min-w-0"><p className="truncate font-semibold text-ink">{profile.name}</p><p className="truncate text-sm text-slate-500">{profile.email}</p></div>
          </div>
          <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-700">Account type</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["employee", "owner"] as AccountRole[]).map((item) => <button key={item} type="button" onClick={() => setRole(item)} className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left transition ${role === item ? "border-lagoon bg-mist text-lagoon" : "border-slate-200 hover:border-slate-300"}`}>{item === "owner" ? <BriefcaseBusiness size={20} /> : <Users size={20} />}<span className="capitalize font-semibold">{item}</span></button>)}</div></fieldset>
          <label className="mt-5 block text-sm font-semibold text-slate-700">Age<input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-ink outline-none focus:border-lagoon" required min="13" max="120" inputMode="numeric" type="number" value={age} onChange={(event) => setAge(event.target.value)} /></label>
          {config.signupCodeRequired && <label className="mt-4 block text-sm font-semibold text-slate-700">Signup access code<input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-ink outline-none focus:border-lagoon" required type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /></label>}
          <p className="mt-3 text-xs leading-5 text-slate-500">Your access code must match the selected account type. Employee accounts open the protected field workspace.</p>
          {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button className="text-button" type="button" onClick={() => { setCredential(""); setProfile(null); setError(""); }}>Use another Google account</button><button className="primary-button" disabled={working} type="submit">{working ? "Creating account..." : "Create account"}</button></div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full text-center">
        <div className="mx-auto max-w-sm">
          <div className="inline-flex items-center gap-2 rounded-md bg-mist px-2.5 py-1.5 text-xs font-semibold text-lagoon"><LockKeyhole size={14} />Team access</div>
          <h2 className="mt-5 text-3xl font-bold text-ink sm:text-4xl">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Sign in with an approved Google account to open the business dashboard.</p>
          <div className="my-7 h-px bg-slate-200" />
          <GoogleButton clientId={config.clientId} onCredential={handleCredential} />
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-left">
            <ShieldCheck className="mt-0.5 shrink-0 text-lagoon" size={19} />
            <div><p className="text-sm font-semibold text-ink">Protected workspace</p><p className="mt-1 text-xs leading-5 text-slate-500">Access is limited to approved members of The Powerwashing Pros.</p></div>
          </div>
        </div>
        {working && <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} />Verifying Google account</p>}
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-left text-sm text-rose-700">{error}</p>}
      </div>
    </AuthShell>
  );
}
