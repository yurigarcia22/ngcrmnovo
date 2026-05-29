import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Required for Docker standalone build
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Server Actions têm limite padrão de 1MB. Anexos/artes passam disso,
    // o que barrava o envio de mídia e deixava o chat carregando infinito.
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
