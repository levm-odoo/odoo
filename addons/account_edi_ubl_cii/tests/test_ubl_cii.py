# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import etree
from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged
from odoo.tools import file_open


@tagged('post_install', '-at_install')
class TestAccountEdiUblCii(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_data_2 = cls.setup_other_company()

        cls.uom_units = cls.env.ref('uom.product_uom_unit')
        cls.uom_hour = cls.env.ref('uom.product_uom_hour')

        cls.displace_prdct = cls.env['product.product'].create({
            'name': 'Displacement',
            'uom_id': cls.uom_units.id,
            'standard_price': 90.0,
        })

        cls.place_prdct = cls.env['product.product'].create({
            'name': 'Placement',
            'uom_id': cls.uom_units.id,
            'standard_price': 80.0,
        })

    def import_attachment(self, attachment, journal=None):
        journal = journal or self.company_data["default_journal_purchase"]
        return self.env['account.journal'] \
            .with_context(default_journal_id=journal.id) \
            ._create_document_from_attachment(attachment.id)

    def test_import_product(self):
        line_vals = [
            {
                'product_id': self.place_prdct.id,
                'product_uom_id': self.uom_units.id,
                'tax_ids': [self.company_data_2['default_tax_sale'].id]
            }, {
                'product_id': self.displace_prdct.id,
                'product_uom_id': self.uom_hour.id,
                'tax_ids': [self.company_data_2['default_tax_sale'].id]
            }, {
                'product_id': self.displace_prdct.id,
                'product_uom_id': self.uom_units.id,
                'tax_ids': [self.company_data_2['default_tax_sale'].id]
            }, {
                'product_id': self.displace_prdct.id,
                'product_uom_id': self.uom_units.id,
                'tax_ids': [self.company_data_2['default_tax_sale'].id]
            }
        ]
        company = self.company_data_2['company']
        company.country_id = self.env['res.country'].search([('code', '=', 'FR')])
        company.vat = 'FR23334175221'
        company.email = 'company@site.ext'
        company.phone = '+33499999999'
        company.zip = '78440'

        company.partner_id.with_company(company).invoice_edi_format = 'facturx'
        company.partner_id.bank_ids = [Command.create({
            'acc_number': '999999',
            'partner_id': company.partner_id.id,
            'acc_holder_name': 'The Chosen One'
        })]

        invoice = self.env['account.move'].create({
            'company_id': company.id,
            'partner_id': company.partner_id.id,
            'move_type': 'out_invoice',
            'journal_id': self.company_data_2['default_journal_sale'].id,
            'invoice_line_ids': [Command.create(vals) for vals in line_vals],
        })
        invoice.action_post()

        print_wiz = self.env['account.move.send.wizard'].create({
            'move_id': invoice.id,
            'sending_methods': ['manual'],
        })
        self.assertEqual(print_wiz.invoice_edi_format, 'facturx')
        print_wiz.action_send_and_print()

        facturx_attachment = invoice.ubl_cii_xml_id
        xml_tree = etree.fromstring(facturx_attachment.raw)

        # Testing the case where a product on the invoice has a UoM with a different category than the one in the DB
        wrong_uom_line = xml_tree.findall('./{*}SupplyChainTradeTransaction/{*}IncludedSupplyChainTradeLineItem')[1]
        wrong_uom_line.find('./{*}SpecifiedLineTradeDelivery/{*}BilledQuantity').attrib['unitCode'] = 'HUR'

        facturx_attachment.raw = etree.tostring(xml_tree)
        new_invoice = invoice.journal_id._create_document_from_attachment(facturx_attachment.ids)
        self.assertRecordValues(new_invoice.invoice_line_ids, line_vals)

    def test_import_tax_prediction(self):
        """ We are going to create 2 tax and import the e-invoice twice.

        On the first attempt, as there isn't any data to leverage, the classic 'search' will be called and we expect
        the first tax created to be the selected one as the retrieval order is `sequence, id`.

        We will set the second tax on the bill and post it which make it the most probable one.

        On the second attempt, we expect that second tax to be retrieved.
        """
        self.env.ref('base.EUR').active = True  # EUR might not be active and is used in the xml testing file
        if not hasattr(self.env["account.move.line"], '_predict_specific_tax'):
            self.skipTest("The predictive bill module isn't install and thus prediction with edi can't be tested.")
        # create 2 new taxes for the test seperatly to ensure the first gets the smaller id
        new_tax_1 = self.env["account.tax"].create({
            'name': 'tax with lower id could be retrieved first',
            'amount_type': 'percent',
            'type_tax_use': 'purchase',
            'amount': 16.0,
        })
        new_tax_2 = self.env["account.tax"].create({
            'name': 'tax with higher id could be retrieved second',
            'amount_type': 'percent',
            'type_tax_use': 'purchase',
            'amount': 16.0,
        })

        file_path = "bis3_bill_example.xml"
        file_path = f"{self.test_module}/tests/test_files/{file_path}"
        with file_open(file_path, 'rb') as file:
            xml_attachment = self.env['ir.attachment'].create({
                'mimetype': 'application/xml',
                'name': 'test_invoice.xml',
                'raw': file.read(),
            })

        # Import the document for the first time
        bill = self.import_attachment(xml_attachment, self.company_data["default_journal_purchase"])

        # Ensure the first tax is retrieved as there isn't any prediction that could be leverage
        self.assertEqual(bill.invoice_line_ids.tax_ids, new_tax_1)

        # Set the second tax on the line to make it the most probable one
        bill.invoice_line_ids.tax_ids = new_tax_2
        bill.action_post()

        # Import the bill again and ensure the prediction did his work
        bill = self.import_attachment(xml_attachment, self.company_data["default_journal_purchase"])
        self.assertEqual(bill.invoice_line_ids.tax_ids, new_tax_2)

    def test_peppol_eas_endpoint_compute(self):
        partner = self.partner_a
        partner.vat = 'DE123456788'

        self.assertRecordValues(partner, [{
            'peppol_eas': '9930',
            'peppol_endpoint': 'DE123456788',
        }])

        partner.vat = 'FR23334175221'

        self.assertRecordValues(partner, [{
            'peppol_eas': '9957',
            'peppol_endpoint': 'FR23334175221',
        }])

        partner.vat = '23334175221'

        self.assertRecordValues(partner, [{
            'peppol_eas': '9957',
            'peppol_endpoint': 'FR23334175221',
        }])

        partner.write({
            'vat': 'BE0477472701',
            'company_registry': '0477472701',
        })

        self.assertRecordValues(partner, [{
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472701',
        }])

    def test_import_partner_peppol_fields(self):
        """ Check that the peppol fields are used to retrieve the partner when importing a Bis 3 xml. """
        partner = self.env['res.partner'].create({
            'name': "My Belgian Partner",
            'vat': "BE0477472701",
            'peppol_eas': "0208",
            'peppol_endpoint': "0477472701",
            'email': "mypartner@email.com",
        })
        invoice = self.env['account.move'].create({
            'partner_id': partner.id,
            'move_type': 'out_invoice',
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id})]
        })
        invoice.action_post()
        xml_attachment = self.env['ir.attachment'].create({
            'raw': self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0],
            'name': 'test_invoice.xml',
        })

        # There is a duplicated partner (with the same name and email)
        self.env['res.partner'].create({
            'name': "My Belgian Partner",
            'email': "mypartner@email.com",
        })
        # Change the fields of the partner, keep the peppol fields
        partner.update({
            'name': "Turlututu",
            'email': False,
            'vat': False,
        })
        # The partner should be retrieved based on the peppol fields
        imported_invoice = self.import_attachment(xml_attachment, self.company_data["default_journal_sale"])
        self.assertEqual(imported_invoice.partner_id, partner)

    def test_import_partner_postal_address(self):
        " Test importing postal address when creating new partner from UBL xml."
        file_path = "bis3_bill_example.xml"
        file_path = f"{self.test_module}/tests/test_files/{file_path}"
        with file_open(file_path, 'rb') as file:
            xml_attachment = self.env['ir.attachment'].create({
                'mimetype': 'application/xml',
                'name': 'test_invoice.xml',
                'raw': file.read(),
            })

        partner_vals = {
            'name': "ALD Automotive LU",
            'email': "adl@test.com",
            'vat': "LU12977109",
        }
        # assert there is no matching partner
        partner_match = self.env['res.partner']._retrieve_partner(**partner_vals)
        self.assertFalse(partner_match)

        bill = self.import_attachment(xml_attachment)

        self.assertRecordValues(bill.partner_id, [partner_vals])
        self.assertEqual(bill.partner_id.contact_address_complete, "270 rte d'Arlon, 8010 Strassen, Luxembourg")
