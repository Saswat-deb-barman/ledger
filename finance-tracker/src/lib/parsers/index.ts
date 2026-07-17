import { ParsedStatement } from "./types";
import { parseAxis } from "./axis";
import { parseKotak } from "./kotak";
import { parseYesBank } from "./yesbank";

export * from "./types";
export { extractMerchant } from "./merchant";

// Detect bank from file content + name, then dispatch to the right adapter.
export function parseStatement(fileName: string, buf: Buffer): ParsedStatement {
  const head = buf.slice(0, 2000).toString("utf8");

  if (head.includes("urn:schemas-microsoft-com:office:spreadsheet") || head.includes("YES BANK"))
    return parseYesBank(buf.toString("utf8"), fileName);

  if (head.includes("Sl. No.") || head.includes("Kotak") || fileName.startsWith("KM"))
    return parseKotak(buf.toString("utf8"), fileName);

  // Axis binary XLS (OLE2 magic bytes D0 CF 11 E0) or filename hint
  if (buf[0] === 0xD0 && buf[1] === 0xCF) return parseAxis(buf, fileName);
  if (/AcctStatement/i.test(fileName)) return parseAxis(buf, fileName);

  throw new Error(`Could not detect bank format for ${fileName}`);
}
