import { formatTime } from "@/lib/exam";

export function Timer({ secondsLeft }: { secondsLeft: number }) {
  return <span>{formatTime(secondsLeft)}</span>;
}
