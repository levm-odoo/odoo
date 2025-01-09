# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_latam_identification_type_id = fields.Many2one('l10n_latam.identification.type',
        string="Identification Type", index='btree_not_null', auto_join=True,
        default=lambda self: self.env.ref('l10n_latam_base.it_vat', raise_if_not_found=False),
        inverse="_inverse_vat",
        help="The type of identification")
    vat = fields.Char(string='Identification Number', help="Identification Number for selected type")

    @api.model
    def _commercial_fields(self):
        return super()._commercial_fields() + ['l10n_latam_identification_type_id']

    @api.onchange('l10n_latam_identification_id')
    def _onchange_vat(self):
        if self.l10n_latam_identification_type_id.is_vat:
            super()._onchange_vat()

    def _inverse_vat(self):
        vat_partners = self.filtered(lambda p: p.l10n_latam_identification_type.is_vat)
        super(ResPartner, vat_partners)._inverse_vat()

