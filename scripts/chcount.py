#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Author:      basilguo@163.com
# Date:        2026-09-04 10:24:52
# File Name:   chcount.py
# Version:     0.0.1
# Description:

#!/usr/bin/env python3
import sys
import re
import argparse

# 汉字 Unicode 区间
CHINESE_CHAR = re.compile(r'[\u4e00-\u9fff]')
# 中文标点
CHINESE_PUNC = re.compile(r'[\u3000-\u303f\uff00-\uffef]')
# 英文字母
ENGLISH_LETTER = re.compile(r'[a-zA-Z]')
# 数字
DIGIT = re.compile(r'[0-9]')
# 空白字符
WHITESPACE = re.compile(r'\s')
# 英文单词
EN_WORD = re.compile(r'[a-zA-Z]+')


def count_text(text: str):
    hanzi = len(CHINESE_CHAR.findall(text))
    cn_punc = len(CHINESE_PUNC.findall(text))
    en_letter = len(ENGLISH_LETTER.findall(text))
    digit = len(DIGIT.findall(text))
    space = len(WHITESPACE.findall(text))
    en_words = len(EN_WORD.findall(text))
    total_chars = len(text)
    cn_all = hanzi + cn_punc

    return {
        "hanzi": hanzi,
        "cn_punctuation": cn_punc,
        "cn_total(hanzi+punc)": cn_all,
        "english_letters": en_letter,
        "english_words": en_words,
        "digits": digit,
        "whitespace": space,
        "total_length": total_chars
    }


def main():
    parser = argparse.ArgumentParser(description="Chinese character counter CLI")
    parser.add_argument("file", nargs='?', help="input file path, empty for stdin")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf‑8") as f:
            content = f.read()
    else:
        content = sys.stdin.read()

    res = count_text(content)
    for k, v in res.items():
        print(f"{k:<25} {v}")


if __name__ == "__main__":
    main()
