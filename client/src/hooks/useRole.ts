import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

type Me = { role: "admin" | "viewer" } | null;

export function useRole(): "admin" | "viewer" | null {
  const { data } = useQuery<Me>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<Me>({ on401: "returnNull" }),
  });
  return data?.role ?? null;
}

export function useIsAdmin(): boolean {
  return useRole() === "admin";
}
