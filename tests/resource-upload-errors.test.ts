import assert from "node:assert/strict";
import { reserveSchema } from "../src/lib/resources/service";
import { resourceErrorCode, resourceErrors } from "../src/lib/resources/errors";
const input = { programId: "10000000-0000-4000-8000-000000000001", categoryKey: "videos", title: "GIS-Part1", fileName: "الفصل الأول-GIS.mp4", sizeBytes: 3 * 1024 * 1024 * 1024 };
assert.equal(reserveSchema.parse(input).sizeBytes, 3221225472);
for (const [patch, code] of [[{ sizeBytes: 0 }, "EMPTY_FILE"], [{ sizeBytes: 6 * 1024 * 1024 * 1024 }, "FILE_TOO_LARGE"], [{ fileName: "../GIS.mp4" }, "INVALID_FILENAME"], [{ programId: "" }, "INVALID_PROGRAM"], [{ title: "x" }, "INVALID_TITLE"]] as const) {
  try { reserveSchema.parse({ ...input, ...patch }); assert.fail("invalid input accepted"); }
  catch(error) { assert.equal(resourceErrorCode(error), code); assert.ok(resourceErrors[code]); }
}
assert.equal(resourceErrorCode({ code: "P2028", message: "private details" }), "RESOURCE_DB_TIMEOUT");
assert.equal(resourceErrorCode({ code: "P2034" }), "RESOURCE_CONFLICT");
assert.equal(resourceErrorCode(new Error("secret connection details")), "RESOURCE_FAILED");
console.log("PASS: 3 GiB video validated; oversized/empty/filename/program/title errors distinguished; transaction failures mapped without leaking private error details.");
