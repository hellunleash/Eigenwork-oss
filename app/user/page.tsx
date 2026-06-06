"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect /user to /user/dashboard so the user segment has a clear entry. */
export default function UserIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/user/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">Redirecting…</p>
    </div>
  );
}
