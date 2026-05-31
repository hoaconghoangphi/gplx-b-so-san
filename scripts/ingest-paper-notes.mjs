import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const DATA_PATH = "src/data/questions.json";
const PDF_PATH = "reference/paper-notes/Hướng Dẫn và Mẹo Làm Bài.pdf";
const TMP_DIR = ".tmp/paper-notes";
const PAGE_DIR = path.join(TMP_DIR, "pages");
const OCR_DIR = path.join(TMP_DIR, "ocr");
const REPORT_DIR = "reports";
const CHUNKS_PATH = "docs/paper-tips-chunks.json";
const AUTO_THRESHOLD = 0.85;
const DRAFT_THRESHOLD = 0.5;
const MAX_TIP_LENGTH = 300;

const REPORT_FILES = {
  applied: "paper-tips-applied.json",
  draft: "paper-tips-draft.json",
  rejected: "paper-tips-rejected.json",
  summary: "paper-tips-summary.md",
};

const STOPWORDS = new Set(
  [
    "anh",
    "ban",
    "bang",
    "bi",
    "bo",
    "cac",
    "cach",
    "cai",
    "can",
    "cau",
    "cho",
    "chu",
    "co",
    "con",
    "cua",
    "da",
    "dang",
    "day",
    "de",
    "den",
    "di",
    "do",
    "duoc",
    "duong",
    "gi",
    "hay",
    "hoi",
    "hoac",
    "hon",
    "khi",
    "khong",
    "la",
    "lai",
    "lam",
    "len",
    "luc",
    "mot",
    "nay",
    "neu",
    "nguoi",
    "nhieu",
    "nhung",
    "phai",
    "qua",
    "sau",
    "thi",
    "theo",
    "thi",
    "trong",
    "tu",
    "van",
    "va",
    "vao",
    "ve",
    "voi",
    "xe",
  ].filter(Boolean),
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalize(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "chunk";
}

function cleanOcrText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, "-")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[ \t]+([,.;:?!])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(value) {
  return cleanOcrText(value)
    .replace(/^[\s\-–—+*>•]+/, "")
    .replace(/^\(?\d{1,2}\)?[).:-]\s*/, "")
    .trim();
}

