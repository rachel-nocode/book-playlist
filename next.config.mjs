/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "books.google.com", pathname: "/**" },
      {
        protocol: "https",
        hostname: "books.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "mosaic.scdn.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.scdn.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.spotifycdn.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
