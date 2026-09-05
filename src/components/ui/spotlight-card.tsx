"use client";

import { useRef, useState } from "react";

const LIGHT_SPOTLIGHT_COLOR = "#ede1df";
const DARK_SPOTLIGHT_COLOR = "rgb(217 93 63 / 22%)";

export const SpotlightCard = ({
  children,
  className = "",
  spotlightColor = LIGHT_SPOTLIGHT_COLOR,
  darkSpotlightColor =
    spotlightColor === LIGHT_SPOTLIGHT_COLOR
      ? DARK_SPOTLIGHT_COLOR
      : spotlightColor,
}: {
  children: any;
  className?: string;
  spotlightColor?: string;
  darkSpotlightColor?: string;
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: { clientX: number; clientY: number }) => {
    if (!divRef.current || isFocused) return;

    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(0.6);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    setOpacity(0.6);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative bg-neutral-900 overflow-hidden p-8 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
        style={{ opacity }}
      >
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
          }}
        />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${darkSpotlightColor}, transparent 80%)`,
          }}
        />
      </div>
      {children}
    </div>
  );
};
