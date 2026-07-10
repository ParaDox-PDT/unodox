import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "UNO Table", description: "A warm tabletop card game for one player and two computer opponents." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
