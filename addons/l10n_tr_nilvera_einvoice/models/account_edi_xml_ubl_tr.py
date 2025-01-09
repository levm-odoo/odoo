from odoo import models
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import UOM_TO_UNECE_CODE

UOM_TO_UNSPSC_CODE = {
    **UOM_TO_UNECE_CODE,
    'l10n_tr_nilvera_einvoice.product_uom_box': 'PK',
    'l10n_tr_nilvera_einvoice.product_uom_khy': 'KHY',
    'l10n_tr_nilvera_einvoice.product_uom_pf': 'PF',
    'l10n_tr_nilvera_einvoice.product_uom_cr': 'CR',
    'l10n_tr_nilvera_einvoice.product_uom_ncl': 'NCL',
    'l10n_tr_nilvera_einvoice.product_uom_ctm': 'CTM',
    'uom.uom_square_meter': 'MTK',
    'l10n_tr_nilvera_einvoice.uom_square_decimeter': 'DMK',
    'l10n_tr_nilvera_einvoice.product_uom_standard_cubic_meter': 'SM3',
    'uom.product_uom_millimeter': 'MMT',
    'l10n_tr_nilvera_einvoice.product_uom_sa': 'SA',
    'l10n_tr_nilvera_einvoice.product_uom_cmq': 'CMQ',
    'l10n_tr_nilvera_einvoice.product_uom_mlt': 'MLT',
    'l10n_tr_nilvera_einvoice.product_uom_kjo': 'KJO',
    'l10n_tr_nilvera_einvoice.product_uom_mmq': 'MMQ',
    'l10n_tr_nilvera_einvoice.product_uom_cen': 'CEN',
    'l10n_tr_nilvera_einvoice.product_uom_cmk': 'CMK',
    'l10n_tr_nilvera_einvoice.product_uom_kpo': 'KPO',
    'l10n_tr_nilvera_einvoice.product_uom_b32': 'B32',
    'l10n_tr_nilvera_einvoice.product_uom_bg': 'BG',
    'l10n_tr_nilvera_einvoice.product_uom_cct': 'CCT',
    'l10n_tr_nilvera_einvoice.product_uom_bx': 'BX',
    'l10n_tr_nilvera_einvoice.product_uom_pr': 'PR',
    'l10n_tr_nilvera_einvoice.product_uom_d40': 'D40',
    'l10n_tr_nilvera_einvoice.product_uom_d30': 'D30',
    'l10n_tr_nilvera_einvoice.product_uom_gfi': 'GFI',
    'uom.product_uom_day': 'DAY',
    'l10n_tr_nilvera_einvoice.product_uom_mgm': 'MGM',
    'l10n_tr_nilvera_einvoice.product_uom_mon': 'MON',
    'l10n_tr_nilvera_einvoice.product_uom_gt': 'GT',
    'l10n_tr_nilvera_einvoice.product_uom_ann': 'ANN',
    'l10n_tr_nilvera_einvoice.product_uom_nt': 'NT',
    'l10n_tr_nilvera_einvoice.product_uom_hur': 'HUR',
    'l10n_tr_nilvera_einvoice.product_uom_mnd': 'MND',
    'l10n_tr_nilvera_einvoice.product_uom_d61': 'D61',
    'l10n_tr_nilvera_einvoice.product_uom_3i': '3I',
    'l10n_tr_nilvera_einvoice.product_uom_d62': 'D62',
    'l10n_tr_nilvera_einvoice.product_uom_kfo': 'KFO',
    'l10n_tr_nilvera_einvoice.product_uom_pa': 'PA',
    'l10n_tr_nilvera_einvoice.product_uom_kma': 'KMA',
    'l10n_tr_nilvera_einvoice.product_uom_kni': 'KNI',
    'l10n_tr_nilvera_einvoice.product_uom_ksd': 'KSD',
    'l10n_tr_nilvera_einvoice.product_uom_kph': 'KPH',
    'l10n_tr_nilvera_einvoice.product_uom_ksh': 'KSH',
    'l10n_tr_nilvera_einvoice.product_uom_kur': 'KUR',
    'l10n_tr_nilvera_einvoice.product_uom_d32': 'D32',
    'l10n_tr_nilvera_einvoice.product_uom_gwh': 'GWH',
    'l10n_tr_nilvera_einvoice.product_uom_mwh': 'MWH',
    'l10n_tr_nilvera_einvoice.product_uom_kwh': 'KWH',
    'l10n_tr_nilvera_einvoice.product_uom_kwt': 'KWT',
    'l10n_tr_nilvera_einvoice.product_uom_lpa': 'LPA',
    'l10n_tr_nilvera_einvoice.product_uom_r9': 'R9',
    'l10n_tr_nilvera_einvoice.product_uom_set': 'SET',
    'l10n_tr_nilvera_einvoice.product_uom_T3': 'T3',
}


