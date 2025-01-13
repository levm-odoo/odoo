import base64
from pytz import timezone
from datetime import datetime

from odoo import Command
from odoo.tools import file_open, misc
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


class TestEsEdiVerifactuCommon(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls, chart_template_ref='es_full'):
        super().setUpClass(chart_template_ref=chart_template_ref)

        # Allow to see the full result of AssertionError.
        cls.maxDiff = None

        certificate_path = "l10n_es_edi_verifactu/demo/certificates/Certificado_RPJ_A39200019_CERTIFICADO_ENTIDAD_PRUEBAS_4_Pre.p12"
        cls.certificate = cls.env['l10n_es_edi_verifactu.certificate'].create({
            'content': base64.encodebytes(misc.file_open(certificate_path, 'rb').read()),
            'password': '1234',
        })

        cls.company = cls.company_data['company']
        cls.company.write({
            'country_id': cls.env.ref('base.es').id,
            'state_id': cls.env.ref('base.state_es_z').id,
            'vat': 'ES59962470K',
            'l10n_es_edi_verifactu_certificate_ids': [Command.set(cls.certificate.ids)],
            'l10n_es_edi_verifactu_test_environment': True,
        })

        cls.partner_a.write({
            'vat': 'BE0477472701',
            'country_id': cls.env.ref('base.be').id,
        })

        cls.partner_b.write({
            'vat': 'ESF35999705',
        })

        cls.product_1 = cls.env['product.product'].create({
           'name': "Product 1",
        })

        cls.tax21_goods = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_iva21b")
        cls.tax21_services = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_iva21s")
        cls.tax10_goods = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_iva10b")
        cls.tax10_services = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_iva10s")
        cls.tax_s_req014 = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_req014")
        cls.tax_s_req52 = cls.env["account.chart.template"].with_company(cls.company).ref("account_tax_template_s_req52")

    @classmethod
    def _read_file(cls, path, *args):
        with file_open(path, *args) as f:
            content = f.read()
        return content

    def _assert_verifactu_xml(self, xml, file):
        expected_xml = self._read_file(file, 'rb')
        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(xml),
            self.get_xml_tree_from_string(expected_xml),
        )
