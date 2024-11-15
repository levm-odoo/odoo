from freezegun import freeze_time

from odoo import Command
from odoo.tests import tagged
from .common import TestEsEdiVerifactuCommon

@freeze_time('2024-12-05')
@tagged('post_install_l10n', 'post_install', '-at_install')
class TestEsEdiVerifactuXml(TestEsEdiVerifactuCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    # TODO: refactor? just create invoice vals?
    @classmethod
    def create_invoice(cls, **kwargs):
        return cls.env['account.move'].with_context(edi_test_mode=True).create({
            'move_type': 'out_invoice',
            'invoice_date': '2019-01-30',
            'date': '2019-01-30',
            **kwargs,
        })

    def test_invoice_1(self):
        invoice = self.create_invoice(
            partner_id=self.partner_b.id,  # Spanish customer
            invoice_line_ids=[
                # TODO: should goods and services be grouped together?
                Command.create({'product_id': self.product_1.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax21_goods.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 200.0, 'tax_ids': [Command.set(self.tax21_services.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 1000.0, 'tax_ids': [Command.set(self.tax10_goods.ids)]}),
            ],
        )
        invoice.action_post()
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(invoice)
        xml = batch_info['xml']
        self._assert_verifactu_xml(xml, "l10n_es_edi_verifactu/tests/files/test_invoice_1.xml")

    def test_invoice_multicurrency_1(self):
        invoice = self.create_invoice(
            currency_id=self.currency_data['currency'].id,
            partner_id=self.partner_b.id,  # Spanish customer
            invoice_line_ids=[
                Command.create({'product_id': self.product_1.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax21_goods.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 200.0, 'tax_ids': [Command.set(self.tax21_services.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 1000.0, 'tax_ids': [Command.set(self.tax10_goods.ids)]}),
            ],
        )
        invoice.action_post()
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(invoice)
        xml = batch_info['xml']
        self._assert_verifactu_xml(xml, "l10n_es_edi_verifactu/tests/files/test_invoice_multi_currency_1.xml")

    def test_invoice_with_predecessor(self):
        invoice = self.create_invoice(
            partner_id=self.partner_b.id,  # Spanish customer
            invoice_line_ids=[
                # TODO: should goods and services be grouped together?
                Command.create({'product_id': self.product_1.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax21_goods.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 200.0, 'tax_ids': [Command.set(self.tax21_services.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 1000.0, 'tax_ids': [Command.set(self.tax10_goods.ids)]}),
            ],
        )
        invoice.action_post()

        subtests = [
            {
              'previous_record_type': 'registration',
              'previous_record_render_vals': {
                  'RegistroAlta' : {
                      'IDFactura': {
                          'IDEmisorFactura': '59962470K',
                          'NumSerieFactura': 'INV/2019/00001',
                          'FechaExpedicionFactura': '01-01-2019',
                      },
                      'Huella': 'FA5DC48A0640BEB02A05160FD30020D1EA67FC1B400800ECDD9FC785E137C864',
                  },
              },
            },
            {
              'previous_record_type': 'cancellation',
              'previous_record_render_vals': {
                  'RegistroAnulacion' : {
                      'IDFactura': {
                          'IDEmisorFacturaAnulada': '59962470K',
                          'NumSerieFacturaAnulada': 'INV/2019/00001',
                          'FechaExpedicionFacturaAnulada': '01-01-2019',
                      },
                      'Huella': 'FA5DC48A0640BEB02A05160FD30020D1EA67FC1B400800ECDD9FC785E137C864',
                  },
              },
            },
        ]

        for subtest in subtests:
            with self.subTest(f"preceding record is {subtest['previous_record_type']}"):
                batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(
                    invoice, previous_record_render_vals=subtest['previous_record_render_vals'],
                )
                xml = batch_info['xml']
                self._assert_verifactu_xml(xml, "l10n_es_edi_verifactu/tests/files/test_invoice_with_predecessor.xml")

    def test_invoice_cancellation_1(self):
        invoice = self.create_invoice(
            partner_id=self.partner_b.id,  # Spanish customer
            invoice_line_ids=[
                Command.create({'product_id': self.product_1.id, 'price_unit': 100.0, 'tax_ids': [Command.set(self.tax21_goods.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 200.0, 'tax_ids': [Command.set(self.tax21_services.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 1000.0, 'tax_ids': [Command.set(self.tax10_goods.ids)]}),
            ],
        )
        invoice.action_post()
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(invoice, records_to_cancel=invoice)
        xml = batch_info['xml']
        self._assert_verifactu_xml(xml, "l10n_es_edi_verifactu/tests/files/test_invoice_cancellation_1.xml")

    def test_invoice_2(self):
        invoice = self.create_invoice(
            partner_id=self.partner_b.id,  # Spanish customer
            invoice_line_ids=[
                Command.create({'product_id': self.product_1.id, 'price_unit': 1000.0, 'tax_ids': [Command.set(self.tax21_services.ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 100.0, 'tax_ids': [Command.set((self.tax10_goods + self.tax_s_req014).ids)]}),
                Command.create({'product_id': self.product_1.id, 'price_unit': 200.0, 'tax_ids': [Command.set((self.tax21_services + self.tax_s_req52).ids)]}),
            ],
        )
        invoice.action_post()
        batch_info = self.env['l10n_es_edi_verifactu.xml']._export_records_registration_xml(invoice)
        xml = batch_info['xml']
        # TODO: XML may not give the right results currently
        self._assert_verifactu_xml(xml, "l10n_es_edi_verifactu/tests/files/test_invoice_2.xml")
