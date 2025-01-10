from odoo import _, api, fields, models
from odoo.exceptions import ValidationError, UserError


class L10nInPanEntity(models.Model):
    _inherit = 'l10n_in.pan.entity'

    l10n_in_tax_tcs_ids = fields.One2many(
        'l10n_in.pan.entity.section.tax', 'l10n_in_pan_entity_id',
        domain=[('section_type', '=', 'tcs')]
    )
    l10n_in_tax_tds_ids = fields.One2many(
        'l10n_in.pan.entity.section.tax', 'l10n_in_pan_entity_id',
        domain=[('section_type', '=', 'tds')]
    )


class L10nInPanEntitySectionTax(models.Model):
    _name = 'l10n_in.pan.entity.section.tax'
    _description = 'Pan Entity Section Tax'
    _order = 'valid_from desc'

    section_type = fields.Selection([
        ('tcs', 'TCS'),
        ('tds', 'TDS')
    ])
    valid_from = fields.Date(string="Valid From", required=True)
    valid_upto = fields.Date(string="Valid Upto", required=True)
    certificate_number = fields.Char(string="Certificate Number", required=True)
    tax_id = fields.Many2one('account.tax', required=True)
    l10n_in_pan_entity_id = fields.Many2one('l10n_in.pan.entity', ondelete='cascade')
    l10n_in_section_id = fields.Many2one(
        comodel_name='l10n_in.section.alert',
        string="Section",
        related='tax_id.l10n_in_section_id',
        store=True,
    )

    @api.constrains('valid_from', 'valid_upto', 'l10n_in_section_id')
    def _check_section_period(self):
        for record in self:
            if record.valid_upto and record.valid_upto <= record.valid_from:
                raise ValidationError(_("The start date cannot be greater than or equal to the end date."))
            overlapping_lines = self.search_count([
                ('id', '!=', record.id),
                ('section_type', '=', record.section_type),
                ('l10n_in_section_id', '=', record.l10n_in_section_id.id),
                ('l10n_in_pan_entity_id', '=', record.l10n_in_pan_entity_id.id),
                '|', '|',
                '&', ('valid_from', '>=', record.valid_from), ('valid_from', '<=', record.valid_upto),
                '&', ('valid_upto', '>=', record.valid_from), ('valid_upto', '<=', record.valid_upto),
                '&', ('valid_from', '<=', record.valid_from), ('valid_upto', '>=', record.valid_upto),
            ])
            if overlapping_lines:
                raise ValidationError(_("The date range overlaps with an existing section."))
