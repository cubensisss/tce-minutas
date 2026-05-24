/** @type {import('next').NextConfig} */
const nextConfig = {
  // Garante que o template DOCX (lido via fs em /api/minuta/docx) seja
  // incluído no bundle serverless da Vercel. Sem isto, dá ENOENT em
  // produção porque o tracing automático não detecta o arquivo .docx.
  outputFileTracingIncludes: {
    '/api/minuta/docx': ['./assets/**'],
  },
  experimental: {
    // Necessário para acomodar respostas longas do Gemini Pro (60-90s)
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Aumenta timeout das rotas de API no servidor Node (Render).
  // Edge Functions ficam fora do plano por causa do limite de 25s.
  serverRuntimeConfig: {
    apiTimeoutSeconds: 120,
  },
  images: {
    remotePatterns: [],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
