"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getCreditWallet, subscribeCreditWallet, syncCreditWalletFromServer } from "@/utils/creditWallet";
import { normalizeSubscriptionTier, type SubscriptionTier } from "@/lib/subscriptionPlans";
import { fetchSubscriptionStatus } from "@/utils/subscriptionClient";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("Guest");
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const resolveDisplayName = (currentUser: User | null): string => {
    if (!currentUser) {
      return "Guest";
    }

    const name = currentUser.user_metadata?.name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }

    const emailPrefix = currentUser.email?.split("@")[0];
    return emailPrefix && emailPrefix.trim() ? emailPrefix : "User";
  };

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient) {
      return;
    }

    let mounted = true;

    const loadUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabaseClient.auth.getUser();

      if (mounted) {
        setUser(currentUser);
        setDisplayName(resolveDisplayName(currentUser));
        setSubscriptionTier(normalizeSubscriptionTier(currentUser?.user_metadata?.subscription_tier));

        if (currentUser) {
          setCreditBalance(getCreditWallet(currentUser.id).balance);

          const {
            data: { session },
          } = await supabaseClient.auth.getSession();

          if (session?.access_token) {
            const synced = await syncCreditWalletFromServer(currentUser.id, session.access_token);
            if (mounted && synced) {
              setCreditBalance(synced.balance);
            }

            const subscription = await fetchSubscriptionStatus(session.access_token);
            if (mounted && subscription?.tier) {
              setSubscriptionTier(subscription.tier);
            }
          }
        } else {
          setCreditBalance(null);
        }
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setDisplayName(resolveDisplayName(nextUser));
      setSubscriptionTier(normalizeSubscriptionTier(nextUser?.user_metadata?.subscription_tier));

      if (!nextUser) {
        setCreditBalance(null);
        return;
      }

      setCreditBalance(getCreditWallet(nextUser.id).balance);
      if (session?.access_token) {
        void syncCreditWalletFromServer(nextUser.id, session.access_token).then((synced) => {
          if (synced) {
            setCreditBalance(synced.balance);
          }
        });

        void fetchSubscriptionStatus(session.access_token).then((subscription) => {
          if (subscription?.tier) {
            setSubscriptionTier(subscription.tier);
          }
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthClick = () => {
    setMobileMenuOpen(false);
    router.push("/login");
  };

  const handleLogout = async () => {
    const supabaseClient = supabase;
    if (!supabaseClient) {
      router.push("/login");
      return;
    }

    await supabaseClient.auth.signOut();
    setMobileMenuOpen(false);
    router.push("/");
  };

  const closeMobile = () => setMobileMenuOpen(false);

  const navItemClass = (target: string) =>
    clsx(
      "text-sm font-medium px-2.5 py-1.5 rounded-full transition-colors",
      pathname === target
        ? "text-primary-500 bg-primary-500/10"
        : "text-muted hover:text-foreground hover:bg-muted/10"
    );

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeCreditWallet(user.id, (wallet) => {
      setCreditBalance(wallet.balance);
    });
  }, [user]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary-500/10 p-2 rounded-xl group-hover:bg-primary-500/20 transition-colors">
            <FileText className="w-6 h-6 text-primary-500" />
          </div>
          <span className="font-heading font-bold text-xl tracking-tight">
            Resume<span className="text-primary-500">IQ</span>
          </span>
        </Link>
        
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-2 lg:gap-4">
          <Link href="/overview" className={navItemClass('/overview')}>Platform</Link>
          <Link href="/upload" className={navItemClass('/upload')}>Resume Lab</Link>
          {user && (
            <Link href="/hr" className={navItemClass('/hr')}>Recruiter Suite</Link>
          )}
          {user && (
            <Link href="/billing" className={navItemClass('/billing')}>Billing</Link>
          )}
          {user && (
            <Link href="/history" className={navItemClass('/history')}>Reports</Link>
          )}
        </div>
        
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <div className="text-right hidden lg:block">
                <p className="text-xs text-foreground font-semibold max-w-[200px] truncate">{displayName}</p>
                <p className="text-[11px] text-muted">Tier: {subscriptionTier.toUpperCase()} | Credits: {creditBalance ?? 0}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-border hover:bg-muted/10 transition-colors"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAuthClick}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-border hover:bg-muted/10 transition-colors"
              >
                Log In
              </button>
              <button
                onClick={handleAuthClick}
                className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-5 py-2 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-all transform hover:-translate-y-0.5"
              >
                Try Free
              </button>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden p-2 text-muted rounded-lg border border-border/70 hover:bg-muted/10 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 px-4 sm:px-6 pt-3 pb-4">
          <div className="glass rounded-2xl border border-border/70 p-4 flex flex-col gap-2 shadow-xl">
          <Link href="/overview" onClick={closeMobile} className={clsx("font-medium rounded-lg px-3 py-2", pathname === '/overview' ? "text-primary-500 bg-primary-500/10" : "text-muted hover:text-foreground hover:bg-muted/10")}>Platform</Link>
          <Link href="/upload" onClick={closeMobile} className={clsx("font-medium rounded-lg px-3 py-2", pathname === '/upload' ? "text-primary-500 bg-primary-500/10" : "text-muted hover:text-foreground hover:bg-muted/10")}>Resume Lab</Link>
          {user && <Link href="/hr" onClick={closeMobile} className={clsx("font-medium rounded-lg px-3 py-2", pathname === '/hr' ? "text-primary-500 bg-primary-500/10" : "text-muted hover:text-foreground hover:bg-muted/10")}>Recruiter Suite</Link>}
          {user && <Link href="/billing" onClick={closeMobile} className={clsx("font-medium rounded-lg px-3 py-2", pathname === '/billing' ? "text-primary-500 bg-primary-500/10" : "text-muted hover:text-foreground hover:bg-muted/10")}>Billing</Link>}
          {user && <Link href="/history" onClick={closeMobile} className={clsx("font-medium rounded-lg px-3 py-2", pathname === '/history' ? "text-primary-500 bg-primary-500/10" : "text-muted hover:text-foreground hover:bg-muted/10")}>Reports</Link>}
          {user && (
            <div className="rounded-lg border border-border p-3 text-sm mt-1">
              <p className="font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted">Tier: {subscriptionTier.toUpperCase()} | Credits: {creditBalance ?? 0}</p>
            </div>
          )}
          {user ? (
            <button onClick={handleLogout} className="bg-primary-500 text-white font-medium py-2.5 rounded-lg mt-2">Log Out</button>
          ) : (
            <button onClick={handleAuthClick} className="bg-primary-500 text-white font-medium py-2.5 rounded-lg mt-2">Sign In / Create Account</button>
          )}
          </div>
        </div>
      )}
    </nav>
  );
}
