import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow Race — AI pipeline workbench",
  description: "Design, run and compare AI pipelines in one transparent workbench.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("flowrace-theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${sora.variable} ${jetbrainsMono.variable} h-full min-h-full font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
