from odoo import api, Command, fields, models, _
from odoo.exceptions import ValidationError


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    l10n_in_withhold_tax_amount = fields.Monetary(string="TDS Tax Amount", compute='_compute_withhold_tax_amount')
    l10n_in_tds_tcs_section_id = fields.Many2one(related="account_id.l10n_in_tds_tcs_section_id")

    @api.depends('tax_ids')
    def _compute_withhold_tax_amount(self):
        # Compute the withhold tax amount for the withholding lines
        withholding_lines = self.filtered('move_id.l10n_in_is_withholding')
        (self - withholding_lines).l10n_in_withhold_tax_amount = False
        for line in withholding_lines:
            line.l10n_in_withhold_tax_amount = line.currency_id.round(abs(line.price_total - line.price_subtotal))

    def button_l10n_in_apply_tcs_tax(self):
        # If lines are selected, then apply TCS tax on selected lines else apply on all lines shown on the tree view
        line_ids = self.env.context.get('active_ids') or self.env.context.get('tds_tcs_applicable_lines_ids')
        move_line_ids = self.env['account.move.line'].browse(line_ids)
        move_ids = move_line_ids.mapped('move_id')
        if len(move_ids) > 1:
            raise ValidationError(_("You can only apply TCS tax on one invoice at a time."))

        warning_sections = move_ids._get_l10n_in_tds_tcs_applicable_sections()
        if warning_sections:
            line_tax_data = {}
            error_sections = []
            group_by_section = move_ids._l10n_in_group_by_section_alert()
            pan_entity = move_ids.commercial_partner_id.l10n_in_pan_entity_id
            invoice_date = move_ids.invoice_date
            if not invoice_date:
                raise ValidationError(_("Invoice Date is required to apply TCS tax."))
            for section in warning_sections:
                if group_by_section.get(section):
                    tax_id = section._get_applicable_tax_for_section(pan_entity, invoice_date)
                    if tax_id:
                        for line in group_by_section[section]:
                            if line in move_line_ids:
                                updated_tax_ids = [tax_id.id]
                                for tax in line.tax_ids:
                                    if tax.l10n_in_section_id.id == section.id and tax != tax_id:
                                        continue
                                    elif tax.l10n_in_section_id and tax.l10n_in_section_id.id != section.id:
                                        continue
                                    else:
                                        updated_tax_ids.append(tax.id)
                                if set(line.tax_ids.ids) != set(updated_tax_ids):
                                    line_tax_data[line] = {'tax_ids': [Command.clear()] + [Command.set(updated_tax_ids)]}
                    else:
                        if any(line in move_line_ids for line in group_by_section[section]):
                            error_sections.append(section.id)
            if error_sections:
                raise ValidationError(_(
                    "The tax lines is not defined in the given section %(sections)s",
                    sections = ", ".join(self.env['l10n_in.section.alert'].browse(error_sections).mapped('name'))
                ))
            for line, updated_tax_ids in line_tax_data.items():
                line.write(updated_tax_ids)
