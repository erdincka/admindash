/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    compiler: {
        styledComponents: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || '',
    },
}

module.exports = nextConfig
