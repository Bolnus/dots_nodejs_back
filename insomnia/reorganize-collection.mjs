import fs from "fs";

const yamlPath = "insomnia/dots_nodejs_back.yaml";

function normalize(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isNewRequestLine(line) {
  return /^      - url:/.test(line);
}

function isTopLevelFolderLine(line) {
  return /^  - name:/.test(line);
}

function extractRequests(collectionLines) {
  const requests = [];
  let current = null;

  for (const line of collectionLines) {
    if (isNewRequestLine(line)) {
      if (current) {
        requests.push(current);
      }
      current = [line];
      continue;
    }
    if (current) {
      if (isTopLevelFolderLine(line)) {
        requests.push(current);
        current = null;
        continue;
      }
      current.push(line);
    }
  }
  if (current) {
    requests.push(current);
  }
  return requests;
}

function fixWebSocketRequest(lines) {
  return lines.map((line) => {
    if (line.includes("PRESENCE_DELTA") && line.includes("sortKey:")) {
      return "            Server events: ROOM_STATE, STATE_DELTA, PRESENCE_DELTA (each includes full room detail).";
    }
    return line;
  });
}

let yaml = normalize(fs.readFileSync(yamlPath, "utf8"));

const collectionStart = yaml.indexOf("collection:\n");
const envStart = yaml.indexOf("\nenvironments:");
if (collectionStart < 0 || envStart < 0) {
  throw new Error("collection or environments section not found");
}

const header = yaml.slice(0, collectionStart);
const envSection = yaml.slice(envStart + 1);
const collectionBody = yaml.slice(collectionStart + "collection:\n".length, envStart);

const requestBlocks = extractRequests(collectionBody.split("\n")).map((lines) =>
  fixWebSocketRequest(lines).join("\n")
);

const folderHeader = `  - name: API
    meta:
      id: fld_dots_api
      created: 1749000000000
      modified: 1749000000000
      sortKey: -1000
      description: All dots_nodejs_back HTTP and WebSocket requests.
    children:
`;

const children = requestBlocks.map((block) => block.split("\n").join("\n")).join("\n");

const output =
  header +
  "collection:\n" +
  folderHeader +
  children +
  "\n" +
  envSection;

fs.writeFileSync(yamlPath, output, "utf8");
console.log(`Flattened ${requestBlocks.length} requests into single API folder`);
