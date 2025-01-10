from odoo.tools.xml_utils import find_xml_value


def _find_value(self, xpaths, tree, nsmap=False):
    """ Iteratively queries the tree using the xpaths and returns a result as soon as one is found """
    if not isinstance(xpaths, (tuple, list)):
        xpaths = [xpaths]
    for xpath in xpaths:
        # functions from ElementTree like "findtext" do not fully implement xpath, use "xpath" (from lxml) instead
        # (e.g. "//node[string-length(text()) > 5]" raises an invalidPredicate exception with "findtext")
        val = find_xml_value(xpath, tree, nsmap)
        if val:
            return val
