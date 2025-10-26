import * as React from 'react'

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ ...(props.style||{}), borderRadius:12, border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 1px 2px rgba(0,0,0,0.04)' }} />
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ ...(props.style||{}), padding:16, paddingBottom:0 }} />
}
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} style={{ ...(props.style||{}), fontSize:16, fontWeight:600, margin:0 }} />
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ ...(props.style||{}), padding:16 }} />
}
