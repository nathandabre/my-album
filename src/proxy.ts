import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://ik.imagekit.io",
        "https://img.clerk.com",
      ],
      "media-src": ["'self'", "blob:", "https://ik.imagekit.io"],
      "frame-ancestors": ["'none'"],
    },
  },
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!api/health(?:/|$)|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Run for API routes except the unauthenticated health check
    "/((?!api/health(?:/|$))(?:api|trpc).*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
