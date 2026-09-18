import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Site Attendance";
  return {
    name,
    short_name: name.length > 12 ? "Attendance" : name,
    description: "Site attendance with offline punch",
    start_url: "/w",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f5f7",
    theme_color: "#C84508",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
