"use client";
// Glass orb: a CSS-rendered still plate (clear sphere + swirling blue-violet core) with an optional
// looping video layered on top. shortcut: no CDN video ships with the repo; set NEXT_PUBLIC_ORB_VIDEO_URL to use one.
import { useState } from "react";

const VIDEO = process.env.NEXT_PUBLIC_ORB_VIDEO_URL;

export default function Orb() {
  const [ready, setReady] = useState(false);
  return (
    <div className="orb" data-enter="orb" aria-hidden="true">
      <div className="orb-plate">
        <div className="orb-core" />
        <div className="orb-core orb-core-2" />
        <div className="orb-glass" />
        <div className="orb-spec" />
      </div>
      {VIDEO && (
        <video className="orb-video" src={VIDEO} muted loop playsInline autoPlay preload="auto"
          onLoadedData={() => setReady(true)} style={{ opacity: ready ? 1 : 0 }} />
      )}
    </div>
  );
}
