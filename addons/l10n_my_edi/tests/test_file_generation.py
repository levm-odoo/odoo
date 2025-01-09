# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime

from freezegun import freeze_time
from lxml import etree

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tools import cleanup_xml_node
from odoo.tests import tagged

NS_MAP = {
    'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'sig': 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
    'sac': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
    'sbc': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
    'ds': 'http://www.w3.org/2000/09/xmldsig#',
    'xades': 'http://uri.etsi.org/01903/v1.3.2#',
    'inv': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
}


@tagged('post_install_l10n', 'post_install', '-at_install')
class L10nMyEDITestFileSubmission(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls, chart_template_ref='my'):
        super().setUpClass(chart_template_ref=chart_template_ref)

        # TIN number is required
        cls.industry_classification = cls.env['l10n_my_edi.industry_classification'].search([('code', '=', '01111')])
        cls.company_data['company'].write({
            'vat': 'C2584563200',
            'l10n_my_edi_mode': 'test',
            'l10n_my_edi_industrial_classification': cls.industry_classification.id,
            'l10n_my_identification_type': 'BRN',
            'l10n_my_identification_number': '202001234567',
            'state_id': cls.env.ref('base.state_my_jhr').id,
            'street': 'that one street, 5',
            'city': 'Main city',
            'phone': '+60123456789',
        })
        cls.partner_a.write({
            'vat': 'C2584563201',
            'l10n_my_identification_type': 'BRN',
            'l10n_my_identification_number': '202001234568',
            'country_id': cls.env.ref('base.my').id,
            'state_id': cls.env.ref('base.state_my_jhr').id,
            'street': 'that other street, 3',
            'city': 'Main city',
            'phone': '+60123456786',
        })
        cls.partner_b.write({
            'vat': 'EI00000000020',
            'l10n_my_identification_type': 'BRN',
            'l10n_my_identification_number': 'NA',
            'country_id': cls.env.ref('base.us').id,
            'state_id': cls.env.ref('base.state_us_1'),
            'street': 'that other street, 3',
            'city': 'Main city',
            'phone': '+60123456785',
        })

        cls.fakenow = datetime(2024, 7, 15, 10, 00, 00)
        cls.startClassPatcher(freeze_time(cls.fakenow))

    def test_01_can_generate_file(self):
        """
        Simply test that with a valid configuration, we can generate the file.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100],
        )
        invoice.action_post()

        file, errors = invoice._l10n_my_edi_generate_invoice_xml()
        self.assertEqual(errors, set())
        self.assertTrue(file)
        # The file is working! Now we assert that the specificities needed for this EDI (what you can find in this module) are found in the file.
        root = etree.fromstring(file)

        # 1. Invoice level

        # Validate the invoice type. In this case, an invoice with version 1.1 at the time of writing.
        self._assert_node_values(
            root,
            'cbc:InvoiceTypeCode',
            '01',
            attributes={'listVersionID': '1.1'},
        )

        # Validate that the issue time is present, and correct
        self._assert_node_values(
            root,
            'cbc:IssueTime',
            '10:00:00Z',
        )

        # 2. Supplier party
        supplier_root = root.xpath('cac:AccountingSupplierParty/cac:Party', namespaces=NS_MAP)[0]

        # Industry classification
        self._assert_node_values(
            supplier_root,
            'cbc:IndustryClassificationCode',
            self.industry_classification.code,
            attributes={'name': self.industry_classification.name},
        )
        # Party Identifications - TIN and BRN (or other type of id) are required. SST & TTX are tested separately.
        self._assert_node_values(
            supplier_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="TIN"]',
            self.company_data['company'].vat,
        )
        self._assert_node_values(
            supplier_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="BRN"]',
            self.company_data['company'].l10n_my_identification_number,
        )

        # Address format
        self._assert_node_values(
            supplier_root,
            'cac:PostalAddress/cac:AddressLine/cbc:Line',
            self.company_data['company'].street,
        )

        # 3. Customer level
        customer_root = root.xpath('cac:AccountingCustomerParty/cac:Party', namespaces=NS_MAP)[0]

        # Party Identifications - TIN and BRN (or other type of id) are required. SST & TTX are tested separately.
        self._assert_node_values(
            customer_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="TIN"]',
            self.partner_a.vat,
        )
        self._assert_node_values(
            customer_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="BRN"]',
            self.partner_a.l10n_my_identification_number,
        )

        # Address format
        self._assert_node_values(
            customer_root,
            'cac:PostalAddress/cac:AddressLine/cbc:Line',
            self.partner_a.street,
        )

    def test_02_multicurrency(self):
        """
        Simply ensure that in a multi currency environment, the rate is found in the file and is the expected one.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100], currency=self.currency_data['currency'], taxes=self.company_data['default_tax_sale']
        )
        invoice.action_post()

        file, _errors = invoice._l10n_my_edi_generate_invoice_xml()
        root = etree.fromstring(file)
        # We should have a tax exchange rate set.
        # The rate is the rate from foreign currency to MYR
        self._assert_node_values(
            root,
            'cac:TaxExchangeRate/cbc:CalculationRate',
            '0.5',
        )
        # Target currency is always MYR
        self._assert_node_values(
            root,
            'cac:TaxExchangeRate/cbc:TargetCurrencyCode',
            'MYR',
        )
        self._assert_node_values(
            root,
            'cac:TaxExchangeRate/cbc:SourceCurrencyCode',
            'Gol',
        )
        # Check that the TaxAmount node has the correct currency too
        self._assert_node_values(
            root,
            'cac:TaxTotal/cbc:TaxAmount',
            text='10.000',
            attributes={'currencyID': 'Gol'},
        )

    def test_03_optional_fields(self):
        """
        Set a few optional fields, and ensure that they appear as expecting in the file.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100], currency=self.currency_data['currency']
        )
        invoice.write({
            'invoice_incoterm_id': self.env.ref('account.incoterm_CFR').id,
            'l10n_my_edi_custom_form_reference': 'E12345678912',
        })

        self.company_data['company'].write({
            'sst_registration_number': 'A01-2345-67891012',
            'ttx_registration_number': '123-4567-89012345',
        })
        self.partner_a.sst_registration_number = 'A01-2345-67891013'

        invoice.action_post()

        file, _errors = invoice._l10n_my_edi_generate_invoice_xml()
        root = etree.fromstring(file)

        # We test a few values that are optional, yet mandatory in some cases (we leave it up to the user)
        # AdditionalDocumentReference => incoterm and customs
        self._assert_node_values(
            root,
            'cac:AdditionalDocumentReference[not(descendant::*[local-name() = "DocumentType"])]/cbc:ID',
            invoice.invoice_incoterm_id.code,
        )
        self._assert_node_values(
            root,
            'cac:AdditionalDocumentReference[descendant::*[local-name() = "DocumentType"]]/cbc:DocumentType',
            'CustomsImportForm',
        )
        self._assert_node_values(
            root,
            'cac:AdditionalDocumentReference[descendant::*[local-name() = "DocumentType"]]/cbc:ID',
            invoice.l10n_my_edi_custom_form_reference,
        )
        # SST and TTX numbers (tax registrations). SST can be used in both cases, TTX only for supplier.
        # supplier
        self._assert_node_values(
            root,
            'cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID="SST"]',
            self.company_data['company'].sst_registration_number,
        )
        self._assert_node_values(
            root,
            'cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID="TTX"]',
            self.company_data['company'].ttx_registration_number,
        )
        # customer
        self._assert_node_values(
            root,
            'cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID="SST"]',
            self.partner_a.sst_registration_number,
        )

    def test_04_credit_note(self):
        """
        Ensure that the type is correctly set for another move type, as well as that the original
        uuid is present in an adjustment invoice.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100], currency=self.currency_data['currency']
        )
        invoice.l10n_my_edi_external_uuid = '12345678912345678912345678'
        invoice.action_post()

        action = invoice.action_reverse()
        reversal_wizard = self.env[action['res_model']].with_context(
            active_ids=invoice.ids,
            active_model='account.move',
            default_journal_id=invoice.journal_id.id,
        ).create({})
        action = reversal_wizard.reverse_moves()
        credit_note = self.env['account.move'].browse(action['res_id'])
        credit_note.action_post()

        file, _errors = credit_note._l10n_my_edi_generate_invoice_xml()
        root = etree.fromstring(file)
        # Check the invoice type to endure that it is marked as credit note.
        self._assert_node_values(
            root,
            'cbc:InvoiceTypeCode',
            '02',
            attributes={'listVersionID': '1.1'},
        )
        # Ensure that the UUID of the origin invoice is present
        self._assert_node_values(
            root,
            'cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID',
            invoice.name,
        )
        self._assert_node_values(
            root,
            'cac:BillingReference/cac:InvoiceDocumentReference/cbc:UUID',
            invoice.l10n_my_edi_external_uuid,
        )

    def test_05_invoice_with_so(self):
        """
        Ensure that an invoice linked to an SO will not contain this information in the xml.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100], currency=self.currency_data['currency']
        )
        invoice.l10n_my_edi_external_uuid = '12345678912345678912345678'
        invoice.action_post()

        vals = self.env['account.edi.xml.ubl_myinvois_my']._export_invoice_vals(invoice.with_context(lang=invoice.partner_id.lang))
        # As we don't rely on the sale module, we'll provide the sale_order_id manually in the vals.
        vals['vals']['sales_order_id'] = 'TEST/123'
        xml_content = self.env['ir.qweb']._render(vals['main_template'], vals)
        file = etree.tostring(cleanup_xml_node(xml_content), xml_declaration=True, encoding='UTF-8')
        root = etree.fromstring(file)
        # Check the invoice type to endure that it is marked as credit note.
        node = root.xpath('cac:OrderReference', namespaces=NS_MAP)
        self.assertEqual(node, [])

    def test_06_foreigner(self):
        """
        Check that the file is correct with a foreign customer.
        """
        invoice = self.init_invoice(
            'out_invoice', amounts=[100], partner=self.partner_b
        )
        invoice.action_post()

        file, errors = invoice._l10n_my_edi_generate_invoice_xml()
        self.assertEqual(errors, set())
        self.assertTrue(file)
        # The file is working! Now we assert that the foreign customer information is in there.
        root = etree.fromstring(file)
        customer_root = root.xpath('cac:AccountingCustomerParty/cac:Party', namespaces=NS_MAP)[0]

        # Party Identifications - TIN and BRN should be set.
        self._assert_node_values(
            customer_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="TIN"]',
            self.partner_b.vat,
        )
        self._assert_node_values(
            customer_root,
            'cac:PartyIdentification/cbc:ID[@schemeID="BRN"]',
            self.partner_b.l10n_my_identification_number,
        )

    def test_07_self_billing(self):
        bill = self.init_invoice(
            'in_invoice', amounts=[100], partner=self.partner_b
        )
        bill.action_post()

        file, errors = bill._l10n_my_edi_generate_invoice_xml()
        self.assertEqual(errors, set())
        self.assertTrue(file)

        root = etree.fromstring(file)
        # We assert that the supplier is the partner of the invoice, with all information present.
        supplier_root = root.xpath('cac:AccountingSupplierParty/cac:Party', namespaces=NS_MAP)[0]
        data_to_check = [
            ('cac:PartyIdentification/cbc:ID[@schemeID="TIN"]', self.partner_b.vat),
            ('cac:PartyIdentification/cbc:ID[@schemeID="BRN"]', self.partner_b.l10n_my_identification_number),
            ('cbc:IndustryClassificationCode', '00000'),
            ('cac:PartyName/cbc:Name', self.partner_b.name),
        ]
        for path, value in data_to_check:
            self._assert_node_values(supplier_root, path, value)
        # And that the customer is the company.
        customer_root = root.xpath('cac:AccountingCustomerParty/cac:Party', namespaces=NS_MAP)[0]
        data_to_check = [
            ('cac:PartyIdentification/cbc:ID[@schemeID="TIN"]', self.company_data['company'].vat),
            ('cac:PartyIdentification/cbc:ID[@schemeID="BRN"]', self.company_data['company'].l10n_my_identification_number),
            ('cac:PartyName/cbc:Name', self.company_data['company'].name),
        ]
        for path, value in data_to_check:
            self._assert_node_values(customer_root, path, value)

    def _assert_node_values(self, root, node_path, text, attributes=None):
        node = root.xpath(node_path, namespaces=NS_MAP)

        assert node, 'The requested node has not been found.'

        self.assertEqual(
            node[0].text,
            text,
        )
        if attributes:
            for attribute, value in attributes.items():
                self.assertEqual(
                    node[0].attrib[attribute],
                    value,
                )
