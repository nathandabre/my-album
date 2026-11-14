import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://ik.imagekit.io https://img.clerk.com",
  "media-src 'self' blob: https://ik.imagekit.io",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' http: https: https://*.js.stripe.com https://js.stripe.com https://maps.googleapis.com https://*.protect.clerk.com",
  "connect-src 'self' https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.stripe.com https://maps.googleapis.com https://img.clerk.com https://*.protect.clerk.com:*",
  "frame-src 'self' https://challenges.cloudflare.com https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com https://*.protect.clerk.com",
  "form-action 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Content-Security-Policy-Report-Only",
        value: contentSecurityPolicy,
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000",
      });
    }
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
