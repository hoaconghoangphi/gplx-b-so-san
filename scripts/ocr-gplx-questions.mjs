import fs from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

const manifestPath = "public/questions/manifest.json";
const outputPath = "src/data/questions.json";
const mediaDir = "public/questions/media";

function cleanText(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function cleanAnswer(value) {
  let text = cleanText(value);
  const firstDot = text.indexOf(".");
  if (firstDot >= 0 && firstDot <= 4) {
    text = text.slice(firstDot + 1);
  }
  text = text.replace(/^[^\p{L}\d]+/u, "");
  text = text.replace(/^[1-4]\s*[\.)]?\s*/u, "");
  return cleanText(text);
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

    const line = lines.get(key) ?? {
      words: [],
      x0: left,
      y0: top,
      x1: left + width,
      y1: top + height,
    };

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

async function getImageAnalysis(imagePath) {
  const image = sharp(imagePath).ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const separatorRows = [];
  const greenByRow = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    let grayRun = 0;
    let maxGrayRun = 0;
    let greenPixels = 0;

    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];

      if (Math.abs(red - green) < 8 && Math.abs(green - blue) < 8 && red >= 215 && red <= 245) {
        grayRun += 1;
        maxGrayRun = Math.max(maxGrayRun, grayRun);
      } else {
        grayRun = 0;
      }

      if (green > 130 && green > red * 1.25 && green > blue * 1.25) {
        greenPixels += 1;
      }
    }

    greenByRow[y] = greenPixels;

    if (maxGrayRun > width * 0.28) {
      separatorRows.push(y);
    }
  }

  const separators = [];
  for (const row of separatorRows) {
    const last = separators[separators.length - 1];
    if (last === undefined || row - last > 4) {
      separators.push(row);
    } else {
      separators[separators.length - 1] = Math.round((last + row) / 2);
    }
  }

  const firstSeparator = separators.find((separator) => separator > height * 0.06) ?? Math.round(height * 0.25);

  function isGreen(x, y) {
    const offset = (y * width + x) * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return green > 130 && green > red * 1.25 && green > blue * 1.25;
  }

  function isWhite(x, y) {
    const offset = (y * width + x) * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return red > 235 && green > 235 && blue > 235;
  }

  const starAreaWidth = Math.min(140, width);
  const starAreaHeight = Math.min(firstSeparator, 220, height);
  const seen = new Uint8Array(starAreaWidth * starAreaHeight);
  let critical = false;

  for (let y = 0; y < starAreaHeight; y += 1) {
    for (let x = 0; x < starAreaWidth; x += 1) {
      const index = y * starAreaWidth + x;
      if (seen[index] || !isGreen(x, y)) {
        continue;
      }

      const queue = [[x, y]];
      let queueIndex = 0;
      let area = 0;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      seen[index] = 1;

      while (queueIndex < queue.length) {
        const [currentX, currentY] = queue[queueIndex];
        queueIndex += 1;
        area += 1;
        x0 = Math.min(x0, currentX);
        x1 = Math.max(x1, currentX);
        y0 = Math.min(y0, currentY);
        y1 = Math.max(y1, currentY);

        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ]) {
          if (nextX < 0 || nextY < 0 || nextX >= starAreaWidth || nextY >= starAreaHeight) {
            continue;
          }

          const nextIndex = nextY * starAreaWidth + nextX;
          if (!seen[nextIndex] && isGreen(nextX, nextY)) {
            seen[nextIndex] = 1;
            queue.push([nextX, nextY]);
          }
        }
      }

      const componentWidth = x1 - x0 + 1;
      const componentHeight = y1 - y0 + 1;
      if (area < 800 || area > 5000 || componentWidth < 35 || componentWidth > 95 || componentHeight < 30 || componentHeight > 95) {
        continue;
      }

      let whitePixels = 0;
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          if (isWhite(xx, yy)) {
            whitePixels += 1;
          }
        }
      }

      if (whitePixels > 200) {
        critical = true;
      }
    }
  }

  const usableSeparators = separators.filter((separator) => separator >= firstSeparator);
  const answerBands = usableSeparators.map((separator, index) => ({
    start: separator,
    end: usableSeparators[index + 1] ?? height,
  }));

  const greenScores = answerBands.map((band) =>
    greenByRow.slice(band.start, band.end).reduce((sum, value) => sum + value, 0),
  );
  const correctAnswer = greenScores.indexOf(Math.max(...greenScores));

  return {
    width: metadata.width,
    height: metadata.height,
    separators: usableSeparators,
    firstSeparator,
    answerBands,
    critical,
    correctAnswer: Math.max(0, correctAnswer),
  };
}

