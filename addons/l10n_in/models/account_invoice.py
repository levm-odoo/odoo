# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import logging
import re

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, RedirectWarning, UserError
from odoo.tools.image import image_data_uri


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_in_gst_treatment = fields.Selection([
            ('regular', 'Registered Business - Regular'),
            ('composition', 'Registered Business - Composition'),
            ('unregistered', 'Unregistered Business'),
            ('consumer', 'Consumer'),
            ('overseas', 'Overseas'),
            ('special_economic_zone', 'Special Economic Zone'),
            ('deemed_export', 'Deemed Export'),
            ('uin_holders', 'UIN Holders'),
        ], string="GST Treatment", compute="_compute_l10n_in_gst_treatment", store=True, readonly=False, copy=True)
    l10n_in_state_id = fields.Many2one('res.country.state', string="Place of supply", compute="_compute_l10n_in_state_id", store=True, readonly=False)
    l10n_in_gstin = fields.Char(string="GSTIN")
    # For Export invoice this data is need in GSTR report
    l10n_in_shipping_bill_number = fields.Char('Shipping bill number')
    l10n_in_shipping_bill_date = fields.Date('Shipping bill date')
    l10n_in_shipping_port_code_id = fields.Many2one('l10n_in.port.code', 'Port code')
    l10n_in_reseller_partner_id = fields.Many2one('res.partner', 'Reseller', domain=[('vat', '!=', False)], help="Only Registered Reseller")
    l10n_in_journal_type = fields.Selection(string="Journal Type", related='journal_id.type')

    @api.depends('partner_id')
    def _compute_l10n_in_gst_treatment(self):
        indian_invoice = self.filtered(lambda m: m.country_code == 'IN')
        for record in indian_invoice:
            gst_treatment = record.partner_id.l10n_in_gst_treatment
            if not gst_treatment:
                gst_treatment = 'unregistered'
                if record.partner_id.country_id.code == 'IN' and record.partner_id.vat:
                    gst_treatment = 'regular'
                elif record.partner_id.country_id and record.partner_id.country_id.code != 'IN':
                    gst_treatment = 'overseas'
            record.l10n_in_gst_treatment = gst_treatment
        (self - indian_invoice).l10n_in_gst_treatment = False

    @api.depends('partner_id', 'company_id')
    def _compute_l10n_in_state_id(self):
        for move in self:
            if move.country_code == 'IN' and move.journal_id.type == 'sale':
                country_code = move.partner_id.country_id.code
                if country_code == 'IN':
                    move.l10n_in_state_id = move.partner_id.state_id
                elif country_code:
                    move.l10n_in_state_id = self.env.ref('l10n_in.state_in_oc', raise_if_not_found=False)
                else:
                    move.l10n_in_state_id = move.company_id.state_id
            elif move.country_code == 'IN' and move.journal_id.type == 'purchase':
                move.l10n_in_state_id = move.company_id.state_id
            else:
                move.l10n_in_state_id = False

    @api.onchange('name')
    def _onchange_name_warning(self):
        if self.country_code == 'IN' and self.journal_id.type == 'sale' and (len(self.name) > 16 or not re.match(r'^[a-zA-Z0-9-\/]+$', self.name)):
            return {'warning': {
                'title' : _("Invalid sequence as per GST rule 46(b)"),
                'message': _(
                    "The invoice number should not exceed 16 characters\n"
                    "and must only contain '-' (hyphen) and '/' (slash) as special characters"
                )
            }}
        return super()._onchange_name_warning()

    def _post(self, soft=True):
        """Use journal type to define document type because not miss state in any entry including POS entry"""
        posted = super()._post(soft)
        gst_treatment_name_mapping = {k: v for k, v in
                             self._fields['l10n_in_gst_treatment']._description_selection(self.env)}
        for move in posted.filtered(lambda m: m.country_code == 'IN'):
            if move.l10n_in_state_id and not move.l10n_in_state_id.l10n_in_tin:
                raise UserError(_("Please set a valid TIN Number on the Place of Supply %s", move.l10n_in_state_id.name))
            if not move.company_id.state_id:
                msg = _("Your company %s needs to have a correct address in order to validate this invoice.\n"
                "Set the address of your company (Don't forget the State field)", move.company_id.name)
                action = {
                    "view_mode": "form",
                    "res_model": "res.company",
                    "type": "ir.actions.act_window",
                    "res_id" : move.company_id.id,
                    "views": [[self.env.ref("base.view_company_form").id, "form"]],
                }
                raise RedirectWarning(msg, action, _('Go to Company configuration'))
            move.l10n_in_gstin = move.partner_id.vat
            if not move.l10n_in_gstin and move.l10n_in_gst_treatment in ['regular', 'composition', 'special_economic_zone', 'deemed_export']:
                raise ValidationError(_(
                    "Partner %(partner_name)s (%(partner_id)s) GSTIN is required under GST Treatment %(name)s",
                    partner_name=move.partner_id.name,
                    partner_id=move.partner_id.id,
                    name=gst_treatment_name_mapping.get(move.l10n_in_gst_treatment)
                ))
        return posted

    def _l10n_in_get_warehouse_address(self):
        """Return address where goods are delivered/received for Invoice/Bill"""
        # TO OVERRIDE
        self.ensure_one()
        return False

    def _generate_qr_code(self, silent_errors=False):
        self.ensure_one()
        if self.company_id.country_code == 'IN':
            payment_url = 'upi://pay?pa=%s&pn=%s&am=%s&tr=%s&tn=%s' % (
                self.company_id.l10n_in_upi_id,
                self.company_id.name,
                self.amount_residual,
                self.payment_reference or self.name,
                ("Payment for %s" % self.name))
            barcode = self.env['ir.actions.report'].barcode(barcode_type="QR", value=payment_url, width=120, height=120)
            return image_data_uri(base64.b64encode(barcode))
        return super()._generate_qr_code(silent_errors)

    def _l10n_in_get_hsn_summary(self):
        self.ensure_one()
        hsn_tax_details = {}
        display_uom = self.env.user.user_has_groups('uom.group_uom')
        sign = self.is_inbound() and -1 or 1
        for line in self.invoice_line_ids.filtered(lambda l: l.l10n_in_hsn_code):
            gst_rate = line.l10n_in_gst_rate
            hsn_code = line.product_id.l10n_in_hsn_code
            # group by hsn, tax rate and uom
            group_key = display_uom and "%s-%s-%s" % (hsn_code, gst_rate, line.product_uom_id) or "%s-%s" % (hsn_code, gst_rate)
            hsn_tax_details.setdefault(group_key, {
                'l10n_in_hsn_code': hsn_code,
                'gst_tax_rate': gst_rate,
                'quantity': 0.00,
                'uom': display_uom and line.product_uom_id.name,
                'base_amount_currency': 0.00,
                'SGST_amount_currency': 0.00,
                'CGST_amount_currency': 0.00,
                'IGST_amount_currency': 0.00,
                'CESS_amount_currency': 0.00,
            })
            hsn_tax_details[group_key]['SGST_amount_currency'] += line.l10n_in_sgst_amount_currency
            hsn_tax_details[group_key]['CGST_amount_currency'] += line.l10n_in_cgst_amount_currency
            hsn_tax_details[group_key]['IGST_amount_currency'] += line.l10n_in_igst_amount_currency
            hsn_tax_details[group_key]['CESS_amount_currency'] += line.l10n_in_cess_amount_currency
            hsn_tax_details[group_key]['quantity'] += line.quantity
            hsn_tax_details[group_key]['base_amount_currency'] += sign * line.balance

        display_gst = any(tax_detail['SGST_amount_currency'] > 0 for tax_detail in hsn_tax_details.values())
        display_igst = any(tax_detail['IGST_amount_currency'] > 0 for tax_detail in hsn_tax_details.values())
        display_cess = any(tax_detail['CESS_amount_currency'] > 0 for tax_detail in hsn_tax_details.values())
        nb_columns = 4
        if display_gst:
            nb_columns += 2
        if display_igst:
            nb_columns += 1
        if display_cess:
            nb_columns += 1
        column_details = {
            'nb_columns': nb_columns,
            'display_gst': display_gst,
            'display_igst': display_igst,
            'display_cess': display_cess,
        }
        return {
            'column_details': column_details,
            'hsn_tax_details': hsn_tax_details
        }
