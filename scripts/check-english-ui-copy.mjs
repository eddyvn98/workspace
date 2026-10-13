import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const vietnamese = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵÀÁẢÃẠĂẰẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]/u; // vi-allow: detector character ranges
const roots = ["app/", "components/"];
const run = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function addedLines(base) {
	const diff = run(["diff", "--unified=0", `${base}...HEAD`, "--", ...roots]);
	const lines = [];
	let file = "";
	for (const line of diff.split(/\r?\n/u)) {
		if (line.startsWith("+++ b/")) file = line.slice(6);
		else if (line.startsWith("+") && !line.startsWith("+++")) lines.push({ file, text: line.slice(1) });
	}
	return lines;
}

function workingTreeLines() {
	const status = run(["status", "--porcelain=v1", "-z"]);
	const files = new Set(status.split("\0").filter(Boolean).map((item) => item.slice(3)).filter((file) => roots.some((root) => file.startsWith(root))));
	return [...files].flatMap((file) => existsSync(file)
		? readFileSync(file, "utf8").split(/\r?\n/u).map((text) => ({ file, text }))
		: []);
}

const base = process.env.WORKFLOW_BASE_SHA;
const lines = base ? addedLines(base) : workingTreeLines();
const violations = lines.filter(({ text }) => vietnamese.test(text));

if (violations.length) {
	console.error("English-only UI copy check failed. Translate these added/changed lines:");
	for (const item of violations) console.error(`${item.file}: ${item.text.trim().slice(0, 180)}`);
	process.exit(1);
}

console.log(`English-only UI copy check passed (${lines.length} line(s) scanned).`);
