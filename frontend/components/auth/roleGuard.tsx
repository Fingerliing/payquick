"use client";

import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface RoleGuardProps {
  role: "client" | "restaurateur";
  children: React.ReactNode;
}

export default function RoleGuard({ role, children }: RoleGuardProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push("/auth/login");
    } else if (user.role !== role) {
      router.push("/");
    }
  }, [user, isAuthenticated, role, router]);

  return <>{children}</>;
}
