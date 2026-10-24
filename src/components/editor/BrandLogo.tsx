import { useId } from "react";

export default function BrandLogo({
  className,
  label = "ตัดต่อโปร Studio",
}: {
  className: string;
  label?: string;
}) {
  const id = useId().replaceAll(":", "");
  const backgroundId = `${id}-background`;
  const pointerId = `${id}-pointer`;

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={backgroundId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#a21caf" />
        </linearGradient>
        <linearGradient id={pointerId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${backgroundId})`} />
      <path
        d="M137 83v329l88-79 62 113 65-35-62-113 121-4L137 83Z"
        fill={`url(#${pointerId})`}
        stroke="#3b0764"
        strokeLinejoin="round"
        strokeWidth="18"
      />
      <path
        d="m236 327 53-48"
        fill="none"
        stroke="#c084fc"
        strokeLinecap="round"
        strokeWidth="15"
      />
    </svg>
  );
}
