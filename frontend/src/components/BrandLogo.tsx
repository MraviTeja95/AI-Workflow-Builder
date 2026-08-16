"use client";

import React from "react";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export function BrandLogo({ size = 30, className = "" }: BrandLogoProps) {
  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        background: "var(--accent)",
      }}
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Connected workflow flow paths */}
        <path
          d="M4.5 12h5a3 3 0 0 1 3 3v2a2 2 0 0 0 2 2h5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 15a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2h8"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Node endpoints */}
        <circle cx="4.5" cy="12" r="2.2" fill="white" />
        <circle cx="19.5" cy="5" r="2.2" fill="white" />
        <circle cx="19.5" cy="19" r="2.2" fill="white" />
        {/* Central node */}
        <circle cx="12" cy="12" r="1.6" fill="rgba(255,255,255,0.7)" />
      </svg>
    </div>
  );
}
