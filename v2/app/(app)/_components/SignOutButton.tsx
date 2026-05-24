'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1"
    >
      <span className="material-symbols-outlined text-base">logout</span>
      Sair
    </button>
  );
}
