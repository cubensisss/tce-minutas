import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import AppSidebar from './_components/AppSidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex">
      <AppSidebar userEmail={user.email ?? ''} />
      <main className="flex-1 lg:ml-64 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
