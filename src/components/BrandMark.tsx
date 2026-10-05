// Знак бренда — логотип GEO QUEST GROUP (круглый, public/logo-sm.png).
export default function BrandMark({ size }: { size?: number }) {
  return (
    <span className="brand-mark" style={size ? { width: size, height: size } : undefined}>
      <img src={`${import.meta.env.BASE_URL}logo-sm.png`} alt="" width={96} height={96} draggable={false} />
    </span>
  )
}
