import type { MetadataRoute } from "next";

// Lets the CRM be installed to a phone's home screen (needed for push
// notifications on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM",
    short_name: "CRM",
    description: "ניהול לידים, שיחות ואוטומציות",
    start_url: "/dashboard",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
