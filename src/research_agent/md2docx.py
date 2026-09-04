"""pandoc 模板转 Word 管线。

智能体先写结构化 Markdown(章节/表格/图),再由 pandoc 按用户模板转成
真正排好版的 .docx。格式完全由模板控制(封面/标题样式/表格/图注)。

用法:
  md_to_docx(md_text, out_path, reference_doc)  → 调 pandoc 转换
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def md_to_docx(
    md_text: str,
    out_path: str | Path,
    reference_doc: str | Path = "",
    extra_args: list[str] | None = None,
) -> dict:
    """把 Markdown 转成 Word .docx。

    - md_text: 结构化 Markdown 文本
    - out_path: 输出 .docx 路径
    - reference_doc: 用户上传的 Word 格式模板(pandoc --reference-doc)
    - extra_args: 附加 pandoc 参数(如 --toc)
    """
    out = Path(out_path)
    tmp_md = out.with_suffix(".md")
    tmp_md.write_text(md_text, encoding="utf-8")

    cmd = ["pandoc", str(tmp_md), "-o", str(out)]
    if reference_doc:
        cmd.append("--reference-doc")
        cmd.append(str(reference_doc))
    if extra_args:
        cmd.extend(extra_args)

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return {"error": "pandoc 未安装", "ok": False}
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or "pandoc 转换失败", "ok": False}
    return {"filename": str(out), "ok": True, "reference_doc": str(reference_doc or "")}


# 便捷:从 md 文件转 docx
def md_file_to_docx(md_file: str, out_path: str, reference_doc: str = "") -> dict:
    text = Path(md_file).read_text(encoding="utf-8")
    return md_to_docx(text, out_path, reference_doc)