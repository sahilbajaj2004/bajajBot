import { IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const plex = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL("https://bajajbot.dev"),
  title: "BajajBot — your AI coding agent, in your terminal",
  description:
    "A terminal AI coding assistant for any OpenAI-compatible model. Bring your own API key, pick a model, and let BajajBot read, write, edit and run code in your project. npx bajajbot.",
  openGraph: {
    title: "BajajBot — your AI coding agent, in your terminal",
    description:
      "A terminal AI coding assistant for any OpenAI-compatible model. npx bajajbot.",
    type: "website",
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${plex.variable} antialiased`}>
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("bb-theme");if(t&&t!=="ember")document.documentElement.setAttribute("data-theme",t);}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}