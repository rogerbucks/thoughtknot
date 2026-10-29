"""SEC-7 (security_fix_rule): XML is read with entities left unexpanded and nothing fetched. A
crafted SCXML file or Word document naming an external entity cannot read a local file into what
the library reads. No XML parse in the library's sources goes without the safe parser.

Usage:
  cd python/graph_spec
  uv run --locked python -m unittest tests.test_optional_imports_safe_parser
"""

import os
import pathlib
import re
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)

from graphspec.engine.documents.reading import gql_block  # noqa: E402
from graphspec.engine.process.scxml import NS, ScxmlReader  # noqa: E402

LEAK_MARK = "the-line-in-a-local-file-kept-out"
WML = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def entity_doc(outside_path, body):
    """An XML document whose DTD names a local file as an external entity, used in its body."""
    # as a file URI, so that a Windows path, with its drive and backslashes, is one too
    uri = pathlib.Path(outside_path).as_uri()
    return f'<?xml version="1.0"?>\n<!DOCTYPE x [<!ENTITY leak SYSTEM "{uri}">]>\n{body}'


class SafeXml(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.kept_out = os.path.join(self.dir.name, "outside.txt")
        with open(self.kept_out, "w", encoding="utf-8") as f:
            f.write(LEAK_MARK)

    def tearDown(self):
        self.dir.cleanup()

    def test_scxml_external_entity_is_not_expanded(self):
        xml = entity_doc(
            self.kept_out, f'<scxml xmlns="{NS}" initial="a"><state id="a">&leak;</state></scxml>'
        )
        reader = ScxmlReader(xml)
        self.assertNotIn(LEAK_MARK, "".join(reader.doc.itertext()))

    def test_word_external_entity_is_not_expanded(self):
        body = (
            f'<w:document xmlns:w="{WML}"><w:body><w:sdt><w:sdtPr><w:tag w:val="spec:gql"/>'
            "</w:sdtPr><w:sdtContent><w:p><w:r><w:t>&leak;</w:t></w:r></w:p></w:sdtContent>"
            "</w:sdt></w:body></w:document>"
        )
        path = os.path.join(self.dir.name, "crafted.docx")
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("word/document.xml", entity_doc(self.kept_out, body))
        self.assertNotIn(LEAK_MARK, gql_block(path))

    def test_no_xml_parse_goes_without_the_safe_parser(self):
        """The rule that keeps SEC-7 from coming back: every fromstring, parse or XML call on an
        lxml tree in the sources passes safe_parser()."""
        bare = []
        for base, _, files in os.walk(SRC):
            for name in files:
                if not name.endswith(".py"):
                    continue
                path = os.path.join(base, name)
                with open(path, encoding="utf-8") as f:
                    for n, line in enumerate(f, 1):
                        if re.search(r"\b(?:etree|_et)\.(?:fromstring|parse|XML)\(", line) and (
                            "safe_parser()" not in line
                        ):
                            bare.append(f"{os.path.relpath(path, SRC)}:{n}")
        self.assertEqual(bare, [], "parse XML with safe_parser() from optional_imports")


if __name__ == "__main__":
    unittest.main()
