/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the shared-types workspace package as TS source.
  transpilePackages: ["@kaldirim/shared-types"],
};

export default nextConfig;
