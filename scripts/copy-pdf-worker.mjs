import { copyFile } from "node:fs/promises";

await copyFile(
	"node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
	"public/pdf.worker.min.mjs",
);
