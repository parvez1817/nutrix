import { signIn } from "@/hooks/use-auth";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "vizly:token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${path}`, { ...init, headers });
  } catch (e) {
    throw new ApiError(
      `Couldn't reach the API. Is the backend running?`,
      0,
    );
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export type AuthResponse = {
  token: string;
  user: { email: string; name?: string };
};

export async function signupApi(input: { email: string; password: string; name?: string }) {
  const data = await request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setToken(data.token);
  signIn({ email: data.user.email, name: data.user.name || data.user.email, provider: "email" });
  return data;
}

export async function loginApi(input: { email: string; password: string }) {
  const data = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setToken(data.token);
  signIn({ email: data.user.email, name: data.user.name || data.user.email, provider: "email" });
  return data;
}

export async function saveProjectApi(payload: {
  title: string;
  summary?: string;
  fileName?: string;
  prompt?: string;
  spec: unknown;
  rowCount?: number;
}) {
  return request<{ id: string; createdAt: string }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function subscribeApi(input: { email: string; source?: string }) {
  return request<{ ok: true; alreadySubscribed?: boolean }>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type GoogleAuthResponse = {
  token: string;
  user: { email: string; name?: string; picture?: string; provider: "google" };
};

export async function googleSignInApi(credential: string) {
  const data = await request<GoogleAuthResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  setToken(data.token);
  signIn({
    email: data.user.email,
    name: data.user.name || data.user.email,
    avatar: data.user.picture,
    provider: "google",
  });
  return data;
}

export { ApiError };
