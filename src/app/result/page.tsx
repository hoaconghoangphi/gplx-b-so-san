import { ResultPage } from "@/components/GplxPages";
import { questionBank } from "@/data/questions";

export default function Result() {
  return <ResultPage questions={questionBank} />;
}
