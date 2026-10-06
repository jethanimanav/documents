/// <reference types="google.accounts" />

declare global {
  interface Window {
    google?: typeof google;
  }
}

export {};
