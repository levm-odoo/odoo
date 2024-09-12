# -*- coding: utf-8 -*-

from odoo import api, models, _
from odoo.exceptions import ValidationError


class AccountFiscalPosition(models.Model):
    _inherit = 'account.fiscal.position'

    @api.model_create_multi
    def create(self, vals_list):
        new_vals = []
        for vals in vals_list:
            new_vals.append(self.adjust_vals_country_id(vals))
        return super().create(new_vals)

    def write(self, vals):
        vals = self.adjust_vals_country_id(vals)
        return super().write(vals)

    def adjust_vals_country_id(self, vals):
        foreign_vat = vals.get('foreign_vat')
        country_group_id = vals.get('country_group_id')
        if foreign_vat and country_group_id and not (self.country_id or vals.get('country_id')):
            vals['country_id'] = self.env['res.country.group'].browse(country_group_id).country_ids.filtered(lambda c: c.code == foreign_vat[:2].upper()).id or False
        return vals

    @api.constrains('country_id', 'foreign_vat')
    def _validate_foreign_vat(self):
        for record in self:
            if not record.foreign_vat:
                continue

            if record.country_group_id:
                # Checks the foreign vat is a VAT Number linked to a country of the country group
                foreign_vat_country = self.country_group_id.country_ids.filtered(lambda c: c.code == record.foreign_vat[:2].upper())
                if not foreign_vat_country:
                    raise ValidationError(_("The country detected for this foreign VAT number does not match any of the countries composing the country group set on this fiscal position."))
                if record._get_fiscal_country():
                    checked_country_code = self.env['res.partner']._run_vat_test(record.foreign_vat, record._get_fiscal_country()) or self.env['res.partner']._run_vat_test(record.foreign_vat, foreign_vat_country)
                    if not checked_country_code:
                        record.raise_vat_error_message(foreign_vat_country)
                else:
                    checked_country_code = self.env['res.partner']._run_vat_test(record.foreign_vat, foreign_vat_country)
                    if not checked_country_code:
                        record.raise_vat_error_message(record._get_fiscal_country())
            elif record._get_fiscal_country():
                foreign_vat_country = self.env['res.country'].search([('code', '=', record.foreign_vat[:2].upper())], limit=1)
                checked_country_code = self.env['res.partner']._run_vat_test(record.foreign_vat, foreign_vat_country or record._get_fiscal_country())
                if not checked_country_code:
                    record.raise_vat_error_message()

            if record.foreign_vat and not record._get_fiscal_country() and not record.country_group_id:
                raise ValidationError(_("The country of the foreign VAT number could not be detected. Please assign a country to the fiscal position or set a country group"))

    def raise_vat_error_message(self, country=False):
        fp_label = _("fiscal position [%s]", self.name)
        country_code = country.code.lower() if country else self._get_fiscal_country().code.lower()
        error_message = self.env['res.partner']._build_vat_error_message(country_code, self.foreign_vat, fp_label)
        raise ValidationError(error_message)
