"use client";

type LoginResponse = { authResponse?: { code?: string } | null; status?: string };

export type FacebookSdk = {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: LoginResponse) => void, options: Record<string, unknown>): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

// Keep in step with META_GRAPH_VERSION on the server.
const GRAPH_VERSION = "v25.0";

let sdkPromise: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const init = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve(window.FB!);
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("טעינת ה-SDK של פייסבוק נכשלה (חוסם פרסומות?)"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}
