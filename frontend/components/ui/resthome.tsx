"use client";

import { useRouter } from "next/navigation";
import { Button } from "./button";

export function Resthome() {
  const router = useRouter();

  return (
    <div className="w-full max-w-xl mb-6">
      <Button variant="outline" onClick={() => router.push('/restaurants/dashboard')} className="w-full">
        Accueil
      </Button>
    </div>
  );
}