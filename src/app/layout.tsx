import type { Metadata } from "next";
import { Outfit, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toast";

const frauncesHeading = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

const outfitSans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ToolTruth",
  description:
    "ToolTruth is a WebMCP tool verification platform that allows you and your agents to verify WebMCP tools from other websites and make sure that they work as intended.",
};

const RootLayout = ({ children }: LayoutProps<"/">) => {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        outfitSans.variable,
        frauncesHeading.variable,
        jetBrainsMono.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col dark">
        {children}
        <Toaster />
      </body>
    </html>
  );
};

export default RootLayout;
