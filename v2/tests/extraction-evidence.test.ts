import { describe, expect, it } from 'vitest';
import { buildExtractionArtifact, locatorContainsQuote } from '@/lib/storage/extraction';
import { parseOcrPages } from '@/lib/pdf/ocr';

const documentId = '22222222-2222-4222-8222-222222222222';

describe('localização das fontes', () => {
  it('preserva cada página de PDF', () => {
    const artifact = buildExtractionArtifact({
      documentId, filename: 'relatorio.pdf',
      extracted: {
        filename: 'relatorio.pdf', text: 'Página um\n\nTrecho da página dois',
        pages: ['Página um', 'Trecho da página dois'], charCount: 36, warnings: [],
      },
    });
    expect(artifact.locators.map((item) => item.number)).toEqual([1, 2]);
    expect(locatorContainsQuote('trecho da página dois', artifact, 'page', 2)).toBe(true);
    expect(locatorContainsQuote('trecho da página dois', artifact, 'page', 1)).toBe(false);
  });

  it('usa parágrafos como localizador para DOCX/XML', () => {
    const artifact = buildExtractionArtifact({
      documentId, filename: 'defesa.docx',
      extracted: {
        filename: 'defesa.docx', text: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
        pages: ['Primeiro parágrafo.\n\nSegundo parágrafo.'], charCount: 40, warnings: [],
      },
    });
    expect(artifact.locators.map((item) => item.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('separa marcadores de OCR e deixa ausência de marcador identificável', () => {
    expect(parseOcrPages('--- PÁGINA 1 ---\nA\n--- PÁGINA 2 ---\nB')).toEqual(['A', 'B']);
    expect(parseOcrPages('texto sem página segura')).toEqual([]);
  });
});