function cleanTipText(value) {
  let text = cleanOcrText(value)
    .replace(/\bM[eẹ]o\s+gi[aấ]y\s*[:\-]?\s*/i, "")
    .replace(/\b(M[eẹ]o|Ghi nh[oớ]|Quy lu[aậ]t|C[aá]ch nh[oớ])\s*[:\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(/([a-zà-ỹ])\s+-\s+([a-zà-ỹ])/gi, "$1; $2");
  if (text.length <= MAX_TIP_LENGTH) return text;

  const sentenceEnd = text.search(/[.;!?](\s|$)/);
  if (sentenceEnd >= 80 && sentenceEnd + 1 <= MAX_TIP_LENGTH) {
    return text.slice(0, sentenceEnd + 1).trim();
  }

  return `${text.slice(0, MAX_TIP_LENGTH - 1).trim().replace(/[,\s;:]+$/g, "")}.`;
}

function isReadableTip(value) {
  const text = cleanTipText(value);
  const normalized = normalize(text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return text.length >= 25 && tokens.length >= 5 && /[a-zA-ZÀ-ỹ]/.test(text);
}

function parsePdfImageStreams(pdfPath) {
  const pdf = fs.readFileSync(pdfPath);
  const marker = Buffer.from("/Subtype /Image", "latin1");
  const streams = [];
  let position = 0;

  while ((position = pdf.indexOf(marker, position)) !== -1) {
    const streamToken = pdf.indexOf(Buffer.from("stream", "latin1"), position);
    if (streamToken === -1) break;

    let dataStart = streamToken + "stream".length;
    if (pdf[dataStart] === 13 && pdf[dataStart + 1] === 10) dataStart += 2;
    else if (pdf[dataStart] === 10) dataStart += 1;

    const dataEnd = pdf.indexOf(Buffer.from("endstream", "latin1"), dataStart);
    if (dataEnd === -1) break;

    const dictStart = Math.max(0, pdf.lastIndexOf(Buffer.from("<<", "latin1"), position));
    const dict = pdf.slice(dictStart, streamToken).toString("latin1");
    const width = Number((dict.match(/\/Width\s+(\d+)/) || [])[1]);
    const height = Number((dict.match(/\/Height\s+(\d+)/) || [])[1]);
    const bits = Number((dict.match(/\/BitsPerComponent\s+(\d+)/) || [])[1]);
    const filter = (dict.match(/\/Filter\s*(\[[^\]]+\]|\/\w+)/) || [])[1] ?? "";
    const colorSpace = (dict.match(/\/ColorSpace\s*(\/\w+|\d+\s+0\s+R|\[[^\]]+\])/) || [])[1] ?? "";

    if (width > 100 && height > 100 && bits === 8 && filter.includes("FlateDecode")) {
      streams.push({
        width,
        height,
        colorSpace,
        data: pdf.slice(dataStart, dataEnd),
      });
    }

    position = dataEnd + "endstream".length;
  }

  return streams;
}

async function extractPdfPages() {
  ensureDir(PAGE_DIR);
  const existingPages = fs
    .readdirSync(PAGE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^page-\d+\.png$/.test(entry.name))
    .map((entry) => path.join(PAGE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (existingPages.length === 7) return existingPages;

  const streams = parsePdfImageStreams(PDF_PATH);
  const pagePaths = [];
  let pageNumber = 0;
  for (let index = 0; index < streams.length; index += 1) {
    const stream = streams[index];
    const raw = zlib.inflateSync(stream.data);
    const expected = stream.width * stream.height * 3;
    if (raw.length !== expected) {
      continue;
    }

    pageNumber += 1;
    const pagePath = path.join(PAGE_DIR, `page-${pageNumber}.png`);
    await sharp(raw, {
      raw: {
        width: stream.width,
        height: stream.height,
        channels: 3,
      },
    })
      .png()
      .toFile(pagePath);
    pagePaths.push(pagePath);
  }

  return pagePaths;
}

async function ocrPages(pagePaths) {
  ensureDir(OCR_DIR);
  const worker = await createWorker("vie", 1, {
    langPath: process.cwd(),
    cachePath: process.cwd(),
  });
  await worker.setParameters({
    tessedit_pageseg_mode: "4",
    preserve_interword_spaces: "1",
  });

  const pages = [];
  try {
    for (let index = 0; index < pagePaths.length; index += 1) {
      const page = index + 1;
      const txtPath = path.join(OCR_DIR, `page-${page}.txt`);
      let text;
      if (fs.existsSync(txtPath)) {
        text = fs.readFileSync(txtPath, "utf8");
      } else {
        const result = await worker.recognize(pagePaths[index]);
        text = cleanOcrText(result.data.text);
        fs.writeFileSync(txtPath, `${text}\n`, "utf8");
      }
      pages.push({ page, text: cleanOcrText(text) });
    }
  } finally {
    await worker.terminate();
  }

  return pages;
}

function isCriticalListLine(line) {
  const normalized = normalize(line);
  const numbers = normalized.match(/\b\d{1,3}\b/g) ?? [];
  return normalized.includes("cau hoi diem liet") || (numbers.length >= 8 && numbers.join(" ").length > normalized.length * 0.45);
}

function isSkippableCriticalBlock(lines) {
  const text = lines.join(" ");
  const normalized = normalize(text);
  const numbers = normalized.match(/\b\d{1,3}\b/g) ?? [];
  return normalized.includes("cau hoi diem liet") && numbers.length >= 20;
}

function looksLikeHeading(line) {
  const cleaned = cleanLine(line);
  if (!cleaned || cleaned.length > 90) return false;
  const normalized = normalize(cleaned);
  if (!normalized) return false;

  if (/\b(meo|ghi nho|quy luat|cach nho|luu y)\b/.test(normalized)) return true;
  if (/^\d{1,2}\s+(meo|quy|thu|bien|sa|toc|diem|van|dao|ky|cau)\b/.test(normalized)) return true;
  if (/^(bien bao|duong uu tien|thu tu uu tien|toc do|khoang cach|niem han|van hoa|sa hinh)\b/.test(normalized)) {
    return true;
  }

  const letters = cleaned.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 8) {
    const uppercase = [...letters].filter((char) => char === char.toUpperCase() && char !== char.toLowerCase()).length;
    return uppercase / letters.length > 0.65;
  }

  return false;
}

function extractKeywords(text) {
  const normalized = normalize(text);
  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token));

  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  const bigramCounts = new Map();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]} ${tokens[index + 1]}`;
    bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
  }

  const bigrams = [...bigramCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword);

  const unigrams = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([keyword]) => keyword);

  return [...new Set([...bigrams.slice(0, 3), ...unigrams])].slice(0, 8);
}

function chunkPage(pageText, page) {
  const lines = pageText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const chunks = [];
  let skippedCritical = 0;
  let current = null;

  function flush() {
    if (!current) return;
    const rawLines = current.lines.filter((line) => !isCriticalListLine(line));
    if (!rawLines.length) {
      current = null;
      return;
    }

    if (isSkippableCriticalBlock(rawLines)) {
      skippedCritical += 1;
      current = null;
      return;
    }

    const text = cleanTipText(rawLines.join(" "));
    if (!isReadableTip(text)) {
      current = null;
      return;
    }

    const topic = cleanLine(current.topic || `Trang ${page}`);
    const keywords = extractKeywords(`${topic} ${text}`);
    if (!keywords.length) {
      current = null;
      return;
    }

    chunks.push({
      chunkId: `page${page}-${slugify(topic)}-${chunks.length + 1}`,
      page,
      topic,
      text,
      keywords,
      sourceType: "ocr",
    });
    current = null;
  }

  for (const line of lines) {
    if (isCriticalListLine(line)) {
      skippedCritical += 1;
      continue;
    }

    if (looksLikeHeading(line)) {
      flush();
      current = { topic: line, lines: [] };
      continue;
    }

    if (!current) current = { topic: `Trang ${page}`, lines: [] };
    current.lines.push(line);
  }

  flush();
  return { chunks, skippedCritical };
}

function idsWhere(questions, predicate) {
  return questions.filter(predicate).map((question) => question.id);
}

function makeCuratedChunk({ chunkId, page, topic, text, keywords, targetQuestionIds, sourceType = "paper-note-curated" }) {
  return {
    chunkId,
    page,
    topic,
    text: cleanTipText(text),
    keywords: keywords.map(normalize).filter(Boolean),
    targetQuestionIds,
    sourceType,
  };
}

function buildCuratedChunks(questions) {
  const ids = {
    age: idsWhere(questions, (question) => question.id >= 118 && question.id <= 123),
    license: idsWhere(questions, (question) => question.id >= 124 && question.id <= 135),
    speedSpecial: idsWhere(questions, (question) => question.id === 144 || question.id === 157),
    speedGeneral: idsWhere(questions, (question) => question.id >= 145 && question.id <= 156),
    safeDistance: idsWhere(questions, (question) => question.id >= 158 && question.id <= 162),
    dangerSigns: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return question.chapter === 5 && (corpus.includes("nguy hiem") || corpus.includes("canh bao"));
    }),
    prohibitionSigns: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return question.chapter === 5 && /\bcam\b/.test(corpus);
    }),
    commandSigns: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return question.chapter === 5 && (corpus.includes("hieu lenh") || corpus.includes("bat buoc") || corpus.includes("toc do toi thieu"));
    }),
    guideSigns: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return (
        question.chapter === 5 &&
        (corpus.includes("chi dan") ||
          corpus.includes("duong cao toc") ||
          corpus.includes("dia gioi") ||
          corpus.includes("tram") ||
          corpus.includes("nhap lan") ||
          corpus.includes("lan duong cuu nan"))
      );
    }),
    supplementarySigns: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return question.chapter === 5 && (corpus.includes("bien phu") || corpus.includes("pham vi tac dung") || corpus.includes("bieu thi thoi gian"));
    }),
    roadMarkings: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return question.chapter === 5 && (corpus.includes("vach") || corpus.includes("phan chia") || corpus.includes("mat duong"));
    }),
    answerAvoid: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return (
        corpus.includes("tang toc") ||
        corpus.includes("tang so") ||
        corpus.includes("den chieu xa") ||
        corpus.includes("so 0") ||
        corpus.includes("ben trai") ||
        corpus.includes("lan duong it phuong tien")
      );
    }),
    answerPositive: idsWhere(questions, (question) => {
      const correct = normalize(question.answers[question.correctAnswer] ?? "");
      return (
        correct.includes("bi nghiem cam") ||
        correct.includes("khong duoc phep") ||
        correct.includes("khong duoc") ||
        correct.includes("ve so thap") ||
        correct.includes("den chieu gan")
      );
    }),
    construction: idsWhere(questions, (question) => {
      const corpus = buildQuestionCorpus(question);
      return (
        question.chapter === 4 &&
        (corpus.includes("boi tron") ||
          corpus.includes("dong co") ||
          corpus.includes("truyen luc") ||
          corpus.includes("ly hop") ||
          corpus.includes("hop so") ||
          corpus.includes("he thong lai") ||
          corpus.includes("he thong phanh") ||
          corpus.includes("ac quy") ||
          corpus.includes("may phat") ||
          corpus.includes("day dai an toan"))
      );
    }),
  };

  return [
    makeCuratedChunk({
      chunkId: "paper-page6-answer-avoid",
      page: 6,
      topic: "Nhận dạng đáp án sai",
      text:
        'Mẹo giấy: Các đáp án có "tăng tốc", "tăng số", "bật đèn chiếu xa", "về số 0", "tùy ý/ở nơi bất kỳ", "đi bên trái/làn đường ít phương tiện" thường là đáp án sai.',
      keywords: ["tăng tốc", "tăng số", "đèn chiếu xa", "số 0", "bên trái", "làn đường ít phương tiện"],
      targetQuestionIds: ids.answerAvoid,
      sourceType: "paper-note-draft",
    }),
    makeCuratedChunk({
      chunkId: "paper-page6-answer-positive",
      page: 6,
      topic: "Nhận dạng đáp án đúng",
      text:
        'Mẹo giấy: Đáp án đúng thường có cụm "bị nghiêm cấm", "không được phép/không được", "về số thấp/về số 1", hoặc "đèn chiếu gần".',
      keywords: ["bị nghiêm cấm", "không được phép", "không được", "về số thấp", "đèn chiếu gần"],
      targetQuestionIds: ids.answerPositive,
      sourceType: "paper-note-draft",
    }),
    makeCuratedChunk({
      chunkId: "paper-page6-age",
      page: 6,
      topic: "Tuổi người lái xe",
      text:
        "Ghi nhớ tuổi: 16 tuổi xe gắn máy; 18 tuổi hạng A1/A/B1/B/C1; 21 tuổi hạng C; 24 tuổi hạng D1/D2/C1E/CE; 27 tuổi hạng D/DE; hạng D tối đa nam 57, nữ 55.",
      keywords: ["16 tuổi", "18 tuổi", "21 tuổi", "24 tuổi", "27 tuổi", "nam 57", "nữ 55", "hạng d"],
      targetQuestionIds: ids.age,
    }),
    makeCuratedChunk({
      chunkId: "paper-page6-license-classes",
      page: 6,
      topic: "Các hạng GPLX",
      text:
        "Ghi nhớ hạng GPLX: A1 <=125cm3/11kW; A >125cm3/11kW; B đến 8 chỗ và tải <=3.500kg; C1 tải 3.500-7.500kg; C tải >7.500kg; D1/D2/D lần lượt 8-16, 16-29, >29 chỗ; BE/CE/DE là hạng tương ứng kéo móc.",
      keywords: ["hạng gplx", "a1", "125cm3", "b", "3.500kg", "c1", "7.500kg", "be ce de"],
      targetQuestionIds: ids.license,
    }),
    makeCuratedChunk({
      chunkId: "paper-page7-speed-special",
      page: 7,
      topic: "Tốc độ xe đặc thù",
      text:
        "Ghi nhớ tốc độ xe đặc thù: xe chở người 4 bánh có gắn động cơ 30km/h; xe máy chuyên dùng, xe gắn máy 40km/h; xe chở hàng 4 bánh có gắn động cơ 50km/h.",
      keywords: ["xe máy chuyên dùng", "xe gắn máy", "xe chở hàng bốn bánh", "30km h", "40km h", "50km h"],
      targetQuestionIds: ids.speedSpecial,
    }),
    makeCuratedChunk({
      chunkId: "paper-page7-speed-general",
      page: 7,
      topic: "Tốc độ trong và ngoài khu dân cư",
      text:
        "Ghi nhớ tốc độ: trong khu dân cư đường đôi/1 chiều từ 2 làn là 60km/h, đường hai chiều/1 làn là 50km/h. Ngoài khu dân cư theo 4 nhóm: 90/80, 80/70, 70/60, 60/50.",
      keywords: ["khu dân cư", "đường đôi", "đường hai chiều", "ngoài khu dân cư", "90 80", "80 70", "70 60", "60 50"],
      targetQuestionIds: ids.speedGeneral,
    }),
    makeCuratedChunk({
      chunkId: "paper-page7-safe-distance",
      page: 7,
      topic: "Khoảng cách an toàn",
      text:
        "Mẹo giấy: khoảng cách an toàn lấy tốc độ lớn trừ 30 rồi chọn số mét gần nhất. Ghi nhớ: 60km/h = 35m; 60-80 = 55m; 80-100 = 70m; 100-120 = 100m.",
      keywords: ["khoảng cách an toàn", "60km h", "35m", "55m", "70m", "100m"],
      targetQuestionIds: ids.safeDistance,
    }),
    makeCuratedChunk({
      chunkId: "paper-page2-danger-signs",
      page: 2,
      topic: "Biển báo nguy hiểm",
      text:
        "Biển báo nguy hiểm có hình tam giác đều, nền vàng, viền đỏ, hình vẽ màu đen. Khi gặp biển này phải giảm tốc độ, chú ý quan sát và sẵn sàng xử lý.",
      keywords: ["biển báo nguy hiểm", "tam giác", "nền vàng", "viền đỏ", "giảm tốc độ", "chú ý quan sát"],
      targetQuestionIds: ids.dangerSigns,
    }),
    makeCuratedChunk({
      chunkId: "paper-page3-prohibition-signs",
      page: 3,
      topic: "Biển báo cấm",
      text:
        "Biển báo cấm thường hình tròn, viền đỏ, nền trắng, hình vẽ màu đen; dùng để biểu thị điều cấm, người tham gia giao thông phải chấp hành.",
      keywords: ["biển báo cấm", "hình tròn", "viền đỏ", "nền trắng", "điều cấm"],
      targetQuestionIds: ids.prohibitionSigns,
    }),
    makeCuratedChunk({
      chunkId: "paper-page4-command-signs",
      page: 4,
      topic: "Biển hiệu lệnh",
      text:
        "Biển hiệu lệnh thường hình tròn hoặc chữ nhật màu xanh, hình vẽ màu trắng; báo các điều bắt buộc người tham gia giao thông phải chấp hành.",
      keywords: ["biển hiệu lệnh", "màu xanh", "hình vẽ màu trắng", "bắt buộc", "chấp hành"],
      targetQuestionIds: ids.commandSigns,
    }),
    makeCuratedChunk({
      chunkId: "paper-page4-guide-signs",
      page: 4,
      topic: "Biển chỉ dẫn",
      text:
        "Biển chỉ dẫn thường hình vuông hoặc chữ nhật, nền xanh lam, chữ/hình màu trắng; dùng để chỉ hướng đi hoặc thông tin cần thiết giúp đi lại thuận lợi, an toàn.",
      keywords: ["biển chỉ dẫn", "hình vuông", "chữ nhật", "nền xanh lam", "chữ màu trắng"],
      targetQuestionIds: ids.guideSigns,
    }),
    makeCuratedChunk({
      chunkId: "paper-page5-supplementary-signs",
      page: 5,
      topic: "Biển phụ",
      text:
        "Biển phụ thường hình vuông hoặc chữ nhật, nền trắng chữ đen hoặc nền xanh chữ trắng; đặt dưới biển chính để bổ sung, làm rõ phạm vi, đối tượng, thời gian tác dụng.",
      keywords: ["biển phụ", "nền trắng", "chữ đen", "phạm vi tác dụng", "đối tượng", "thời gian"],
      targetQuestionIds: ids.supplementarySigns,
    }),
    makeCuratedChunk({
      chunkId: "paper-page5-road-markings",
      page: 5,
      topic: "Vạch kẻ đường",
      text:
        "Mẹo vạch kẻ đường: vạch liền thường cấm đè/cấm lấn; vạch đứt cho phép cắt qua khi an toàn; vạch vàng phân chia hai chiều, vạch trắng phân chia làn cùng chiều.",
      keywords: ["vạch kẻ đường", "vạch liền", "vạch đứt", "vạch vàng", "vạch trắng", "phân chia"],
      targetQuestionIds: ids.roadMarkings,
    }),
    makeCuratedChunk({
      chunkId: "paper-page7-construction",
      page: 7,
      topic: "Cấu tạo sửa chữa",
      text:
        "Mẹo cấu tạo: bôi trơn cấp dầu; động cơ biến nhiệt năng thành cơ năng; truyền lực truyền mô men; ly hợp truyền/ngắt truyền động; hộp số giúp xe lùi; lái đổi hướng; phanh giảm tốc/dừng; ắc quy tích điện; máy phát phát điện; dây an toàn giữ chặt người.",
      keywords: ["bôi trơn", "động cơ", "truyền lực", "ly hợp", "hộp số", "hệ thống lái", "hệ thống phanh"],
      targetQuestionIds: ids.construction,
    }),
  ].filter((chunk) => chunk.targetQuestionIds.length > 0 && isReadableTip(chunk.text));
}

function extractChunks(pages) {
  const chunks = [];
  let skippedCritical = 0;

  for (const page of pages) {
    const result = chunkPage(page.text, page.page);
    chunks.push(...result.chunks);
    skippedCritical += result.skippedCritical;
  }

  const uniqueChunks = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const key = normalize(chunk.text).slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueChunks.push(chunk);
  }

  return { chunks: uniqueChunks, skippedCritical };
}

function buildQuestionCorpus(question) {
  return normalize(`${question.question} ${question.answers.join(" ")}`);
}

function scoreChunkForQuestion(chunk, questionCorpus) {
  if (Array.isArray(chunk.targetQuestionIds)) {
    return { score: 0, keywordsMatched: [] };
  }

  let hits = 0;
  let bigramHit = false;
  const keywordsMatched = [];

  for (const keyword of chunk.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;
    if (questionCorpus.includes(normalizedKeyword)) {
      hits += 1;
      keywordsMatched.push(keyword);
      if (normalizedKeyword.includes(" ")) bigramHit = true;
    }
  }

  if (!chunk.keywords.length) return { score: 0, keywordsMatched };
  const boost = bigramHit ? 1.5 : 1;
  return {
    score: Math.min(chunk.sourceType === "ocr" ? 0.84 : 1, (hits / chunk.keywords.length) * boost),
    keywordsMatched,
  };
}

function scoreChunkForQuestionId(chunk, question) {
  if (Array.isArray(chunk.targetQuestionIds)) {
    if (!chunk.targetQuestionIds.includes(question.id)) return { score: 0, keywordsMatched: [] };
    const corpus = buildQuestionCorpus(question);
    const keywordsMatched = chunk.keywords.filter((keyword) => corpus.includes(normalize(keyword))).slice(0, 8);
    return {
      score: chunk.sourceType === "paper-note-draft" ? 0.84 : 1,
      keywordsMatched: keywordsMatched.length ? keywordsMatched : chunk.keywords.slice(0, 5),
    };
  }

  return scoreChunkForQuestion(chunk, buildQuestionCorpus(question));
}

function makeReportEntry(question, chunk, match) {
  return {
    questionId: question.id,
    chunkId: chunk.chunkId,
    topic: chunk.topic,
    page: chunk.page,
    tipText: chunk.text,
    matchScore: Number(match.score.toFixed(3)),
    keywordsMatched: match.keywordsMatched,
    keywordsTotal: chunk.keywords.length,
  };
}

function matchChunksToQuestions(chunks, questions) {
  const bestByQuestion = new Map();
  const rejected = [];

  for (const chunk of chunks) {
    for (const question of questions) {
      const match = scoreChunkForQuestionId(chunk, question);
      const entry = makeReportEntry(question, chunk, match);

      if (match.score >= DRAFT_THRESHOLD) {
        const previous = bestByQuestion.get(question.id);
        if (!previous || match.score > previous.match.score) {
          bestByQuestion.set(question.id, { question, chunk, match, entry });
        }
      } else if (match.keywordsMatched.length > 0) {
        rejected.push(entry);
      }
    }
  }

  return { bestByQuestion, rejected };
}

function clearGeneratedPaperTips(questions) {
  let cleared = 0;
  for (const question of questions) {
    if (question.tipSource === "paper-note") {
      delete question.memoryTip;
      delete question.tipSource;
      cleared += 1;
    }
  }
  return cleared;
}

function countTips(questions) {
  return questions.filter((question) => typeof question.memoryTip === "string" && question.memoryTip.trim()).length;
}

function sourceBreakdown(questions) {
  const counts = {};
  for (const question of questions) {
    if (question.tipSource) counts[question.tipSource] = (counts[question.tipSource] ?? 0) + 1;
  }
  return counts;
}

function safeWriteQuestions(questions) {
  const before = fs.readFileSync(DATA_PATH, "utf8");
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

  try {
    const reparsed = readJson(DATA_PATH);
    if (!Array.isArray(reparsed) || reparsed.length !== 600) {
      throw new Error(`Expected 600 questions after write, got ${Array.isArray(reparsed) ? reparsed.length : "non-array"}`);
    }
  } catch (error) {
    try {
      execFileSync("git", ["checkout", "HEAD", "--", DATA_PATH], { stdio: "ignore" });
    } catch {
      fs.writeFileSync(DATA_PATH, before, "utf8");
    }
    throw error;
  }
}

function buildSummary({
  pages,
  chunks,
  skippedCritical,
  applied,
  draft,
  rejected,
  beforeTipCount,
  afterTipCount,
  breakdown,
  clearedPaperTips,
}) {
  const paperNoteCount = breakdown["paper-note"] ?? 0;
  const otherLines = Object.entries(breakdown)
    .filter(([source]) => source !== "paper-note")
    .map(([source, count]) => `  ${source}: ${count}`)
    .join("\n");

  return `=== PAPER TIPS SUMMARY ===
