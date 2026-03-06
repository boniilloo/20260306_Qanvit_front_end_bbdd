import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Test comment for commit - utility functions for className merging

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
