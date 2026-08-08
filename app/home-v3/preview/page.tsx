import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import HomeV3 from "../landing";
import "../v3.css";

// v3 display face — variable Archivo with the width axis, scoped to this route.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Homepage v3 — preview",
  robots: { index: false, follow: false },
};

export default function HomeV3Preview() {
  return (
    <div className={archivo.variable}>
      <HomeV3 />
    </div>
  );
}