PDF pages OCR'd:           ${pages.length}
Chunks extracted:          ${chunks.length}
  - by topic group:        ${chunks.length}
  - skipped (60-câu list): ${skippedCritical}
  - rebuilt paper-note:    ${clearedPaperTips}

Match results:
  Auto-applied (>=0.85):   ${applied.length} câu trong JSON
  Draft (0.5-0.85):        ${draft.length} câu cần review
  Rejected (<0.5):         ${rejected.length} chunk-câu pairs

memoryTip coverage:        ${beforeTipCount} -> ${afterTipCount} (tăng +${afterTipCount - beforeTipCount})
tipSource breakdown:
  paper-note: ${paperNoteCount}
${otherLines || "  (others giữ nguyên): 0"}

Câu thiếu memoryTip còn lại: ${600 - afterTipCount} / 600
`;
}

async function main() {
  ensureDir(REPORT_DIR);
  ensureDir(path.dirname(CHUNKS_PATH));

  const questions = readJson(DATA_PATH);
  if (!Array.isArray(questions) || questions.length !== 600) {
    throw new Error(`Expected 600 questions in ${DATA_PATH}`);
  }

  const clearedPaperTips = clearGeneratedPaperTips(questions);
  const beforeTipCount = countTips(questions);
  const pages = await extractPdfPages();
  const ocrPagesResult = await ocrPages(pages);
  const extracted = extractChunks(ocrPagesResult);
  const curatedChunks = buildCuratedChunks(questions);
  const chunks = [...curatedChunks, ...extracted.chunks];
  const skippedCritical = extracted.skippedCritical;
  const { bestByQuestion, rejected } = matchChunksToQuestions(chunks, questions);

  const applied = [];
  const draft = [];
  const duplicates = [];

  for (const item of [...bestByQuestion.values()].sort((a, b) => b.match.score - a.match.score || a.question.id - b.question.id)) {
    const entry = item.entry;
    const hasTip = typeof item.question.memoryTip === "string" && item.question.memoryTip.trim();
    const protectedSource = item.question.tipSource === "manual" || item.question.tipSource === "source";

    if (item.match.score >= AUTO_THRESHOLD) {
      if (item.chunk.sourceType !== "paper-note-curated") {
        draft.push(entry);
        continue;
      }

      if (hasTip || protectedSource) {
        duplicates.push({ ...entry, existingTipSource: item.question.tipSource ?? null });
        continue;
      }

      item.question.memoryTip = item.chunk.text;
      item.question.tipSource = "paper-note";
      applied.push(entry);
    } else if (item.match.score >= DRAFT_THRESHOLD) {
      draft.push(entry);
    }
  }

  safeWriteQuestions(questions);

  const afterQuestions = readJson(DATA_PATH);
  const afterTipCount = countTips(afterQuestions);
  const breakdown = sourceBreakdown(afterQuestions);
  const summary = buildSummary({
    pages: ocrPagesResult,
    chunks,
    skippedCritical,
    applied,
    draft,
    rejected,
    beforeTipCount,
    afterTipCount,
    breakdown,
    clearedPaperTips,
  });

  writeJson(path.join(REPORT_DIR, REPORT_FILES.applied), applied);
  writeJson(path.join(REPORT_DIR, REPORT_FILES.draft), draft);
  writeJson(path.join(REPORT_DIR, REPORT_FILES.rejected), rejected.slice(0, 1000));
  writeJson(path.join(REPORT_DIR, "paper-tips-duplicates.json"), duplicates);
  writeJson(CHUNKS_PATH, chunks);
  fs.writeFileSync(path.join(REPORT_DIR, REPORT_FILES.summary), summary, "utf8");

  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
