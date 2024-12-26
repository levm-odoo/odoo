# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from stdnum.in_ import pan, gstin
from datetime import timedelta, datetime, time
from pytz import timezone, UTC


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_in_upi_id = fields.Char(string="UPI Id")
    l10n_in_hsn_code_digit = fields.Selection(
        selection=[
            ("4", "4 Digits (turnover < 5 CR.)"),
            ("6", "6 Digits (turnover > 5 CR.)"),
            ("8", "8 Digits"),
        ],
        string="HSN Code Digit",
        compute="_compute_l10n_in_hsn_code_digit_and_l10n_in_pan",
        store=True,
        readonly=False,
    )
    l10n_in_edi_production_env = fields.Boolean(
        string="Indian Production Environment",
        help="Enable the use of production credentials",
        groups="base.group_system",
    )
    l10n_in_pan = fields.Char(
        string="PAN",
        compute="_compute_l10n_in_hsn_code_digit_and_l10n_in_pan",
        store=True,
        readonly=False,
        help="PAN enables the department to link all transactions of the person with the department.\n"
             "These transactions include taxpayments, TDS/TCS credits, returns of income/wealth/gift/FBT,"
             "specified transactions, correspondence, and so on.\n"
             "Thus, PAN acts as an identifier for the person with the tax department.",
    )
    l10n_in_pan_type = fields.Char(string="PAN Type", compute="_compute_l10n_in_pan_type")
    l10n_in_gst_state_warning = fields.Char(related="partner_id.l10n_in_gst_state_warning")
    l10n_in_is_lut = fields.Boolean(string="Letter of Undertaking", help="Enable this if you have a Letter of Undertaking (LUT) for export transactions.")
    l10n_in_lut_validation_date = fields.Date(string="LUT Validation Date", help="Date until which the LUT is valid.")

    @api.depends('vat')
    def _compute_l10n_in_hsn_code_digit_and_l10n_in_pan(self):
        for record in self:
            if record.country_code == "IN" and record.vat:
                record.l10n_in_hsn_code_digit = "4"
                record.l10n_in_pan = gstin.to_pan(record.vat) if gstin.is_valid(record.vat) else False
            else:
                record.l10n_in_hsn_code_digit = False
                record.l10n_in_pan = False

    @api.depends('l10n_in_pan')
    def _compute_l10n_in_pan_type(self):
        for record in self:
            if pan.is_valid(record.l10n_in_pan):
                record.l10n_in_pan_type = pan.info(record.l10n_in_pan)['holder_type']
            else:
                record.l10n_in_pan_type = False

    @api.onchange('vat')
    def onchange_vat(self):
        self.partner_id.onchange_vat()

    def _update_l10n_in_fiscal_position_based_on_lut(self):
        lut_sez_fiscal_position = self.env['account.chart.template'].with_company(self).ref('fiscal_position_in_lut_sez')
        export_sez_fiscal_position = self.env['account.chart.template'].with_company(self).ref('fiscal_position_in_export_sez_in')

        is_lut_valid = self.l10n_in_is_lut and self.l10n_in_lut_validation_date
        lut_sez_fiscal_position.with_company(self).write({'auto_apply': is_lut_valid})
        export_sez_fiscal_position.with_company(self).write({'auto_apply': not is_lut_valid})
        if not is_lut_valid:
            self.with_company(self).l10n_in_lut_validation_date = False
        if self.l10n_in_lut_validation_date:
            user_tz = timezone(self.env.user.tz)
            lut_validation_datetime = user_tz.localize(datetime.combine(self.l10n_in_lut_validation_date + timedelta(days=1), time.min))
            self.env.ref('l10n_in.ir_cron_update_lut_status')._trigger((lut_validation_datetime.astimezone(UTC)).replace(tzinfo=None))

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        # Update Fiscal Positions for new branch
        res._update_l10n_in_fiscal_position()
        return res

    def write(self, vals):
        res = super().write(vals)
        if (vals.get('state_id') or vals.get('country_id')) and not self.env.context.get('delay_account_group_sync'):
            # Update Fiscal Positions for companies setting up state for the first time
            self._update_l10n_in_fiscal_position()
        if 'l10n_in_is_lut' in vals or vals.get('l10n_in_lut_validation_date'):
            self._update_l10n_in_fiscal_position_based_on_lut()
        return res

    def _update_l10n_in_fiscal_position(self):
        companies_need_update_fp = self.filtered(lambda c: c.parent_ids[0].chart_template == 'in')
        for company in companies_need_update_fp:
            ChartTemplate = self.env['account.chart.template'].with_company(company)
            fiscal_position_data = ChartTemplate._get_in_account_fiscal_position()
            ChartTemplate._load_data({'account.fiscal.position': fiscal_position_data})

    @api.constrains('l10n_in_pan')
    def _check_l10n_in_pan(self):
        for record in self:
            if record.l10n_in_pan and not pan.is_valid(record.l10n_in_pan):
                raise ValidationError(_('The entered PAN seems invalid. Please enter a valid PAN.'))

    @api.constrains('l10n_in_lut_validation_date')
    def _check_l10n_in_lut_validation_date(self):
        if self.l10n_in_lut_validation_date and self.l10n_in_lut_validation_date < fields.Date.today():
            raise ValidationError(_('Please enter a valid LUT Validation Date.'))

    def action_update_state_as_per_gstin(self):
        self.ensure_one()
        self.partner_id.action_update_state_as_per_gstin()

    def _cron_update_lut_status(self):
        if self.l10n_in_lut_validation_date and self.l10n_in_lut_validation_date < fields.Date.today():
            self.write({'l10n_in_is_lut': False})
            self._update_l10n_in_fiscal_position_based_on_lut()
