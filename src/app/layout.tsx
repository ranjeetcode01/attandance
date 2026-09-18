import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Site Attendance";

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "Geofenced site attendance with offline punch, labour muster and project labour costing.",
  applicationName: appName,
  appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#C84508",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
