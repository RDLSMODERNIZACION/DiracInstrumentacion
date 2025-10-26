import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export default function Button({ className = '', variant = 'default', size = 'sm', ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-2xl text-sm font-medium shadow-sm transition active:scale-[.98]
        ${size === 'sm' ? 'px-3 py-1.5' : size === 'lg' ? 'px-5 py-3' : 'px-4 py-2'}
        ${variant === 'default' ? 'bg-slate-900 text-white hover:bg-slate-800' : ''}
        ${variant === 'ghost' ? 'bg-transparent hover:bg-slate-100' : ''}
        ${variant === 'outline' ? 'border border-slate-300 hover:bg-slate-50' : ''}
        ${className}`}
      {...props}
    />
  )
}
