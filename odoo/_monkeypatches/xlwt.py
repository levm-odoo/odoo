import re


try:
    import xlwt
except ImportError:
    xlwt = None


def patch():
    if not xlwt:
        return {}

    # add some sanitization to respect the excel sheet name restrictions
    # as the sheet name is often translatable, can not control the input
    class PatchedWorkbook(xlwt.Workbook):
        def add_sheet(self, name, cell_overwrite_ok=False):
            # invalid Excel character: []:*?/\
            name = re.sub(r'[\[\]:*?/\\]', '', name)

            # maximum size is 31 characters
            name = name[:31]
            return super(PatchedWorkbook, self).add_sheet(name, cell_overwrite_ok=cell_overwrite_ok)

    xlwt.Workbook = PatchedWorkbook
    return {'xlwt': xlwt}
