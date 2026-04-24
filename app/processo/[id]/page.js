import { redirect } from 'next/navigation';

export default function ProcessoPage({ params }) {
  // Always redirect to the first tab (resumo) to avoid 404s
  redirect(`/processo/${params.id}/resumo`);
}
