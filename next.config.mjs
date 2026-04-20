/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['ssh2'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
