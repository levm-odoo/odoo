# To download the content of XML for users
from odoo import http, _
from odoo.http import request, content_disposition


class EfakturCoretaxDownload(http.Controller):

    @http.route('/l10n_id_efaktur_coretax/download_efaktur/<models("account.move"):invoices>', type='http', auth='user')
    def download_invoice_efaktur(self, invoices):
        invoices.check_access_rights('read')

        # Gather XML Content then make an XML response
        xml = invoices.l10n_id_efaktur_build_xml()
        headers = [
            ('Content-Type', 'text/xml'),
            ('Content-Length', len(xml)),
            ('Content-Disposition', content_disposition("efaktur.xml")),
        ]

        return request.make_response(xml, headers)