class AccountEdiXmlUblTr(models.AbstractModel):
    _name = "account.edi.xml.ubl.tr"
    _inherit = 'account.edi.xml.ubl_21'
    _description = "UBL-TR 1.2"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        # EXTENDS account_edi_ubl_cii
        return '%s_einvoice.xml' % invoice.name.replace("/", "_")

    def _export_invoice_vals(self, invoice):
        def _get_formatted_id(invoice):
            # For now, we assume that the sequence is going to be in the format {prefix}/{year}/{invoice_number}.
            # To send an invoice to Nlvera, the format needs to follow ABC2009123456789.
            parts = invoice.name.split('/')
            prefix, year, number = parts[0], parts[1], parts[2].zfill(9)
            return f"{prefix}{year}{number}"

        # EXTENDS account.edi.xml.ubl_21
        vals = super()._export_invoice_vals(invoice)

        # Check the customer status if it hasn't been done before as it's needed for profile_id
        if invoice.partner_id.l10n_tr_nilvera_customer_status == 'not_checked':
            invoice.partner_id.check_nilvera_customer()

        vals['vals'].update({
            'id': _get_formatted_id(invoice),
            'customization_id': 'TR1.2',
            'profile_id': 'TEMELFATURA' if invoice.partner_id.l10n_tr_nilvera_customer_status == 'einvoice' else 'EARSIVFATURA',
            'copy_indicator': 'false',
            'uuid': invoice.l10n_tr_nilvera_uuid,
            'document_type_code': 'SATIS' if invoice.move_type == 'out_invoice' else 'IADE',
            'due_date': False,
            'line_count_numeric': len(invoice.line_ids),
            'order_issue_date': invoice.invoice_date,
        })
        return vals

    def _get_partner_party_identification_vals_list(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_partner_party_identification_vals_list(partner)
        vals.append({
            'id_attrs': {
                'schemeID': 'VKN' if partner.is_company else 'TCKN',
            },
            'id': partner.vat,
        })
        return vals

    def _get_partner_address_vals(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals = super()._get_partner_address_vals(partner)
        vals.update({
            'city_subdivision_name ': partner.state_id.name,
            'country_subentity': False,
            'country_subentity_code': False,
        })
        return vals

    def _get_partner_party_tax_scheme_vals_list(self, partner, role):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_partner_party_tax_scheme_vals_list(partner, role)
        for vals in vals_list:
            vals.pop('registration_address_vals', None)
        return vals_list

    def _get_partner_party_legal_entity_vals_list(self, partner):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_partner_party_legal_entity_vals_list(partner)
        for vals in vals_list:
            vals.pop('registration_address_vals', None)
        return vals_list

    def _get_delivery_vals_list(self, invoice):
        # EXTENDS account.edi.xml.ubl_21
        delivery_vals = super()._get_delivery_vals_list(invoice)
        if 'picking_ids' in invoice._fields and invoice.picking_ids:
            delivery_vals[0]['delivery_id'] = invoice.picking_ids[0].name
            return delivery_vals
        return []

    def _get_invoice_payment_means_vals_list(self, invoice):
        # EXTENDS account.edi.xml.ubl_21
        vals_list = super()._get_invoice_payment_means_vals_list(invoice)
        for vals in vals_list:
            vals.pop('instruction_id', None)
            vals.pop('payment_id_vals', None)
        return vals_list

    def _get_tax_category_list(self, invoice, taxes):
        # OVERRIDES account.edi.common
        res = []
        for tax in taxes:
            is_withholding = invoice.currency_id.compare_amounts(tax.amount, 0) == -1
            tax_type_code = '9015' if is_withholding else '0015'
            tax_scheme_name = 'KDV Tevkifatı' if is_withholding else 'Gerçek Usulde KDV'
            res.append({
                'id': tax_type_code,
                'percent': tax.amount if tax.amount_type == 'percent' else False,
                'tax_scheme_vals': {'name': tax_scheme_name, 'tax_type_code': tax_type_code},
            })
        return res

    def _get_invoice_tax_totals_vals_list(self, invoice, taxes_vals):
        # EXTENDS account.edi.xml.ubl_21
        tax_totals_vals = super()._get_invoice_tax_totals_vals_list(invoice, taxes_vals)

        for vals in tax_totals_vals:
            for subtotal_vals in vals.get('tax_subtotal_vals', []):
                subtotal_vals.get('tax_category_vals', {})['id'] = False
                subtotal_vals.get('tax_category_vals', {})['percent'] = False

        return tax_totals_vals

    def _get_invoice_monetary_total_vals(self, invoice, taxes_vals, line_extension_amount, allowance_total_amount, charge_total_amount):
        # EXTENDS account.edi.xml.ubl_20
        vals = super()._get_invoice_monetary_total_vals(invoice, taxes_vals, line_extension_amount, allowance_total_amount, charge_total_amount)
        # allowance_total_amount needs to have a value even if 0.0 otherwise it's blank in the Nilvera PDF.
        vals['allowance_total_amount'] = allowance_total_amount
        if invoice.currency_id.is_zero(vals.get('prepaid_amount', 1)):
            del vals['prepaid_amount']
        return vals

    def _get_invoice_line_item_vals(self, line, taxes_vals):
        # EXTENDS account.edi.xml.ubl_21
        line_item_vals = super()._get_invoice_line_item_vals(line, taxes_vals)
        line_item_vals['classified_tax_category_vals'] = False
        return line_item_vals

    def _get_additional_document_reference_list(self, invoice):
        # EXTENDS account.edi.xml.ubl_20
        additional_document_reference_list = super()._get_additional_document_reference_list(invoice)
        if invoice.partner_id.l10n_tr_nilvera_customer_status == 'earchive':
            additional_document_reference_list.append({
                'id': "ELEKTRONIK",
                'issue_date': invoice.invoice_date,
                'document_type_code': "SEND_TYPE",
            })
        return additional_document_reference_list

    def _get_invoice_line_price_vals(self, line):
        # EXTEND 'account.edi.common'
        invoice_line_price_vals = super()._get_invoice_line_price_vals(line)
        invoice_line_price_vals['base_quantity_attrs'] = {'unit_code': self._get_uom_unspsc_code(line)}

        return invoice_line_price_vals

    def _get_uom_unspsc_code(self, line):
        """ This depends on the mapping from https://developer.nilvera.com/en/code-lists#birim-kodlari """
        xmlid = line.product_uom_id.get_external_id()
        if xmlid and line.product_uom_id.id in xmlid:
            return UOM_TO_UNSPSC_CODE.get(xmlid[line.product_uom_id.id], 'C62')
        return 'C62'


    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_retrieve_partner_vals(self, tree, role):
        # EXTENDS account.edi.xml.ubl_20
        partner_vals = super()._import_retrieve_partner_vals(tree, role)
        partner_vals.update({
            'vat': self._find_value(f'.//cac:Accounting{role}Party/cac:Party//cac:PartyIdentification//cbc:ID[string-length(text()) > 5]', tree),
        })
        return partner_vals

    def _import_fill_invoice_form(self, invoice, tree, qty_factor):
        # EXTENDS account.edi.xml.ubl_20
        logs = super()._import_fill_invoice_form(invoice, tree, qty_factor)

        # ==== Nilvera UUID ====
        if uuid_node := tree.findtext('./{*}UUID'):
            invoice.l10n_tr_nilvera_uuid = uuid_node

        return logs
