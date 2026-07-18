import React from 'react'

interface IconProps {
  size?: number
}

function icon(path: React.ReactNode) {
  return function Icon({ size = 16 }: IconProps) {
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
        {path}
      </svg>
    )
  }
}

export const RegionIcon = icon(
  <>
    <rect x="2.5" y="3.5" width="11" height="9" rx="1" strokeDasharray="2.6 1.8" />
    <circle cx="4.5" cy="5.5" r="2.6" fill="currentColor" stroke="none" />
    <text x="4.5" y="6.7" fontSize="4.4" fontWeight="bold" fill="#fff" stroke="none" textAnchor="middle">
      1
    </text>
  </>
)

export const ArrowIcon = icon(
  <>
    <path d="M3 13 L12 4" />
    <path d="M7.5 3.5 H12.5 V8.5" />
  </>
)

export const PenIcon = icon(
  <path d="M2.5 13.5 c 1 -4 2.5 -5.5 4.5 -5 s 1.5 3 3.5 2.5 s 2.5 -3.5 3 -6.5" />
)

export const BoxIcon = icon(<rect x="3" y="4" width="10" height="8" rx="0.5" />)

export const CircleIcon = icon(<ellipse cx="8" cy="8" rx="5.5" ry="4.5" />)

export const EditIcon = icon(
  <path d="M4 2.5 L12.5 8.5 L8.7 9.3 L7 13 Z" fill="currentColor" />
)

export const HandIcon = icon(
  <path d="M5 7.5 V4 a1 1 0 0 1 2 0 v2.5 V3.4 a1 1 0 0 1 2 0 V6.5 V4.2 a1 1 0 0 1 2 0 V7 c.8-.8 1.8-1 2.3-.3 .4.6 0 1.3-.8 2.3 l-2 2.7 a3.4 3.4 0 0 1 -2.8 1.4 H7 a3 3 0 0 1 -2.4-1.2 L3 9.8 c-.5-.7-.3-1.5.3-1.8 .6-.3 1.2 0 1.7.6 Z" />
)

export const UndoIcon = icon(
  <>
    <path d="M3 6.5 H10 a3 3 0 0 1 0 6 H6" />
    <path d="M5.5 4 L3 6.5 L5.5 9" />
  </>
)

export const RedoIcon = icon(
  <>
    <path d="M13 6.5 H6 a3 3 0 0 0 0 6 h4" />
    <path d="M10.5 4 L13 6.5 L10.5 9" />
  </>
)

export const FitIcon = icon(
  <>
    <path d="M6 2.5 H2.5 V6" />
    <path d="M10 2.5 H13.5 V6" />
    <path d="M6 13.5 H2.5 V10" />
    <path d="M10 13.5 H13.5 V10" />
  </>
)

export const ZoomInIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 L13.5 13.5" />
    <path d="M5 7 H9 M7 5 V9" />
  </>
)

export const ZoomOutIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 L13.5 13.5" />
    <path d="M5 7 H9" />
  </>
)

export const FocusIcon = icon(
  <>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1" />
    <path d="M2 5 V3 a1 1 0 0 1 1-1 h2 M11 2 h2 a1 1 0 0 1 1 1 v2 M14 11 v2 a1 1 0 0 1 -1 1 h-2 M5 14 H3 a1 1 0 0 1 -1-1 v-2" />
  </>
)

export const PlusIcon = icon(<path d="M8 3 V13 M3 8 H13" />)

export const ImageIcon = icon(
  <>
    <rect x="2.5" y="3" width="11" height="10" rx="1" />
    <circle cx="6" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    <path d="M2.5 11 L6.5 8 L9 10 L11 8.5 L13.5 10.5" />
  </>
)

export const BlankIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <path d="M8 5.5 V10.5 M5.5 8 H10.5" />
  </>
)

export const LibraryIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="4.5" height="11" rx="0.8" />
    <rect x="9" y="2.5" width="4.5" height="7" rx="0.8" />
  </>
)

export const ExportIcon = icon(
  <>
    <path d="M8 10 V2.5 M5 5 L8 2 L11 5" />
    <path d="M3 9.5 V12.5 a1 1 0 0 0 1 1 h8 a1 1 0 0 0 1-1 V9.5" />
  </>
)

export const DotsIcon = icon(
  <>
    <circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </>
)

export const TrashIcon = icon(
  <>
    <path d="M3 4.5 H13" />
    <path d="M6 4.5 V3 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 v1.5" />
    <path d="M4.5 4.5 L5.2 13 a1 1 0 0 0 1 1 h3.6 a1 1 0 0 0 1-1 L11.5 4.5" />
  </>
)

export const DuplicateIcon = icon(
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 3 H3.5 a1 1 0 0 0 -1 1 v7" />
  </>
)

export const UpIcon = icon(<path d="M4 10 L8 5.5 L12 10" />)
export const DownIcon = icon(<path d="M4 6 L8 10.5 L12 6" />)
export const CloseIcon = icon(<path d="M4 4 L12 12 M12 4 L4 12" />)
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 L13.5 13.5" />
  </>
)
export const ClearMarksIcon = icon(
  <>
    <path d="M11 2.5 L13.5 5 L6.5 12 H4 V9.5 Z" />
    <path d="M3 14 H13" />
  </>
)

export function LogoMark({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="17" height="17" rx="4.5" fill="#2a7d6c" />
      <rect x="5" y="6" width="10" height="8" rx="1" stroke="#fff" strokeWidth="1.3" strokeDasharray="2.4 1.7" />
      <circle cx="6.4" cy="7.2" r="2.4" fill="#ffc53d" />
      <text x="6.4" y="8.3" fontSize="3.6" fontWeight="bold" fill="#1c2024" textAnchor="middle">
        1
      </text>
    </svg>
  )
}
