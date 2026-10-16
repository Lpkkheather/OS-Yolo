export { cn } from "cn";

export default function formatDate(date: string) {
  const eventDate = new Date(date);
  const dateText = eventDate.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timeText = eventDate.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${timeText} | ${dateText}`
}
