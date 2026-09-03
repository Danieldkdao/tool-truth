import { toast, ToastType } from "@/components/ui/toast";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

export const showToast = (
  message: string,
  type: ToastType,
  toastOptions?: Omit<Parameters<typeof toast.add>[0], "title" | "type">,
) => {
  toast.add({
    title: message,
    type,
    ...toastOptions,
  });
};
