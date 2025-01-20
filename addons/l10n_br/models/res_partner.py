# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models
from odoo.http import request


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_br_ie_code = fields.Char(string="IE", help="State Tax Identification Number. Should contain 9-14 digits.")
    l10n_br_im_code = fields.Char(string="IM", help="Municipal Tax Identification Number")
    l10n_br_isuf_code = fields.Char(string="SUFRAMA code", help="SUFRAMA registration number.")

    def _get_portal_mandatory_fields(self):
        """ Extend mandatory fields to add the vat in case the company and the customer are from brazil. """
        mandatory_fields = super()._get_portal_mandatory_fields()

        if request.params.get('country_id'):
            country = self.env['res.country'].browse(int(request.params['country_id']))
            if  self.env.company.country_code == 'BR' and country.code == 'BR' and 'vat' not in mandatory_fields:
                mandatory_fields += ['vat']
            # Needed because the user could put brazil and then change to another country, we don't
            # want the field to stay mandatory
            elif 'vat' in mandatory_fields and country.code != 'BR':
                mandatory_fields.remove('vat')

        return mandatory_fields

    def _get_portal_optional_fields(self):
        """Extend optional fields to add the identification type to avoid having the unknown field error"""
        optional_fields = super()._get_portal_optional_fields()
        if self.env.company.country_code == 'BR':
            optional_fields.extend({'street_number', 'street_name', 'city_id', 'street_number2'})
        return optional_fields

    def _is_latam_country(self):
        return super()._is_latam_country() or self.env.company.account_fiscal_country_id.code == 'BR'