function getQuestionLines(lines, analysis) {
  const firstSeparator = analysis.separators[0] ?? Number.POSITIVE_INFINITY;
  const candidates = lines.filter((line) => (line.y0 + line.y1) / 2 < firstSeparator);
  const questionLines = [];

  for (const line of candidates) {
    const previous = questionLines[questionLines.length - 1];
    if (previous && line.y0 - previous.y1 > 35) {
      break;
    }

    questionLines.push(line);
  }

  return questionLines;
}

async function maybeExtractQuestionImage(imagePath, item, questionLines, analysis) {
  if (!questionLines.length || !Number.isFinite(analysis.firstSeparator)) {
    return null;
  }

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width ?? analysis.width;
  const height = metadata.height ?? analysis.height;
  const questionBottom = Math.max(...questionLines.map((line) => line.y1));
  const top = Math.max(0, Math.floor(questionBottom + 8));
  const bottom = Math.min(height, Math.floor(analysis.firstSeparator - 6));
  const cropHeight = bottom - top;

  if (cropHeight < 90 || width < 100) {
    return null;
  }

  const crop = image.extract({ left: 0, top, width, height: cropHeight });
  const stats = await crop.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const nonWhite = stats.data.reduce((count, value) => count + (value < 245 ? 1 : 0), 0);
  const nonWhiteRatio = nonWhite / stats.data.length;

  if (nonWhiteRatio < 0.03) {
    return null;
  }

  await fs.mkdir(mediaDir, { recursive: true });
  const mediaName = `q${String(item.id).padStart(3, "0")}.jpg`;
  const mediaPath = path.join(mediaDir, mediaName);
  await crop.jpeg({ quality: 88 }).toFile(mediaPath);
  return `/questions/media/${mediaName}`;
}

function splitQuestion(lines, analysis) {
  const questionLines = getQuestionLines(lines, analysis);
  const question = cleanText(questionLines.map((line) => line.text).join(" "));

  const answerItems = analysis.answerBands
    .map((band, bandIndex) => ({
      bandIndex,
      band,
      text: cleanAnswer(
        lines
          .filter((line) => {
            const middle = (line.y0 + line.y1) / 2;
            return middle >= band.start && middle < band.end;
          })
          .map((line) => line.text)
          .join(" "),
      ),
    }))
    .filter((item) => item.text);

  return {
    question,
    answers: answerItems.filter((item) => item.text).map((item) => item.text),
    answerItems,
    questionLines,
  };
}

async function fillMissingAnswerText(worker, imagePath, answerItems) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  for (const item of answerItems) {
    const top = Math.max(0, Math.floor(item.band.start + 2));
    const bottom = Math.min(height, Math.floor(item.band.end - 2));
    const cropHeight = bottom - top;

    if (item.text || width <= 0 || cropHeight < 35) {
      continue;
    }

    const buffer = await sharp(imagePath)
      .extract({ left: 0, top, width, height: cropHeight })
      .png()
      .toBuffer();
    const ocr = await worker.recognize(buffer);
    item.text = cleanAnswer(ocr.data.text);
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const worker = await createWorker("vie");
  const results = [];

  for (const item of manifest) {
    const imagePath = path.join("public", item.image);
    const [analysis, ocr] = await Promise.all([
      getImageAnalysis(imagePath),
      worker.recognize(imagePath, {}, { tsv: true }),
    ]);
    const lines = parseTsv(ocr.data.tsv);
    const parsed = splitQuestion(lines, analysis);
    const questionImage = await maybeExtractQuestionImage(imagePath, item, parsed.questionLines, analysis);
    await fillMissingAnswerText(worker, imagePath, parsed.answerItems);
    const answerItems = parsed.answerItems.filter((answer) => answer.text);
    const mappedCorrectAnswer = answerItems.findIndex((answer) => answer.bandIndex === analysis.correctAnswer);

    results.push({
      id: item.id,
      category: item.category,
      chapter: item.chapter,
      question: parsed.question,
      answers: answerItems.map((answer) => answer.text),
      correctAnswer: mappedCorrectAnswer >= 0 ? mappedCorrectAnswer : analysis.correctAnswer,
      critical: analysis.critical,
      image: questionImage,
      sourceImage: item.image,
      explanation: "",
    });

    if (item.id % 25 === 0 || item.id === manifest.length) {
      console.log(`OCR ${item.id}/${manifest.length}`);
    }
  }

  await worker.terminate();

  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), "utf-8");

  const weak = results.filter((item) => !item.question || item.answers.length < 2);
  const critical = results.filter((item) => item.critical).length;
  console.log(`Wrote ${outputPath}`);
  console.log(`Questions: ${results.length}`);
  console.log(`Critical detected: ${critical}`);
  console.log(`Needs review: ${weak.length}`);
  if (weak.length) {
    console.log(`Review IDs: ${weak.slice(0, 30).map((item) => item.id).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
