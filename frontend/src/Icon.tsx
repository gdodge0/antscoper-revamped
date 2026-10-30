export type IconName =
  | "search"
  | "star"
  | "back"
  | "close"
  | "location"
  | "external"
  | "share"
  | "plus"
  | "minus"
  | "info";
const paths: Record<IconName, string> = {
  search: "M192 112a80 80 0 1 1-160 0 80 80 0 0 1 160 0ZM172 172l52 52",
  star: "m128 24 32 68 74 9-54 51 14 73-66-36-66 36 14-73-54-51 74-9Z",
  back: "m160 48-80 80 80 80",
  close: "m72 72 112 112M184 72 72 184",
  location:
    "M216 128a88 88 0 1 1-176 0 88 88 0 0 1 176 0ZM128 20v36m0 144v36M20 128h36m144 0h36M152 128a24 24 0 1 1-48 0 24 24 0 0 1 48 0Z",
  external: "M64 192 192 64M88 64h104v104",
  share: "M80 96H48v120h160V96h-32M128 152V24m-40 40 40-40 40 40",
  plus: "M128 48v160M48 128h160",
  minus: "M48 128h160",
  info: "M224 128a96 96 0 1 1-192 0 96 96 0 0 1 192 0ZM128 112v64m0-96v1",
};
export function Icon({
  name,
  filled = false,
  size = 20,
}: {
  name: IconName;
  filled?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
