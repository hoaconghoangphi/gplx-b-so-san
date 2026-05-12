import fs from "node:fs";

const dataPath = "src/data/questions.json";

const answerRepairs = {
  73: ["Biển báo nguy hiểm.", "Biển báo cấm.", "Biển báo hiệu lệnh.", "Biển báo chỉ dẫn."],
  236: ["Phanh tay đang hãm.", "Thiếu dầu phanh.", "Nhiệt độ nước làm mát tăng quá mức cho phép.", "Dầu bôi trơn bị thiếu."],
  238: [
    "Thiếu dầu phanh, phanh tay đang hãm.",
    "Hệ thống túi khí an toàn gặp sự cố.",
    "Lái xe và người ngồi ghế trước chưa cài dây an toàn.",
    "Cửa đóng chưa chặt, có cửa chưa đóng.",
  ],
  239: ["Báo hiệu thiếu dầu phanh.", "Áp suất lốp không đủ.", "Đang hãm phanh tay.", "Sắp hết nhiên liệu."],
  293: ["Báo hiệu hệ thống chống bó cứng khi phanh bị lỗi.", "Áp suất lốp không đủ.", "Đang hãm phanh tay.", "Cần kiểm tra động cơ."],
  294: ["Báo hiệu thiếu dầu phanh.", "Áp suất lốp không đủ.", "Đang hãm phanh tay.", "Sắp hết nhiên liệu."],
  301: [
    "Nhiệt độ nước làm mát động cơ quá ngưỡng cho phép.",
    "Áp suất lốp không đủ.",
    "Đang hãm phanh tay.",
    "Hệ thống lái gặp trục trặc.",
  ],
  303: ["Thay lốp xe.", "Chữa cháy.", "Phá cửa kính xe ô tô trong các trường hợp khẩn cấp.", "Vặn ốc để tháo lắp bánh xe."],
  304: ["Thay lốp xe.", "Chữa cháy trong các trường hợp hỏa hoạn.", "Phá cửa kính xe ô tô trong các trường hợp khẩn cấp.", "Cầm máu cho người bị nạn."],
  309: ["Biển 1.", "Biển 2.", "Cả hai biển."],
  339: ["Tốc độ tối đa cho phép về ban đêm cho các phương tiện là 70 km/h.", "Tốc độ tối thiểu cho phép về ban đêm cho các phương tiện là 70 km/h."],
  448: ["Biển 1.", "Biển 2.", "Biển 3.", "Biển 1 và 2."],
  454: ["Biển 1.", "Biển 2.", "Cả hai biển.", "Không biển nào."],
  465: ["Được phép chuyển sang làn khác.", "Không được phép chuyển sang làn khác, chỉ được đi trong làn quy định theo biển."],
  478: ["Vạch 1.", "Vạch 2.", "Vạch 3.", "Vạch 1 và 2."],
  479: ["Vạch 1.", "Vạch 2.", "Vạch 3.", "Cả 3 vạch."],
  481: ["Phân chia hai chiều xe chạy ngược chiều nhau.", "Phân chia các làn xe chạy cùng chiều nhau."],
  482: ["Phân chia hai chiều xe chạy ngược chiều nhau.", "Phân chia các làn xe chạy cùng chiều nhau."],
  484: ["Để xác định làn đường.", "Báo hiệu người lái xe chỉ được phép đi thẳng.", "Dùng để xác định khoảng cách giữa các phương tiện trên đường."],
  485: [
    "Báo cho người điều khiển không được dừng phương tiện trong phạm vi phần mặt đường có bố trí vạch để tránh ùn tắc giao thông.",
    "Báo hiệu sắp đến chỗ có bố trí vạch đi bộ qua đường.",
    "Dùng để xác định khoảng cách giữa các phương tiện trên đường.",
  ],
  486: [
    "Vị trí dừng xe của các phương tiện vận tải hành khách công cộng.",
    "Báo cho người điều khiển được dừng phương tiện trong phạm vi phần mặt đường có bố trí vạch để tránh ùn tắc giao thông.",
    "Dùng để xác định vị trí giữa các phương tiện trên đường.",
  ],
  498: ["Xe công an.", "Xe chữa cháy."],
  501: ["Xe công an.", "Xe quân sự."],
  508: ["Cả hai xe.", "Không xe nào vi phạm.", "Chỉ xe mô tô vi phạm.", "Chỉ xe tải vi phạm."],
  515: ["Không.", "Vi phạm."],
  518: ["Không đúng.", "Đúng."],
  528: [
    "Các xe ở phía tay phải và tay trái của người điều khiển được phép đi thẳng.",
    "Cho phép các xe ở mọi hướng được rẽ phải.",
    "Tất cả các xe phải dừng lại trước ngã tư, trừ những xe đã ở trong ngã tư được phép tiếp tục đi.",
  ],
  536: ["Xe công an, xe con, xe tải, xe khách.", "Xe con, xe khách và xe công an, xe tải.", "Xe công an, xe con, xe khách, xe tải.", "Xe con, xe tải, xe khách, xe công an."],
  544: ["Nhường xe con rẽ trái trước.", "Đi thẳng không nhường."],
  545: ["Chỉ hướng 2.", "Hướng 1 và 2.", "Tất cả các hướng trừ hướng 3.", "Tất cả các hướng trừ hướng 4."],
  546: ["Xe con (A).", "Xe con (B)."],
  550: ["Quay đầu theo hướng A.", "Quay đầu theo hướng B.", "Cấm quay đầu."],
  551: ["Xe con và xe tải, xe của bạn.", "Xe của bạn, xe tải, xe con.", "Xe của bạn và xe con, xe tải.", "Xe của bạn, xe tải + xe con."],
  552: [
    "Tăng tốc cho xe chạy vượt qua.",
    "Bật tín hiệu báo hiệu bằng đèn hoặc còi, khi đủ điều kiện an toàn, tăng tốc cho xe chạy vượt qua.",
    "Đánh lái sang làn bên trái và tăng tốc cho xe chạy vượt qua.",
  ],
  556: ["Cho phép.", "Không được vượt."],
  557: ["Vị trí A và B.", "Vị trí A và C.", "Vị trí B và C.", "Cả ba vị trí A, B, C."],
  558: ["Được phép dừng ở vị trí A.", "Được phép dừng ở vị trí B.", "Được phép dừng ở vị trí A và B.", "Không được dừng."],
  559: ["Xe mô tô.", "Xe ô tô con.", "Không xe nào vi phạm.", "Cả hai xe."],
  564: [
    "Đánh lái sang trái cho xe vượt qua.",
    "Quan sát phía trước, phía sau, khi đủ điều kiện an toàn, bật tín hiệu bằng đèn hoặc còi rồi cho xe chạy vượt qua.",
    "Cấm vượt.",
  ],
  567: ["Xe của bạn, mô tô, xe con.", "Xe con, xe của bạn, mô tô.", "Mô tô, xe con, xe của bạn."],
  571: ["Chuyển sang làn đường bên phải và rẽ phải.", "Dừng lại trước vạch dừng và rẽ phải khi đèn xanh.", "Dừng lại trước vạch dừng và đi thẳng hoặc rẽ trái khi đèn xanh."],
  573: [
    "Tăng tốc độ, rẽ phải trước xe con màu xanh phía trước và người đi bộ.",
    "Giảm tốc độ, để người đi bộ qua đường và rẽ phải trước xe con màu xanh.",
    "Giảm tốc độ, để người đi bộ qua đường và rẽ phải sau xe con màu xanh.",
  ],
  575: ["Xe con.", "Xe tải.", "Xe của bạn."],
  576: ["Xe đi ngược chiều.", "Xe của bạn."],
  577: ["Tăng tốc độ, chuyển sang làn đường bên trái để vượt.", "Không được vượt những người đi xe đạp."],
  578: [
    "Nếu phía sau không có xe xin vượt, chuyển sang làn đường bên trái.",
    "Nếu phía sau có xe xin vượt, thì giảm tốc độ, ở lại làn đường, dừng lại khi cần thiết.",
    "Tăng tốc độ trên làn đường của mình và vượt xe con.",
    "Cả ý 1 và ý 2.",
  ],
  579: ["Chuyển sang nửa đường bên trái để đi tiếp.", "Bấm còi, nháy đèn báo hiệu và đi tiếp.", "Giảm tốc độ, dừng lại nhường đường."],
  582: ["Tăng tốc độ và đi thẳng qua ngã tư.", "Dừng xe trước vạch dừng.", "Giảm tốc độ và đi thẳng qua ngã tư."],
  583: ["Xe của bạn, mô tô, xe đạp.", "Xe mô tô, xe đạp, xe của bạn.", "Xe đạp, xe mô tô, xe của bạn."],
  585: ["Xe của bạn.", "Xe con."],
  587: [
    "Tăng tốc độ, đi qua vạch người đi bộ sang đường, để người đi bộ sang đường sau.",
    "Giảm tốc độ, đi qua vạch người đi bộ sang đường, để người đi bộ sang đường sau.",
    "Giảm tốc độ, để người đi bộ sang đường trước, sau đó cho xe đi qua vạch người đi bộ sang đường.",
  ],
  588: ["Xe con.", "Xe của bạn."],
  590: ["Tăng tốc độ cho xe lấn sang phần đường bên trái.", "Giảm tốc độ cho xe lấn sang phần đường bên trái.", "Giảm tốc độ cho xe đi sát phần đường bên phải."],
  591: ["Xe tải.", "Xe của bạn."],
  593: ["Xe tải, xe đạp, xe của bạn.", "Xe của bạn, xe đạp, xe tải.", "Xe của bạn, xe tải, xe đạp."],
  595: [
    "Bật đèn chiếu xa, tăng tốc độ vượt xe cùng chiều.",
    "Giữ nguyên đèn chiếu gần, giảm tốc độ, đi sau xe phía trước.",
    "Giữ nguyên đèn chiếu gần, tăng tốc độ vượt xe cùng chiều.",
  ],
};

