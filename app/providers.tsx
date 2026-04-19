"use client";

import { AssistantProvider } from "@/app/components/AssistantDock";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AssistantProvider>{children}</AssistantProvider>;
}
