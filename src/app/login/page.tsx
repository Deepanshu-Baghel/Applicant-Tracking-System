"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { FileText, ArrowRight } from "lucide-react";

const DEFAULT_AUTH_EMAIL_REDIRECT_URL = "https://www.webresume.tech/login";

function resolveAuthEmailRedirectUrl(): string {
  const candidate = process.env.NEXT_PUBLIC_AUTH_EMAIL_REDIRECT_URL?.trim();

  if (!candidate) {
    return DEFAULT_AUTH_EMAIL_REDIRECT_URL;
  }

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return DEFAULT_AUTH_EMAIL_REDIRECT_URL;
    }
    return parsed.toString();
  } catch {
    return DEFAULT_AUTH_EMAIL_REDIRECT_URL;
  }
}

const AUTH_EMAIL_REDIRECT_URL = resolveAuthEmailRedirectUrl();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      if (!supabase) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/upload");
      }
    };

    redirectIfLoggedIn();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin && !supabase) {
      alert("Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (isLogin) {
        if (!supabase) {
          throw new Error("Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.");
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/upload");
        router.refresh();
      } else {
        if (!fullName.trim()) {
          throw new Error("Name is required for signup.");
        }

        if (!dateOfBirth) {
          throw new Error("Date of birth is required for signup.");
        }

        const signupResponse = await fetch("/api/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            fullName: fullName.trim(),
            dateOfBirth,
            emailRedirectTo: AUTH_EMAIL_REDIRECT_URL,
          }),
        });

        const signupPayload = (await signupResponse.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };

        if (!signupResponse.ok) {
          throw new Error(signupPayload.error ?? "Unable to create account right now.");
        }

        alert(signupPayload.message ?? "Account created! Please verify your email, then log in.");
        setFullName("");
        setDateOfBirth("");
        setIsLogin(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <div className="flex-1 flex items-center justify-center p-6 mt-16">
        <div className="glass-card w-full max-w-md p-8">
          <div className="flex items-center justify-center gap-2 mb-8 font-heading text-2xl font-bold">
            <FileText className="w-8 h-8 text-primary-500" /> Resume<span className="text-primary-500">IQ</span>
          </div>
          <p className="text-sm text-muted text-center mb-6">
            Sign in to access Resume Lab reports, Recruiter Suite tools, tier upgrades, and your saved report history.
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Full Name</label>
                  <input
                    type="text"
                    required={!isLogin}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required={!isLogin}
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
              />
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-6"
            >
              {isSubmitting ? "Please wait..." : isLogin ? "Sign In" : "Create Account"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted">
            {isLogin ? "New here?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary-500 font-medium hover:underline">
              {isLogin ? 'Create one' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
