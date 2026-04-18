import { useId } from 'react'

interface IntensityControlProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label?: string
  description?: string
}

export function IntensityControl({
  value,
  onChange,
  min = 1,
  max = 8,
  label = 'Red Team intensity',
  description = 'Number of attack cases to generate',
}: IntensityControlProps) {
  const id = useId()
  const step = 1

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10)
    if (!Number.isNaN(newValue) && newValue >= min && newValue <= max) {
      onChange(newValue)
    }
  }

  const handleSliderInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, clickX / rect.width))
    const newValue = Math.round(percentage * (max - min) + min)
    if (newValue >= min && newValue <= max) {
      onChange(newValue)
    }
  }

  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-white">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Low</span>
          <span className="min-w-12 rounded-full bg-white/[0.06] px-2.5 py-1 text-center text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/20">
            {value}
          </span>
          <span className="text-xs text-slate-500">High</span>
        </div>
      </div>
      
      <p className="text-xs text-slate-400">{description}</p>

      <div 
        className="relative h-3 cursor-pointer touch-none select-none"
        onClick={handleSliderInteraction}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-labelledby={id}
        tabIndex={0}
      >
        <div className="absolute inset-0 rounded-full bg-white/[0.08]" />
        
        <div
          className="absolute top-0 h-full rounded-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-amber-400 transition-all duration-150"
          style={{ width: `${percentage}%` }}
        />
        
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200 bg-slate-900 shadow-lg shadow-cyan-400/20 transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          style={{ left: `${percentage}%` }}
        >
          <div className="absolute inset-0 animate-pulse rounded-full bg-cyan-400/30" />
        </div>
      </div>

      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="sr-only"
      />

      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-600">
        <span>{min} case</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: max }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i < value ? 'bg-cyan-400' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <span>{max} cases</span>
      </div>
    </div>
  )
}