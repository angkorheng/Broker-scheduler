export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const nameIdx  = headers.findIndex(h => h.includes("name") || h === "fullname" || h === "contact");
  const phoneIdx = headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("cell"));
  const emailIdx = headers.findIndex(h => h.includes("email"));
  if (nameIdx === -1) return null;
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      id: "csv_" + Date.now() + "_" + i,
      name: cols[nameIdx] || "",
      phone: phoneIdx >= 0 ? cols[phoneIdx] || "" : "",
      email: emailIdx >= 0 ? cols[emailIdx] || "" : "",
      importedFrom: "csv",
      contactSource: "",
    };
  }).filter(c => c.name);
}
