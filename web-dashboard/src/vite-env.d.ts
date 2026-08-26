/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BLUEKEY_SOFTWARE_ID?: string;
  readonly VITE_BLUEKEY_PORTAL_URL?: string;
  readonly VITE_BLUEKEY_ORIGIN?: string;
  readonly VITE_AUTH_REQUIRED?: string;
  readonly VITE_HOME_BG_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  alt?: string;
  poster?: string;
  exposure?: string;
  loading?: string;
  reveal?: string;
  class?: string;
  "camera-controls"?: boolean;
  "touch-action"?: string;
  "shadow-intensity"?: string;
  "interaction-prompt"?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}

export {};
