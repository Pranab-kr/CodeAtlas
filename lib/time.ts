/**
 * Clock reads happen here so a component render doesn't call an impure
 * function directly. One read per render, not one per row.
 */
export function now(): number {
  return Date.now();
}

const updatedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${updatedAtFormatter.format(date)} UTC`;
}
