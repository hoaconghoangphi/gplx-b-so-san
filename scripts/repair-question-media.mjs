import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

const dataPath = "src/data/questions.json";
const referenceDir = ".codex-temp/reference-images";
const mediaDir = "public/questions/media";

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseTsv(tsv) {
  const rows = tsv.trim().split("\n").slice(1);
  const lines = new Map();

  for (const row of rows) {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") {
      continue;
    }

    const text = columns.slice(11).join("\t").trim();
    if (!text) {
      continue;
    }

    const key = `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const line = lines.get(key) ?? { words: [], x0: left, y0: top, x1: left + width, y1: top + height };

    line.words.push({ text, left });
    line.x0 = Math.min(line.x0, left);
    line.y0 = Math.min(line.y0, top);
    line.x1 = Math.max(line.x1, left + width);
    line.y1 = Math.max(line.y1, top + height);
    lines.set(key, line);
  }

  return [...lines.values()]
    .map((line) => ({
      ...line,
      text: cleanText(line.words.sort((a, b) => a.left - b.left).map((word) => word.text).join(" ")),
    }))
    .filter((line) => line.text)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

async function getImageData(imagePath) {
  const image = sharp(imagePath).ensureAlpha();
  const metadata = await image.metadata();
  const raw = await image.raw().toBuffer({ resolveWithObject: true });
  return { width: metadata.width ?? raw.info.width, height: metadata.height ?? raw.info.height, ...raw };
}

function isRedQuestionPixel(red, green, blue) {
  return red > 120 && green < 110 && blue < 110 && red > green * 1.35 && red > blue * 1.35;
}

function getQuestionBottom(raw) {
  const { data, info } = raw;
  const { width, height, channels } = info;
  let bottom = 0;

  for (let y = 0; y < Math.floor(height * 0.35); y += 1) {
    let redPixels = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      if (isRedQuestionPixel(data[offset], data[offset + 1], data[offset + 2])) {
        redPixels += 1;
      }
    }
    if (redPixels > width * 0.015) {
      bottom = y;
    }
  }

  return bottom;
}

function getQuestionBottomFromLines(lines, height) {
  const topLines = lines.filter((line) => line.y0 < height * 0.28);
  if (!topLines.length) {
    return 0;
  }

  const questionLines = [];
  for (const line of topLines) {
    const previous = questionLines[questionLines.length - 1];
    if (previous && line.y0 - previous.y1 > 32) {
      break;
    }
    questionLines.push(line);
  }

  return questionLines.length ? Math.max(...questionLines.map((line) => line.y1)) : 0;
}

function getAnswerTop(lines, questionBottom, fallbackBottom) {
  const answerLine = lines.find((line) => {
    if (line.y0 <= questionBottom + 20 || line.y0 >= fallbackBottom) {
      return false;
    }
    return /^(?:[1-4]\s*[-.]|[O0CÐD@®©()ƠơGg]*\s*[1-4iIlL]\s*[-.])/u.test(line.text.trim());
  });
  return answerLine?.y0 ?? fallbackBottom;
}

function getContentBox(raw, top, bottom) {
  const { data, info } = raw;
  const { width, channels } = info;
  let x0 = width;
  let y0 = bottom - top;
  let x1 = 0;
  let y1 = 0;
  let nonWhite = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (red < 245 || green < 245 || blue < 245) {
        nonWhite += 1;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y - top);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y - top);
      }
    }
  }

  if (x1 <= x0 || y1 <= y0) {
    return null;
  }
  return { x0, y0, x1, y1, nonWhite };
}

async function cropQuestionMedia(imagePath, item, worker) {
  const raw = await getImageData(imagePath);
  const { width, height } = raw.info;
  const ocr = await worker.recognize(imagePath, {}, { tsv: true });
  const lines = parseTsv(ocr.data.tsv);
  const questionBottom = getQuestionBottomFromLines(lines, height) || getQuestionBottom(raw);
  if (questionBottom <= 0) {
    return null;
  }
  const rawTop = Math.max(0, questionBottom + 14);
  const rawBottom = Math.min(height, Math.floor(getAnswerTop(lines, questionBottom, height) - 12));
  if (rawBottom - rawTop < 80) {
    return null;
  }

  const box = getContentBox(raw, rawTop, rawBottom);
  if (!box) {
    return null;
  }

  const contentWidth = box.x1 - box.x0 + 1;
  const contentHeight = box.y1 - box.y0 + 1;
  const contentArea = contentWidth * contentHeight;
  if (box.nonWhite < 1800 || contentWidth < width * 0.14 || contentHeight < 80 || contentArea < 14000) {
    return null;
  }

  const padding = 10;
  const left = Math.max(0, box.x0 - padding);
  const top = rawTop;
  const right = Math.min(width, box.x1 + padding);
  const bottom = rawBottom;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth < width * 0.14 || cropHeight < 80) {
    return null;
  }

  await fs.mkdir(mediaDir, { recursive: true });
  const mediaName = `q${String(item.id).padStart(3, "0")}.jpg`;
  const mediaPath = path.join(mediaDir, mediaName);
  await sharp(imagePath).extract({ left, top, width: cropWidth, height: cropHeight }).jpeg({ quality: 90 }).toFile(mediaPath);
  return `/questions/media/${mediaName}`;
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

async function main() {
  const questions = JSON.parse(await fs.readFile(dataPath, "utf-8"));
  const worker = await createWorker("vie");
  let repaired = 0;
  let cleared = 0;

  for (const question of questions) {
    const imagePath = await findReferenceImage(question.id);
    if (!imagePath) {
      continue;
    }

    const media = await cropQuestionMedia(imagePath, question, worker);
    if (media) {
      if (question.image !== media) {
        repaired += 1;
      }
      question.image = media;
      console.log(`media q${question.id}: ${media}`);
    } else if (question.image) {
      question.image = null;
      cleared += 1;
    }
  }

  await worker.terminate();
  await fs.writeFile(dataPath, `${JSON.stringify(questions, null, 2)}\n`, "utf-8");
  console.log(`Repaired media for ${repaired} questions.`);
  console.log(`Cleared media for ${cleared} questions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
