import { DashboardPage } from "@/components/GplxPages";
import { questionBank } from "@/data/questions";

export default function Home() {
  return <DashboardPage questions={questionBank} />;
}
