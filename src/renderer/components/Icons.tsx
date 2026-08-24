interface IconProps {
  size?: number
}

function Svg({
  size = 14,
  children
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function ChevronRight(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 11}>
      <path d="M6 3.5L10.5 8L6 12.5" />
    </Svg>
  )
}

export function FileIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 1.8H4.4a1 1 0 00-1 1v10.4a1 1 0 001 1h7.2a1 1 0 001-1V5.5L9 1.8z" />
      <path d="M9 1.9v3.4h3.4" />
    </Svg>
  )
}

export function FolderIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M1.9 4.2a1 1 0 011-1h2.9l1.4 1.6h5.9a1 1 0 011 1v6.1a1 1 0 01-1 1H2.9a1 1 0 01-1-1V4.2z" />
    </Svg>
  )
}

export function SidebarIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M6.4 3v10" />
    </Svg>
  )
}

export function PreviewIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <path d="M1.6 8S3.9 4 8 4s6.4 4 6.4 4-2.3 4-6.4 4-6.4-4-6.4-4z" />
      <circle cx="8" cy="8" r="1.7" />
    </Svg>
  )
}

export function EditIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <path d="M11 2.4l2.6 2.6L5.5 13.1 2.3 13.7l.6-3.2L11 2.4z" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 13}>
      <circle cx="7.1" cy="7.1" r="4.6" />
      <path d="M10.5 10.5l3 3" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 12}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  )
}

export function SwapIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M2.6 5.4h8.2M8.4 3l2.4 2.4-2.4 2.4" />
      <path d="M13.4 10.6H5.2M7.6 8.2l-2.4 2.4 2.4 2.4" />
    </Svg>
  )
}

export function KeyboardIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <rect x="1.2" y="3.9" width="13.6" height="8.2" rx="1.5" />
      <path d="M4 6.6h.01M6.4 6.6h.01M8.8 6.6h.01M11.2 6.6h.01M5.2 9.4h5.6" />
    </Svg>
  )
}

export function SunIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.4v1.5M8 13.1v1.5M14.6 8h-1.5M2.9 8H1.4M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props} size={props.size ?? 15}>
      <path d="M13.3 9.6A5.8 5.8 0 016.4 2.7a5.8 5.8 0 106.9 6.9z" />
    </Svg>
  )
}
