import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const dataPath = "src/data/questions.json";
const referenceDir = ".codex-temp/reference-images";
const useLegacyManualRepairs = false;

const manualQuestionRepairs = {
  17: "Hành vi nào dưới đây bị nghiêm cấm?",
  24: "Theo Luật phòng chống tác hại của rượu, bia, đối tượng nào dưới đây bị cấm sử dụng rượu, bia khi tham gia giao thông?",
  49: "Người ngồi trên xe mô tô hai bánh, xe mô tô ba bánh, xe gắn máy khi tham gia giao thông có được bám, kéo hoặc đẩy các phương tiện khác không?",
  114: "Khi gặp một đoàn xe, một đoàn xe tang hay gặp một đoàn người có tổ chức theo đội ngũ, người lái xe phải xử lý như thế nào?",
  314: "Biển nào cấm ô tô tải vượt?",
  317: "Biển nào cấm quay đầu xe?",
  369: "Trong các biển báo dưới đây biển nào chỉ dẫn bắt đầu đường cao tốc?",
  503: "Các xe đi theo hướng mũi tên, xe nào vi phạm quy tắc giao thông?",
  521: "Theo hướng mũi tên, những hướng nào xe tải được phép đi?",
  524: "Những hướng nào ô tô tải được phép đi?",
  535: "Những hướng nào ô tô tải được phép đi?",
  537: "Những hướng nào ô tô tải được phép đi?",
  543: "Trong hình dưới, những xe nào vi phạm quy tắc giao thông?",
  548: "Trong hình dưới, những xe nào vi phạm quy tắc giao thông?",
  559: "Theo tín hiệu đèn của xe cơ giới, xe nào vi phạm quy tắc giao thông?",
  561: "Các xe đi theo hướng mũi tên, xe nào vi phạm quy tắc giao thông?",
  584: "Các xe đi theo thứ tự nào là đúng quy tắc giao thông đường bộ?",
  589: "Các xe đi theo thứ tự nào là đúng quy tắc giao thông đường bộ?",
  590: "Bạn xử lý như thế nào trong trường hợp này?",
  596: "Xe của bạn đang di chuyển gần đến khu vực giao cắt với đường sắt, khi rào chắn đang dịch chuyển, bạn điều khiển xe như thế nào là đúng quy tắc giao thông?",
};

const manualAnswerRepairs = {
  17: ["Đỗ xe trên đường phố", "Sử dụng xe đạp đi trên các tuyến quốc lộ có tốc độ cao.", "Làm hỏng (cố ý) cọc tiêu, gương cầu, dải phân cách.", "Sử dụng còi và quay đầu xe trong khu dân cư."],
  49: ["Được phép.", "Được bám trong trường hợp phương tiện của mình bị hỏng.", "Được kéo, đẩy trong trường hợp phương tiện khác bị hỏng.", "Không được phép."],
  114: ["Từ từ đi cắt qua đoàn người, đoàn xe.", "Không được cắt ngang qua đoàn người, đoàn xe.", "Báo hiệu từ từ cho xe đi cắt qua để bảo đảm an toàn."],
  212: [
    "Đi trên bất cứ làn đường nào nhưng phải bấm đèn cảnh báo nguy hiểm để báo hiệu cho các phương tiện khác.",
    "Đi trên phần đường bên trái theo chiều đi, nhường đường cho các phương tiện đi ngược chiều để nút tắc nhanh chóng được giải tỏa.",
    "Kiên nhẫn tuân thủ hướng dẫn của người điều khiển giao thông hoặc tín hiệu giao thông, di chuyển trên đúng phần đường bên phải theo chiều đi, nhường đường cho các phương tiện đi ngược chiều để nút tắc nhanh chóng được giải tỏa.",
  ],
  217: [
    "Kiểm tra an toàn xung quanh xe ô tô; nhả từ từ đến 1/2 hành trình bàn đạp ly hợp (côn) và giữ trong khoảng 3 giây; vào số 1; nhả hết phanh tay, báo hiệu bằng còi, đèn trước khi xuất phát; tăng ga đủ để xuất phát, sau đó vừa tăng ga vừa nhả hết ly hợp để cho xe ô tô chuyển động.",
    "Kiểm tra an toàn xung quanh xe ô tô; đạp ly hợp hết hành trình; vào số 1; nhả hết phanh tay, báo hiệu bằng còi, đèn trước khi xuất phát; tăng ga đủ để xuất phát; nhả từ từ đến 1/2 hành trình bàn đạp ly hợp và giữ trong khoảng 3 giây, sau đó vừa tăng ga vừa nhả hết ly hợp để cho xe ô tô chuyển động.",
  ],
  259: [
    "Bật đèn cảnh báo sự cố, di chuyển phương tiện đến vị trí sát lề đường.",
    "Sử dụng các thiết bị cảnh báo như chóp nón, biển báo, đèn chớp... đặt phía sau xe để cảnh báo các phương tiện.",
    "Gọi số điện thoại khẩn cấp của đường cao tốc để được hỗ trợ nếu xe gặp sự cố, tai nạn, hoặc các trường hợp khẩn cấp không thể di chuyển bình thường.",
    "Tất cả các ý nêu trên.",
  ],
  314: ["Biển 1.", "Biển 1 và 2.", "Biển 1 và 3.", "Biển 2 và 3."],
  317: ["Biển 1.", "Biển 2.", "Không biển nào.", "Cả hai biển."],
  457: ["Đỗ cả xe trên hè phố.", "Đỗ hai bánh trước trên hè phố.", "Đỗ 1/2 thân xe trở lên trên hè phố.", "Đỗ 1/2 thân xe trở xuống trên hè phố."],
  521: ["Chỉ hướng 3.", "Hướng 1, 3 và 4.", "Hướng 1, 2 và 3.", "Cả bốn hướng."],
  524: ["Cả bốn hướng.", "Trừ hướng 2.", "Hướng 2, 3 và 4.", "Trừ hướng 4."],
  537: ["Cả bốn hướng.", "Hướng 1, 2 và 3.", "Hướng 1 và 4.", "Hướng 1, 3 và 4."],
  543: ["Xe con (E), mô tô (C).", "Xe tải (A), mô tô (D).", "Xe khách (B), mô tô (C).", "Xe khách (B), mô tô (D)."],
  548: ["Xe con (B), mô tô (C).", "Xe con (A), mô tô (C).", "Xe con (E), mô tô (D).", "Tất cả các loại xe trên."],
  549: ["Xe con.", "Xe tải."],
  560: ["Xe con.", "Xe tải.", "Xe con, xe tải."],
  561: ["Xe tải, xe con.", "Xe khách, xe con.", "Xe khách, xe tải."],
  584: ["Xe của bạn, xe tải, xe con.", "Xe con, xe tải, xe của bạn.", "Xe tải, xe của bạn, xe con.", "Xe của bạn, xe con, xe tải."],
  589: ["Xe con, xe tải, xe của bạn.", "Xe tải, xe con, xe của bạn.", "Xe tải, xe của bạn, xe con."],
};

