"use client";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const signIn = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <main className="min-h-screen grid place-items-center bg-paper px-6">
      <div className="w-full max-w-sm text-center">
        <div className="eyebrow mb-3">Personal finance ledger</div>
        <h1 className="text-4xl font-semibold tracking-tight mb-2">Ledger</h1>
        <p className="text-muted mb-8">
          Your projects and your money, in one honest view.
        </p>
        <button
          onClick={signIn}
          className="w-full inline-flex items-center justify-center gap-3
                     rounded-xl border border-line bg-panel px-4 py-3
                     font-medium shadow-card hover:border-ink/30 transition"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.7 17.6 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"/>
            <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-4.2-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
          </svg>
          Continue with Google
        </button>
        <p className="text-xs text-muted mt-6">
          Only you can see your data. Sessions are private to your account.
        </p>
      </div>
    </main>
  );
}
