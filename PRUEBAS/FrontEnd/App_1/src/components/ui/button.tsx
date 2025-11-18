import * as React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline' }
export const Button: React.FC<ButtonProps> = ({ variant='default', style, ...rest }) => {
  const base: React.CSSProperties = {
    padding:'8px 12px',
    borderRadius:10,
    border:'1px solid rgba(0,0,0,0.08)',
    cursor:'pointer',
    background: variant==='outline' ? 'transparent' : 'rgba(0,0,0,0.04)'
  }
  return <button {...rest} style={{ ...base, ...(style||{}) }} />
}