function normalizeSpaces(value) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function isSuspiciousQuestion(value) {
  const text = normalizeSpaces(value);
  return (
    text.length < 12 ||
    /CÂU\s*\d|CÂt|55G|Ñ|[<>{}\[\]_=~^`|\\]/iu.test(text) ||
    /(?:\s|^)[A-Z]\d{2,}(?:\s|$)/u.test(text) ||
    /[—\-_.]{2,}/u.test(text) ||
    /[œ§¡⁄¬]/u.test(text)
  );
}

function cleanOcrQuestion(value) {
  let text = normalizeSpaces(value)
    .replace(/^Câu\s*\d+\s*[:.)-]?\s*/iu, "")
    .replace(/^[\d\sA-ZÀ-Ỹ]*CÂU\s*\d+\s*/iu, "")
    .replace(/[“”"]/gu, "")
    .replace(/\s+([,.;:?])/gu, "$1")
    .trim();

  const questionMark = text.indexOf("?");
  if (questionMark >= 0) {
    text = text.slice(0, questionMark + 1);
  }

  return normalizeSpaces(text)
    .replace(/\s+([,.;:?])/gu, "$1")
    .replace(/^\W+/u, "")
    .trim();
}

async function findReferenceImage(id) {
  const base = path.join(referenceDir, `q${String(id).padStart(3, "0")}`);
  for (const extension of [".jpg", ".png", ".jpeg"]) {
    const candidate = `${base}${extension}`;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next extension.
    }
  }
  return null;
}

async function makeRedTextMask(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 1;
  const height = Math.max(1, Math.floor((metadata.height ?? 1) * 0.32));
  const { data, info } = await sharp(imagePath)
    .extract({ left: 0, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 3, 255);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const src = (y * info.width + x) * info.channels;
      const dst = (y * info.width + x) * 3;
      const red = data[src];
      const green = data[src + 1];
      const blue = data[src + 2];
      const isRed = red > 115 && green < 150 && blue < 150 && red > green * 1.2 && red > blue * 1.2;

      if (isRed) {
        out[dst] = 0;
        out[dst + 1] = 0;
        out[dst + 2] = 0;
      }
    }
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "white" })
    .grayscale()
    .png()
    .toBuffer();
}

async function ocrQuestion(worker, id) {
  const imagePath = await findReferenceImage(id);
  if (!imagePath) {
    return null;
  }

  const mask = await makeRedTextMask(imagePath);
  const result = await worker.recognize(mask);
  const question = cleanOcrQuestion(result.data.text);
  return question.length >= 12 ? question : null;
}

async function main() {
  const questions = JSON.parse(await fs.readFile(dataPath, "utf-8"));
  const worker = await createWorker("vie");
  const repaired = [];
  const skipped = [];

  for (const question of questions) {
    if (useLegacyManualRepairs && manualAnswerRepairs[question.id]) {
      question.answers = manualAnswerRepairs[question.id];
    }

    if (useLegacyManualRepairs && manualQuestionRepairs[question.id]) {
      const previous = question.question;
      question.question = manualQuestionRepairs[question.id];
      if (previous !== question.question) {
        repaired.push({ id: question.id, previous, next: question.question });
      }
      continue;
    }

    if (!isSuspiciousQuestion(question.question)) {
      continue;
    }

    const ocr = await ocrQuestion(worker, question.id);

    if (ocr) {
      const previous = question.question;
      question.question = ocr;
      repaired.push({ id: question.id, previous, next: ocr });
    } else {
      skipped.push(question.id);
    }
  }

  await worker.terminate();
  await fs.writeFile(dataPath, `${JSON.stringify(questions, null, 2)}\n`, "utf-8");

  for (const item of repaired) {
    console.log(`q${item.id}: ${item.previous} -> ${item.next}`);
  }
  console.log(`Repaired ${repaired.length} question prompts.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} suspicious prompts: ${skipped.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
