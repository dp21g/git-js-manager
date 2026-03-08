export function shortPath(value = "") {
  if (!value) return "";
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length <= 3 ? value : `…/${parts.slice(-3).join("/")}`;
}