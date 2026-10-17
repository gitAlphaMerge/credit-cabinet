import type { ReactNode } from "react";
// Deliberately no raw HTML, arbitrary URLs or executable markdown plugins.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((s, i) =>
      s.startsWith("**") ? (
        <strong key={i}>{s.slice(2, -2)}</strong>
      ) : s.startsWith("`") ? (
        <code key={i}>{s.slice(1, -1)}</code>
      ) : (
        s
      ),
    );
}
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n"),
    nodes: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i]);
      nodes.push(
        <pre key={i}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || "")) {
      const cells = (s: string) =>
        s
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((v) => v.trim());
      const header = cells(line),
        rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      nodes.push(
        <div key={i} className="table-scroll">
          <table>
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j}>{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      do {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      } while (i < lines.length && /^[-*]\s+/.test(lines[i]));
      i--;
      nodes.push(
        <ul key={i}>
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      do {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      } while (i < lines.length && /^\d+\.\s+/.test(lines[i]));
      i--;
      nodes.push(
        <ol key={i}>
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^#{1,4}\s/.test(line))
      nodes.push(<h3 key={i}>{inline(line.replace(/^#{1,4}\s/, ""))}</h3>);
    else if (line.trim()) nodes.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="markdown-text">{nodes}</div>;
}
