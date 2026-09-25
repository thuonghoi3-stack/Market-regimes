import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof document === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
  );
}
