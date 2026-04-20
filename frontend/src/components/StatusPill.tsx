type Props = {
  tone: "neutral" | "good" | "warn" | "bad";
  children: string;
};

export function StatusPill({ tone, children }: Props) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

