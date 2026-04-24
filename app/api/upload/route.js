import { NextResponse } from 'next/server';

// POST - Handle document upload notification (extraction is client-side for now)
export async function POST(request) {
  const { processoId } = await request.json();
  // In a full implementation, this would trigger Python extraction scripts
  // For now, we just acknowledge the upload
  return NextResponse.json({ success: true, processoId, message: 'Upload registrado. Extração será feita na etapa de resumo.' });
}
