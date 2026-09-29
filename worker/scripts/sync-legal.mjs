import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legalDir = path.resolve(__dirname, "../../docs/legal");
const targetDir = path.resolve(__dirname, "../src/backend/legal");
const targetFile = path.join(targetDir, "legal-content.json");
const versionFilePath = path.join(legalDir, "LEGAL_VERSION.json");

const isCheckMode = process.argv.includes("--check");

if (!fs.existsSync(versionFilePath)) {
  console.error(`LEGAL_VERSION.json not found at ${versionFilePath}`);
  process.exit(1);
}

const versionData = JSON.parse(fs.readFileSync(versionFilePath, "utf8"));
const termsFile = path.join(
  legalDir,
  `terms-${versionData.termsVersion}.es.md`,
);
const privacyFile = path.join(
  legalDir,
  `privacy-notice-${versionData.privacyVersion}.es.md`,
);

if (!fs.existsSync(termsFile)) {
  console.error(`Terms markdown file missing: ${termsFile}`);
  process.exit(1);
}

if (!fs.existsSync(privacyFile)) {
  console.error(`Privacy markdown file missing: ${privacyFile}`);
  process.exit(1);
}

const termsContent = fs.readFileSync(termsFile, "utf8").replace(/\r\n/g, "\n");
const privacyContent = fs
  .readFileSync(privacyFile, "utf8")
  .replace(/\r\n/g, "\n");

const termsSha256 = crypto
  .createHash("sha256")
  .update(Buffer.from(termsContent, "utf8"))
  .digest("hex");
const privacySha256 = crypto
  .createHash("sha256")
  .update(Buffer.from(privacyContent, "utf8"))
  .digest("hex");

if (isCheckMode) {
  let hasError = false;

  if (termsSha256 !== versionData.termsSha256) {
    console.error(
      `Mismatch in terms SHA-256:\n  docs computed: ${termsSha256}\n  LEGAL_VERSION.json: ${versionData.termsSha256}`,
    );
    hasError = true;
  }

  if (privacySha256 !== versionData.privacySha256) {
    console.error(
      `Mismatch in privacy SHA-256:\n  docs computed: ${privacySha256}\n  LEGAL_VERSION.json: ${versionData.privacySha256}`,
    );
    hasError = true;
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`Target file does not exist: ${targetFile}`);
    hasError = true;
  } else {
    try {
      const workerContent = JSON.parse(fs.readFileSync(targetFile, "utf8"));
      if (workerContent.termsVersion !== versionData.termsVersion) {
        console.error(
          `Terms version mismatch in worker: ${workerContent.termsVersion} vs ${versionData.termsVersion}`,
        );
        hasError = true;
      }
      if (workerContent.termsSha256 !== termsSha256) {
        console.error(
          `Terms SHA-256 mismatch in worker: ${workerContent.termsSha256} vs ${termsSha256}`,
        );
        hasError = true;
      }
      if (workerContent.privacyVersion !== versionData.privacyVersion) {
        console.error(
          `Privacy version mismatch in worker: ${workerContent.privacyVersion} vs ${versionData.privacyVersion}`,
        );
        hasError = true;
      }
      if (workerContent.privacySha256 !== privacySha256) {
        console.error(
          `Privacy SHA-256 mismatch in worker: ${workerContent.privacySha256} vs ${privacySha256}`,
        );
        hasError = true;
      }
      if (workerContent.termsMarkdown !== termsContent) {
        console.error(
          "Terms markdown in worker does not match docs markdown file",
        );
        hasError = true;
      }
      if (workerContent.privacyMarkdown !== privacyContent) {
        console.error(
          "Privacy markdown in worker does not match docs markdown file",
        );
        hasError = true;
      }
    } catch (e) {
      console.error(`Error reading ${targetFile}: ${e.message}`);
      hasError = true;
    }
  }

  if (hasError) {
    console.error(
      "Anti-desynchronization check FAILED: Legal documents or versions are out of sync.",
    );
    process.exit(1);
  }

  console.log(
    "Anti-desynchronization check PASSED: All legal documents, versions, and hashes match.",
  );
  process.exit(0);
}

// Write / sync mode
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const output = {
  termsVersion: versionData.termsVersion,
  termsSha256,
  termsMarkdown: termsContent,
  privacyVersion: versionData.privacyVersion,
  privacySha256,
  privacyMarkdown: privacyContent,
};

fs.writeFileSync(targetFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  "Successfully synced legal documents to worker/src/backend/legal/legal-content.json",
);
