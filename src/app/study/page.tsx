import { StudyPage } from "@/components/GplxPages";
import { questionBank } from "@/data/questions";

export default function Study() {
  return <StudyPage questions={questionBank} />;
}
