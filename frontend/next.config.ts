import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Keep Next's bundler rooted at this app. The parent workspace also has a
  // package-lock.json, which otherwise makes Next infer the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: 'http://localhost:3000/api/v1/:path*' },
      { source: '/api/v2/:path*', destination: 'http://localhost:8002/api/v2/:path*' },
      { source: '/api/v3/:path*', destination: 'http://localhost:8003/api/v3/:path*' },
      { source: '/api/v5/:path*', destination: 'http://localhost:8004/api/v5/:path*' },
      { source: '/api/v6/:path*', destination: 'http://localhost:8005/api/v6/:path*' },
    ]
  },
}

export default nextConfig
