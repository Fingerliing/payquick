import { MenuItem } from "@/types/menu";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeMenuItem(raw: any): MenuItem {
  return {
    ...raw,
    price: parseFloat(raw.price), // garantit un number
  };
}
