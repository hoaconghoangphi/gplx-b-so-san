import { ExamPage } from "@/components/GplxPages";
import { questionBank } from "@/data/questions";

export default function Exam() {
  return <ExamPage questions={questionBank} />;
}
