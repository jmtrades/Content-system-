import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Empire - The Operator's Dashboard",
  description:
    "Command center for content intelligence, creation, and performance tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-gray-950 text-white">
        {children}
      </body>
    </html>
  );
}
