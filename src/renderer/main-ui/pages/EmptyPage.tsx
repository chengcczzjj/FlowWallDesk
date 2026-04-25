export function EmptyPage(props: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="page">
      <div className="empty-page">
        {props.icon}
        <div className="empty-page__title">{props.title}</div>
        {props.subtitle && <div>{props.subtitle}</div>}
      </div>
    </div>
  )
}
