from __future__ import annotations

import re
import typing

if typing.TYPE_CHECKING:
    from odoo.cli.upgrade_code import FileManager


def upgrade(file_manager: FileManager):
    temporal_from_string_re = re.compile(r"(Date|Datetime)\.from_string")

    for file in file_manager:
        if file.path.suffix != '.py':
            continue
        content = file.content
        content = temporal_from_string_re.sub(lambda m: m[0] + '.' + ('to_date' if m[0] == 'Date' else 'to_datetime'), content)
        file.content = content
