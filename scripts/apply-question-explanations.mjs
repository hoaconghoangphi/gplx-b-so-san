import fs from "node:fs/promises";

const dataPath = "src/data/questions.json";

const explanations = {
  49: "Ghi nhớ: Sử dụng còi trong khu đông dân cư từ 05 giờ đến 22 giờ, trừ khu vực có biển cấm sử dụng còi.",
  60: "Ghi nhớ: Đỗ xe trong phố phải sát lề đường, vỉa hè bên phải; bánh xe gần nhất cách lề đường, vỉa hè không quá 0,25 m.",
  61: "Ghi nhớ: Khi dừng, đỗ xe trên đường phố hẹp phải cách xe ô tô đang đỗ ngược chiều tối thiểu 20 m.",
  140: "Ghi nhớ: Giấy phép lái xe chưa bị trừ hết 12 điểm sẽ được phục hồi đủ 12 điểm nếu không bị trừ điểm trong 12 tháng từ ngày bị trừ điểm gần nhất.",
  141: "Ghi nhớ: Bị trừ hết 12 điểm thì sau ít nhất 06 tháng được kiểm tra lại kiến thức pháp luật giao thông; đạt yêu cầu thì được phục hồi đủ 12 điểm.",
  171: "Ghi nhớ: Thời gian lái xe liên tục của lái xe ô tô kinh doanh vận tải không quá 4 giờ.",
  172: "Ghi nhớ: Thời gian làm việc của lái xe ô tô kinh doanh vận tải trong một ngày không quá 10 giờ.",
  277: "Ghi nhớ: Niên hạn sử dụng của xe ô tô tải tính từ năm sản xuất không quá 25 năm.",
  278: "Ghi nhớ: Niên hạn sử dụng của xe ô tô chở người trên 8 chỗ ngồi, không kể chỗ người lái, tính từ năm sản xuất không quá 20 năm.",
};

const questions = JSON.parse(await fs.readFile(dataPath, "utf-8"));
let changed = 0;

for (const question of questions) {
  const explanation = explanations[question.id];
  if (explanation && question.explanation !== explanation) {
    question.explanation = explanation;
    changed += 1;
  }
}

await fs.writeFile(dataPath, `${JSON.stringify(questions, null, 2)}\n`, "utf-8");
console.log(`Applied explanations to ${changed} questions.`);
