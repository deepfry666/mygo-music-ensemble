// SPDX-FileCopyrightText: 2026 deepfry666
// SPDX-License-Identifier: AGPL-3.0-or-later

// Signing in to Spotify's Web API: Authorization Code with PKCE, with the
// Client ID of an app the listener made in Spotify's developer dashboard, so
// no client secret is needed. Spotify answers the browser back to 127.0.0.1,
// where host.waitForRedirect listens.

import { base64url, sha256 } from "./sha256.ts";
import { fail, setting, storage, t } from "./env.ts";

const ACCOUNTS = "https://accounts.spotify.com";
export const REDIRECT_PORT = 43110;
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
  "user-top-read",
  "user-read-recently-played",
].join(" ");

// What the host has beyond the NetEase package's declaration of it.
const browser = host as unknown as {
  openURL(url: string): void;
  waitForRedirect(options: {
    port: number;
    path: string;
    timeout?: number;
    page?: string;
  }): Promise<Record<string, string>>;
};

interface Session {
  access: string;
  refresh: string;
  expiresAt: number;
}

export function clientId() {
  const id = setting("clientId");
  if (!id) throw fail("setup", t("Paste the Client ID of your Spotify app in the plugin's settings first"));
  return id;
}

export const hasSession = () => Boolean(storage.get<Session>("session")?.refresh);

// connected says Spotify can be asked, without asking it.
export const connected = () => Boolean(setting("clientId")) && hasSession();

export function endSession() {
  storage.remove("session");
  storage.remove("me");
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), ...params }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw Object.assign(new Error(body.error_description || body.error || `Spotify token: ${res.status}`), {
      oauth: body.error,
    });
  }
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

function keep(tokens: { access_token: string; refresh_token?: string; expires_in: number }, previous?: Session) {
  const s: Session = {
    access: tokens.access_token,
    refresh: tokens.refresh_token || previous?.refresh || "",
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  storage.set("session", s);
  return s;
}

// Requests that find the token expired together share one refresh: Spotify
// may rotate the refresh token and refuse the old one.
let refreshing: Promise<Session> | null = null;

export async function accessToken(force = false) {
  let s = storage.get<Session>("session");
  if (!s?.refresh) throw fail("signIn", t("Sign in to Spotify first"));
  if (force || Date.now() > s.expiresAt - 60_000) {
    const current = s;
    refreshing ||= tokenRequest({ grant_type: "refresh_token", refresh_token: current.refresh })
      .then(
        (tokens) => keep(tokens, current),
        (e) => {
          if (e?.oauth !== "invalid_grant") throw e;
          endSession();
          throw fail("signIn", t("Your Spotify session has ended: sign in again"));
        },
      )
      .finally(() => (refreshing = null));
    s = await refreshing;
  }
  return s.access;
}

function randomString(length: number) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  for (let i = 0; i < length; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

let pending: Promise<void> | null = null;

// authorize has the listener approve the app in their browser, and keeps the
// session Spotify answers with. One runs at a time.
export function authorize() {
  pending ||= run().finally(() => (pending = null));
  return pending;
}

async function run() {
  const id = clientId();
  const verifier = randomString(64);
  const state = randomString(16);
  // Listen before the browser opens: Spotify sends an app it already approved
  // straight back.
  const back = browser.waitForRedirect({
    port: REDIRECT_PORT,
    path: "/callback",
    timeout: 4 * 60 * 1000,
    page: t("Signed in to Spotify. You can close this page."),
  });
  const query = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: base64url(sha256(new TextEncoder().encode(verifier))),
  });
  host.signInPrompt({ text: t("Approve access to Spotify in your browser") });
  browser.openURL(`${ACCOUNTS}/authorize?${query}`);
  const answer = await back;
  if (answer.state !== state) throw new Error(t("That Spotify sign-in wasn't this one: try again"));
  if (answer.error) {
    throw new Error(
      answer.error === "access_denied" ? t("Spotify sign-in was cancelled") : `Spotify: ${answer.error}`,
    );
  }
  keep(
    await tokenRequest({
      grant_type: "authorization_code",
      code: answer.code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  );
  storage.remove("me");
}
