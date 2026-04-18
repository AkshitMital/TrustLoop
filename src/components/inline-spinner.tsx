interface InlineSpinnerProps {
  size?: 'xs' | 'sm' | 'md'
  tone?: 'light' | 'dark' | 'accent' | 'amber'
}

const sizeClass = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
} as const

const toneClass = {
  light: 'border-white/20 border-t-white',
  dark: 'border-slate-950/25 border-t-slate-950',
  accent: 'border-cyan-200/20 border-t-cyan-200',
  amber: 'border-amber-100/25 border-t-amber-100',
} as const

export function InlineSpinner({
  size = 'sm',
  tone = 'light',
}: InlineSpinnerProps) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-solid ${sizeClass[size]} ${toneClass[tone]}`}
    />
  )
}
