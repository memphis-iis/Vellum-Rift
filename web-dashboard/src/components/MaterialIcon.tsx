type MaterialIconProps = {
  name: string;
  filled?: boolean;
  className?: string;
};

export function MaterialIcon({ name, filled = false, className = "" }: MaterialIconProps) {
  return (
    <span
      className={`vr-app__material-icon${filled ? " vr-app__material-icon--fill" : ""} ${className}`.trim()}
      aria-hidden
    >
      {name}
    </span>
  );
}
