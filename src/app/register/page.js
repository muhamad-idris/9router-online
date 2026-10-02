"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input } from "@/shared/components";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [gatewayKey, setGatewayKey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/status");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true) window.location.assign("/dashboard");
        }
      } catch {}
    }
    checkAuth();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.gatewayKey) setGatewayKey(data.gatewayKey);
        window.location.assign("/dashboard");
      } else {
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      <div className="landing-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">9Router</h1>
          <p className="text-text-muted">Buat akun untuk mengakses dashboard & gateway /v1</p>
        </div>

        <Card>
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Nama</label>
              <Input type="text" placeholder="Nama kamu" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Password (min. 6 karakter)</label>
              <Input type="password" placeholder="Buat password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              {error && <p className="text-xs text-red-500">{error}</p>}
              {gatewayKey && <p className="text-xs text-green-600 break-all">Gateway key: <code>{gatewayKey}</code></p>}
            </div>
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Daftar
            </Button>
            <p className="text-xs text-center text-text-muted mt-2">
              Sudah punya akun? <a href="/login" className="text-primary underline">Login di sini</a>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
