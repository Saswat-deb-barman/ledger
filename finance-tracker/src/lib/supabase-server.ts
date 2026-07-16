import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options?: any }[]) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch { /* called from a Server Component — safe to ignore */ }
        },
      },
    }
  );
}