function cleanAnswer(value) {
  let text = value.normalize("NFC").replace(/\s+/g, " ").trim();

  text = text
    .replace(/^[-–—\s]+/u, "")
    .replace(/^(?:[O0]\?|[O0][1-4]|O[Iil1tTrnNZSš^]|O\^|C22|C2[#2]?|C[ÐD][1-4]?|[ÐD][1-4]|[lI]@[\p{L}\d]*|[@®©]+)\s*[\.\-:)]?\s*/iu, "")
    .replace(/^[1-4]\s*[\.\-:]\s*/u, "");

  text = text
    .replace(/\bOthiều\b/giu, "chiều")
    .replace(/\bOohay\b/giu, "chạy")
    .replace(/\bOcro\b/giu, "cho")
    .replace(/\bOxe\b/giu, "xe")
    .replace(/\bOn cho\b/giu, "dành cho")
    .replace(/kể Os chỗ/gu, "kể cả chỗ")
    .replace(/\bOS vận chuyển\b/gu, "để vận chuyển")
    .replace(/\bOm toàn\b/giu, "an toàn")
    .replace(/\bOrước\b/giu, "trước")
    .replace(/Océ/gu, "của")
    .replace(/\bOOiuôn\b/giu, "luôn")
    .replace(/\bOsứ khóa\b/giu, "khóa")
    .replace(/\bOtv\b/giu, "trục")
    .replace(/\bC2xe Chạy\b/gu, "xe chạy")
    .replace(/\bC2khi\b/gu, "khi")
    .replace(/C2dốc/gu, "dốc")
    .replace(/C2hành/gu, "hành")
    .replace(/C2phải/gu, "phải")
    .replace(/C2só/gu, "có")
    .replace(/trường C2hẹp/gu, "trường hợp")
    .replace(/C2sán/gu, "sản")
    .replace(/C2\)\s*/gu, "")
    .replace(/cảý\s*1và\s*ý\s*2/giu, "Cả ý 1 và ý 2")
    .replace(/[Ggả]?ảý/gu, "Cả ý")
    .replace(/cảý/giu, "Cả ý")
    .replace(/vàý/giu, "và ý")
    .replace(/ý\s*a?(\d)/giu, "ý $1")
    .replace(/ý\s*(\d)\s*và/giu, "ý $1 và")
    .replace(/CÓ/g, "có")
    .replace(/đÔng/g, "đông")
    .replace(/Phố/g, "phố")
    .replace(/dấãn/g, "dẫn")
    .replace(/đường năm/g, "đường nằm")
    .replace(/\(\s*Dvật/g, "vật")
    .replace(/\(\s*có/g, "có")
    .replace(/CòÒi/g, "còi")
    .replace(/Csố\./g, "số,")
    .replace(/COn/g, "con")
    .replace(/Chở/g, "chở")
    .replace(/Ssiảm/g, "giảm")
    .replace(/buông lái/g, "buồng lái")
    .replace(/khu đông dân cu,/g, "khu đông dân cư,")
    .replace(/3osn đường/g, "đoạn đường")
    .replace(/hạn chế\?\s*khi/giu, "hạn chế; khi")
    .replace(/DỘ/gu, "bộ")
    .replace(/Mô\?ô/gu, "Mô tô")
    .replace(/\[\)\s*vi\b/giu, "vì")
    .replace(/@Œ\s*S[úu]ng/giu, "đúng")
    .replace(/@["“”]?\s*5\s*vệ/giu, "bảo vệ")
    .replace(/@(?:[®©*°^"%\\\/]|\s)*/gu, "")
    .replace(/[®©ŒŸ]/gu, "")
    .replace(/\bC22[:;]?\s*/gu, "")
    .replace(/\bC2(?=\s|[\p{Lu}])/gu, "")
    .replace(/\bC[ÐD](?=\p{L})/gu, "")
    .replace(/\bC[ÐD]\s*/gu, "")
    .replace(/\bO[1-4]\s*/gu, "")
    .replace(/\bO\?\s*/gu, "")
    .replace(/\(\s*\)\s*/gu, " ")
    .replace(/\s+([,.;:])/gu, "$1");

  const openParens = (text.match(/\(/g) ?? []).length;
  const closeParens = (text.match(/\)/g) ?? []).length;
  if (openParens > closeParens) {
    text = text.replace(/\((?=[\p{L}\d])/gu, "");
  }

  return text.replace(/\s+/g, " ").replace(/^[\s.,;:^)\]-]+/u, "").trim();
}

const questions = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
let cleaned = 0;

for (const question of questions) {
  if (answerRepairs[question.id]) {
    question.answers = answerRepairs[question.id];
  }

  question.answers = question.answers.map((answer) => {
    const next = cleanAnswer(answer);
    if (next !== answer) {
      cleaned += 1;
    }
    return next;
  });
}

fs.writeFileSync(dataPath, `${JSON.stringify(questions, null, 2)}\n`, "utf-8");
console.log(`Repaired ${Object.keys(answerRepairs).length} question answer sets.`);
console.log(`Cleaned ${cleaned} answer strings.`);
