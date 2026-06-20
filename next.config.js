/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Tránh lỗi nạp thư viện canvas phía server-side khi webpack build
    if (isServer) {
      config.externals = [...config.externals, { canvas: 'commonjs canvas' }];
    }
    return config;
  },
};

module.exports = nextConfig;
