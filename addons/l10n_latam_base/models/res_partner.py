# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_latam_identification_type_id = fields.Many2one('l10n_latam.identification.type',
        string="Identification Type", index='btree_not_null', auto_join=True,
        default=lambda self: self.env.ref('l10n_latam_base.it_vat', raise_if_not_found=False),
        help="The type of identification")
    vat = fields.Char(string='Identification Number', help="Identification Number for selected type")

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + ['l10n_latam_identification_type_id']

    @api.constrains('vat', 'l10n_latam_identification_type_id')
    def check_vat(self):
        with_vat = self.filtered(lambda x: x.l10n_latam_identification_type_id.is_vat)
        return super(ResPartner, with_vat).check_vat()

    @api.onchange('country_id')
    def _onchange_country(self):
        country = self.country_id or self.company_id.account_fiscal_country_id or self.env.company.account_fiscal_country_id
        identification_type = self.l10n_latam_identification_type_id
        if not identification_type or (identification_type.country_id != country):
            self.l10n_latam_identification_type_id = self.env['l10n_latam.identification.type'].search(
                [('country_id', '=', country.id), ('is_vat', '=', True)], limit=1) or self.env.ref(
                    'l10n_latam_base.it_vat', raise_if_not_found=False)

    def _get_portal_optional_fields(self):
        # EXTEND 'portal'
        optional_fields = super()._get_portal_optional_fields()
        if self._is_latam_country():
            optional_fields.extend(
                ('l10n_latam_identification_type_id', 'vat')
            )

        return optional_fields

    def _display_b2b_fields(self):
        return (
            self._is_latam_country()
            or super()._display_b2b_fields()
        )

    @api.model
    def _is_latam_country(self):
        """ Hook to check if country is latam country or not. """
        return False
