"""Mask private values only in persistence snapshots, never in live replies."""
import re
import hashlib

_EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[\w-]+", re.UNICODE)
_DIGITS = re.compile(r"(?<!\w)(?:\+?\d[ ()\u00a0.-]*){10,20}(?!\w)")
_NAME_KEYS = {"fio", "full_name", "fullname", "name", "first_name", "last_name",
              "middle_name", "surname", "patronymic", "director", "director_name",
              "contact_name", "owner_name", "фамилия", "имя", "отчество", "фио"}
# Explicitly labelled names are also known values, not guesses about capitalization.
_LABELLED_NAME = re.compile(r"\bФИО\s*[:=]?\s*([А-ЯЁа-яё-]+(?:\s+[А-ЯЁа-яё-]+){1,2})", re.I)


def name_hash(name):
    return hashlib.sha256(" ".join(name.casefold().split()).encode("utf-8")).hexdigest()


def name_values(profile):
    values = []
    if isinstance(profile, dict):
        for key, value in profile.items():
            if key.casefold() in _NAME_KEYS and isinstance(value, str) and value.strip():
                values.append(value.strip())
            elif isinstance(value, (dict, list)):
                values.extend(name_values(value))
    elif isinstance(profile, list):
        for item in profile:
            values.extend(name_values(item))
    return values


def redact(value, profile=None):
    """Return a detached snapshot, including nested trace, fields and objections."""
    names = name_values(profile or {})
    def collect(item):
        if isinstance(item, str):
            names.extend(m[1] for m in _LABELLED_NAME.finditer(item))
        elif isinstance(item, dict):
            for child in item.values():
                collect(child)
        elif isinstance(item, list):
            for child in item:
                collect(child)
    collect(value)
    hashes = set(value.get("_privacy_name_hashes", [])) if isinstance(value, dict) else set()
    def clean(item):
        if isinstance(item, str):
            tokens = list(re.finditer(r"[\w-]+", item))
            spans = []
            for i, token in enumerate(tokens):
                for end in tokens[i:i + 5]:
                    if name_hash(item[token.start():end.end()]) in hashes:
                        spans.append((token.start(), end.end()))
            selected = []
            for start, end in sorted(spans, key=lambda span: (span[0], -span[1])):
                if not selected or start >= selected[-1][1]:
                    selected.append((start, end))
            for start, end in reversed(selected):
                item = item[:start] + "[ФИО]" + item[end:]
            for name in sorted(set(names), key=len, reverse=True):
                item = re.sub(r"(?<!\w)" + re.escape(name) + r"(?!\w)", "[ФИО]", item, flags=re.I)
            item = _EMAIL.sub("[EMAIL]", item)
            return _DIGITS.sub(lambda m: "[ПДн]" if len(re.sub(r"\D", "", m[0])) in
                               (10, 11, 12, 16, 20) else m[0], item)
        if isinstance(item, dict):
            return {key: clean(child) for key, child in item.items() if key != "_privacy_profile"}
        if isinstance(item, list):
            return [clean(child) for child in item]
        return item
    return clean(value)
