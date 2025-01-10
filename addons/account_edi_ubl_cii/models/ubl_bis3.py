from lxml import etree
from odoo import models
from odoo.tools import html2plaintext, cleanup_xml_node


class UblBis3(models.AbstractModel):
    """ Peppol BIS Billing 3.0
    Business objects: Invoice + Credit Note
    Documentation: https://docs.peppol.eu/poacc/billing/3.0/
    """
    _name = 'ubl.bis3'
    _inherit = ['ubl.common']
    _description = "Peppol BIS Billing 3.0"

    # Properties
    def _get_applicable_countries(self):
        return []

    def _get_default_countries(self):
        return []

    def _is_on_peppol(self):
        return True

    # Export
    def _get_postal_address(self, partner):
        return {
            'street_name': partner.street,
            'additional_street_name': partner.street2,
            'city_name': partner.city,
            'postal_zone': partner.zip,
            'country_subentity': partner.state_id.name,
            'address_line_list': [{'line': None}],
            'country': {
                'identification_code': partner.country_id.code,
            },
        }

    def _get_contact(self, partner):
        return {
            'name': partner.name,
            'telephone': partner.phone or partner.mobile,
            'electronic_mail': partner.email,
        }

    def _get_party(self, partner, role=None):
        vals = {
            'endpoint_id': 'peppol_endpoint' in partner._fields and partner.peppol_endpoint,
            'endpoint_id_attrs': {'schemeID': 'peppol_eas' in partner._fields and partner.peppol_eas},
            'party_identification_list': [{
                'id': partner.peppol_endpoint if partner._fields and partner.peppol_endpoint and partner.country_code == 'NL' else None,
            }],
            'party_name_list': [{'name': partner.display_name}],
            'postal_address': self._get_postal_address(partner),
        }
        party_tax_scheme = {
            'company_id': partner.vat,
            # [BR-CO-09] if the PartyTaxScheme/TaxScheme/ID == 'VAT', CompanyID must start with a country code prefix.
            # In some countries however, the CompanyID can be with or without country code prefix and still be perfectly
            # valid (RO, HU, non-EU countries).
            # We have to handle their cases by changing the TaxScheme/ID to 'something other than VAT',
            # preventing the trigger of the rule.
            'tax_scheme': {'id': "VAT"},
        }
        if not partner.vat:
            party_tax_scheme = {
                'company_id': partner.peppol_endpoint,
                'tax_scheme_vals': {'id': partner.peppol_eas},
            }
        elif partner.country_id.code == 'NO' and role == 'supplier':
            #  [NO-R-002 warning] https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/#_applying_foretaksregisteret
            #  https://docs.peppol.eu/poacc/billing/3.0/bis/#national_rules
            party_tax_scheme = {
                'company_id': "Foretaksregisteret",
                'tax_scheme_vals': {'id': "TAX"},
            }
        vals.update({
            'party_tax_scheme_list': [party_tax_scheme],
        })
        party_legal_entity_company_vals = {
            'company_id': partner.vat,
        }
        if partner.country_code == 'NL':
            party_legal_entity_company_vals = {
                'company_id': partner.peppol_endpoint,
                'company_id_attrs': {'schemeID': partner.peppol_eas},
            }
        if partner.country_code == 'LU':
            if 'l10n_lu_peppol_identifier' in partner._fields and partner.l10n_lu_peppol_identifier:
                party_legal_entity_company_vals['company_id'] = partner.l10n_lu_peppol_identifier
            elif partner.company_registry:
                party_legal_entity_company_vals['company_id'] = partner.company_registry
        if partner.country_code == 'DK':
            # DK-R-014: For Danish Suppliers it is mandatory to specify schemeID as "0184" (DK CVR-number) when
            # PartyLegalEntity/CompanyID is used for AccountingSupplierParty
            party_legal_entity_company_vals['company_id_attrs'] = {'schemeID': '0184'}
        if partner.country_code == 'SE' and partner.company_registry:
            party_legal_entity_company_vals['company_id'] = ''.join(char for char in partner.company_registry if char.isdigit())
        if not party_legal_entity_company_vals['company_id']:
            party_legal_entity_company_vals['company_id'] = partner.peppol_endpoint
        vals.update({
            'party_legal_entity_list': [{
                'registration_name': partner.name,
                **party_legal_entity_company_vals,
            }],
        })
        vals.update({
            'contact': self._get_contact(partner),
        })
        return vals

    def _add_invoice_period(self, template_vals, **kwargs):
        """ Fills ubl_21_InvoicePeriod. """
        invoice = kwargs['invoice']
        template_vals.update({
            'invoice_period_list': [self._get_invoice_period(invoice)],  # you can only have one in BIS3
        })

    def _add_order_reference(self, template_vals, **kwargs):
        invoice = kwargs['invoice']
        sale_order_id = 'sale_line_ids' in invoice.invoice_line_ids._fields and ",".join(invoice.invoice_line_ids.sale_line_ids.order_id.mapped('name'))
        template_vals.update({
            'order_reference': {
                'id': invoice.ref or invoice.name,
                'sales_order_id': sale_order_id,
            }
        })

    def _add_billing_reference(self, template_vals, **kwargs):
        invoice = kwargs['invoice']
        billing_references = []
        if invoice.move_type == 'in_refund' and invoice.company_id.partner_id.commercial_partner_id.country_id.code == 'NL':
            billing_references.append({
                'invoice_document_reference': {
                    'id': invoice.ref,
                    'issue_date': None,
                },
            })
        template_vals.update({
            'billing_reference_list': billing_references,
        })

    def _add_accounting_supplier_party(self, template_vals, **kwargs):
        partner = kwargs['partner']
        template_vals.update({
            'party': self._get_party(partner, role='supplier'),
        })

    def _export_invoice_vals(self, invoice):
        supplier = invoice.company_id.partner_id.commercial_partner_id
        customer = invoice.partner_id
        template_vals = self._get_ubl_invoice_vals(invoice)
        # 1. Add all Common Basic Components
        template_vals.update({
            "customization_id": "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
            "profile_id": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
            "invoice_type_code": "380",
            "buyer_reference": invoice.commercial_partner_id.ref,
        })
        # 2. Add all Common Aggregate Components
        self._add_invoice_period(template_vals, invoice=invoice)
        self._add_order_reference(template_vals, invoice=invoice)
        self._add_billing_reference(template_vals, invoice=invoice)
        self._add_accounting_supplier_party(template_vals, partner=supplier)
        # Stopped here
            "accounting_supplier_party": {},
            "accounting_customer_party": {},
            "payee_party": {},
            "buyer_customer_party": {},
            "seller_supplier_party": {},
            "tax_representative_party": {},
            "delivery_list": [],
            "delivery_terms": {},
            "payment_means_list": [],
            "payment_terms_list": [],
            "prepaid_payment_list": [],
            "allowance_charge_list": [],
            "tax_exchange_rate": {},
            "pricing_exchange_rate": {},
            "payment_exchange_rate": {},
            "payment_alternative_exchange_rate": {},
            "tax_total_list": [],
            "withholding_tax_total_list": [],
            "legal_monetary_total": {},
            "invoice_line_list": []
        })
        return vals

    def _export_invoice(self, invoice):
        """ Generates BIS3 xml for a given invoice.
        :param convert_fixed_taxes: whether the fixed taxes are converted into AllowanceCharges on the InvoiceLines
        """
        vals = self._export_invoice_vals(invoice.with_context(lang=invoice.partner_id.lang))
        errors = [constraint for constraint in self._export_invoice_constraints(invoice, vals).values() if constraint]
        xml_content = self.env['ir.qweb']._render(vals['main_template'], vals)
        return etree.tostring(cleanup_xml_node(xml_content), xml_declaration=True, encoding='UTF-8'), set(errors)
