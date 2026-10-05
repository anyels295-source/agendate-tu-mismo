"""Genera la página web del glosario a partir de docs/glosario.md.
Uso: python docs/glosario-web/generar.py <ruta al glosario.md> <ruta de salida .html>
"""
import json
import re
import sys
from html import escape

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().replace("\r\n", "\n").split("\n")


def inline(text: str) -> str:
    t = escape(text, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    return t


groups, history, intro = [], [], []
cur_group, cur_entry = None, None
in_history = False
for raw in lines:
    line = raw.rstrip()
    if line.startswith("# "):
        continue
    if line.startswith("## "):
        title = line[3:].strip()
        if title.lower().startswith("historial"):
            in_history, cur_group, cur_entry = True, None, None
            continue
        in_history = False
        title = re.sub(r"^\d+\.\s*", "", title)
        cur_group = {"id": f"g{len(groups) + 1}", "title": title, "entries": []}
        groups.append(cur_group)
        cur_entry = None
        continue
    if in_history:
        m = re.match(r"\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|$", line)
        if m:
            history.append([m.group(1), inline(m.group(2))])
        continue
    if line.startswith("### ") and cur_group is not None:
        cur_entry = {"name": inline(line[4:].strip()), "plain": line[4:].strip().replace("`", ""), "que": [], "java": "", "proy": ""}
        cur_group["entries"].append(cur_entry)
        continue
    if cur_entry is not None:
        if line.startswith("- **Parecido en Java:**"):
            cur_entry["java"] = inline(line.split(":**", 1)[1].strip())
        elif line.startswith("- **En el proyecto:**"):
            cur_entry["proy"] = inline(line.split(":**", 1)[1].strip())
        elif line.strip() and line.strip() != "---":
            cur_entry["que"].append(inline(line.strip().lstrip("- ")))
    elif cur_group is None and line.strip() and line.strip() != "---":
        intro.append(inline(line.strip()))

for g in groups:
    for e in g["entries"]:
        e["que"] = " ".join(e["que"])
        e["search"] = re.sub(r"<[^>]+>", " ", " ".join([e["plain"], e["que"], e["java"], e["proy"]]))

data = {"groups": groups, "history": history}
total = sum(len(g["entries"]) for g in groups)
last_update = history[-1][0] if history else ""

html = TEMPLATE = open(__file__.replace("generar.py", "plantilla.html"), encoding="utf-8").read()
html = html.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
html = html.replace("__TOTAL__", str(total)).replace("__UPDATED__", last_update)
open(out, "w", encoding="utf-8").write(html)
print(f"{len(groups)} grupos, {total} términos, última actualización {last_update}")
