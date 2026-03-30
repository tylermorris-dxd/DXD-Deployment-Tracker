import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Dev proxy: forward /api/* to Rust server during local development
  // (stripped from static export at build time)
  ...(process.env.NODE_ENV === 'development' ? {
    async rewrites() {
      return [
        { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }
      ]
    }
  } : {})
}

export default nextConfig
