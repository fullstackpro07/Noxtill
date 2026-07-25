import { toast as sonnerToast } from "sonner";

/** Thin wrapper so every toast in the app goes through one place with consistent copy tone. */
export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  info: (message: string) => sonnerToast(message),
};
