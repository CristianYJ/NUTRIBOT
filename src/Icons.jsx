const paths = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  pantry: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="3" />
      <path d="M8 5V3m8 2V3M4 10h16m-12 5h3m2 0h3" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
      <path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C7 2 2 8 5 15c6 9 17 0 15-12Z" />
      <path d="m3 21 12-12" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="m11 13 11-11" />
    </>
  ),
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10 18h4" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M12 17v4m-5 0h10" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  reset: (
    <>
      <path d="M3 10a9 9 0 1 1 1 7M3 3v7h7" />
    </>
  ),
  chef: (
    <>
      <path d="M6 14a5 5 0 1 1 1-10 6 6 0 0 1 10 0 5 5 0 1 1 1 10v7H6Zm0 3h12" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  thumbs: (
    <>
      <path d="M7 10h-4v11h4Zm0 0 5-8c3 0 3 3 1 7h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7Z" />
    </>
  ),
  fire: (
    <path d="M12 2c3 6 8 8 8 13a8 8 0 0 1-16 0c0-3 2-6 4-8 0 5 2 5 2 5s3-4 2-10Z" />
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  bag: (
    <>
      <path d="M5 7h14l2 14H3Zm3 0V5a4 4 0 0 1 8 0v2" />
    </>
  ),
};
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.leaf}
    </svg>
  );
}
