import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Login() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiRequest("POST", "/api/auth/login", { password });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    } catch (err: any) {
      const msg = String(err?.message || "");
      setError(msg.startsWith("401") ? "Incorrect password" : msg || "Login failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <svg viewBox="0 0 28 28" className="w-8 h-8" aria-label="Signal logo">
            <rect width="28" height="28" rx="6" fill="hsl(var(--sidebar))" />
            <path d="M7 20 L11 14 L15 17 L19 9 L22 12" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="22" cy="12" r="2" fill="hsl(var(--sidebar-primary))" />
          </svg>
          <span className="font-semibold tracking-tight text-lg">
            Sig<span className="text-primary">nal</span>
          </span>
        </div>
        <Card>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold" data-testid="text-login-title">Sign in</h1>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter the viewer or admin password to access the Climate Risk Dashboard.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400" data-testid="text-login-error">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={pending || !password} data-testid="button-login">
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Forgot the password? Contact andy.howard@schroders.com
        </p>
      </div>
    </div>
  );
}
