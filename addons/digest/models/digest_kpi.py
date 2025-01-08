# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import pytz

from odoo import api, fields, models, tools, _
from odoo.osv import expression
from odoo.tools.float_utils import float_round


class DigestKpi(models.Model):
    _name = 'digest.kpi'
    _description = 'Kpi'

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(required=True, default=0)
    compute_type = fields.Selection([('sum', 'Sum'), ('count', 'Count'), ('custom', 'Custom')],
                                    default='sum', string='Type', required=True)
    value_type = fields.Selection([('float', 'Float'), ('integer', 'Integer'), ('monetary', 'Monetary')],
                                  default='float', string='Value Type', required=True)
    res_model_id = fields.Many2one('ir.model', 'Model', ondelete='cascade', required=True)
    company_field = fields.Char('Company Field', default='company_id', required=False)

    # Custom type
    server_action_id = fields.Many2one('ir.actions.server', string='Custom code', required=False)

    # Sum/Count type
    date_field = fields.Char('Date Field', required=False)
    domain = fields.Char('Domain', required=False)
    # Sum type
    sum_field= fields.Char('Sum field', required=False)

    value_last_24_hours = fields.Char(default='0', compute='_compute_values')
    value_last_7_days = fields.Char(default='0', compute='_compute_values')
    value_last_30_days = fields.Char(default='0', compute='_compute_values')

    value_last_24_hours_margin = fields.Float(default=0, compute='_compute_values')
    value_last_7_days_margin = fields.Float(default=0, compute='_compute_values')
    value_last_30_days_margin = fields.Float(default=0, compute='_compute_values')

    @api.depends_context("company")
    def _compute_values(self):
        company = self.env.company
        for kpi in self:
            for field, computed_values in kpi._calculate_values_by_company(company)[company.id].items():
                kpi[field] = str(computed_values['value'])
                kpi[f'{field}_margin'] = computed_values['margin']
                kpi[f'{field}_margin'] = -10.5456456456

    def _calculate_values_by_company(self, companies):
        self.ensure_one()
        start_datetime = datetime.utcnow()
        # tz_name = self.env.company.resource_calendar_id.tz
        # if tz_name:
        #     start_datetime = pytz.timezone(tz_name).localize(start_datetime)

        results_by_company_id = {}
        for field, (prev_start, prev_end), (start, end) in (
            (
                'value_last_24_hours',
                (start_datetime + relativedelta(days=-2), start_datetime + relativedelta(days=-1)),
                (start_datetime + relativedelta(days=-1), start_datetime),
            ),
            (
                'value_last_7_days',
                (start_datetime + relativedelta(weeks=-2), start_datetime + relativedelta(weeks=-1)),
                (start_datetime + relativedelta(weeks=-1), start_datetime),
            ),
            (
                'value_last_30_days',
                (start_datetime + relativedelta(months=-2), start_datetime + relativedelta(months=-1)),
                (start_datetime + relativedelta(months=-1), start_datetime),
            )
        ):
            if self.compute_type == 'custom':
                context = {
                    'companies': companies,
                    'prev_start': prev_start,
                    'prev_end': prev_end,
                    'start': start,
                    'end': end,
                }
                previous_by_company, current_by_company = self.server_action_id.with_context(**context).run()
            elif self.compute_type == 'sum' or self.compute_type == 'count':
                previous_by_company = self._calculate_company_based_kpi(company_ids=companies.ids, start=prev_start, end=prev_end)
                current_by_company = self._calculate_company_based_kpi(company_ids=companies.ids, start=start, end=end)
            else:
                raise NotImplementedError("Unknown compute type %s" % self.compute_type)
            for company in companies:
                previous_value = previous_by_company[company.id]
                current_value = current_by_company[company.id]

                margin = self._get_margin_value(current_value, previous_value)
                if self.value_type == 'monetary':
                    converted_amount = tools.misc.format_decimalized_amount(current_value)
                    current_value = self._format_currency_amount(converted_amount, company.currency_id)
                elif self.value_type == 'float':
                    current_value = "%.2f" % current_value
                elif self.value_type == 'integer':
                    current_value = int(current_value)

                results_by_company_id[company.id] = results_by_company_id.get(company.id, {})
                results_by_company_id[company.id][field] = {
                    'value': current_value,
                    'margin': margin,
                }
        return results_by_company_id

    def _fields_translation(self):
        return {
            'value_last_24_hours': _('Last 24 hours'),
            'value_last_7_days': _('Last 7 days'),
            'value_last_30_days': _('Last 30 days'),
        }

    # def _get_kpi_compute_parameters(self):
    #     """Get the parameters used to computed the KPI value."""
    #     companies = self.company_id
    #     if any(not digest.company_id for digest in self):
    #         # No company: we will use the current company to compute the KPIs
    #         companies |= self.env.company
    #
    #     return (
    #         fields.Datetime.to_string(self.env.context.get('start_datetime')),
    #         fields.Datetime.to_string(self.env.context.get('end_datetime')),
    #         companies,
    #     )

    # def _compute_timeframes(self, company):
    #     start_datetime = datetime.utcnow()
    #     tz_name = company.resource_calendar_id.tz
    #     if tz_name:
    #         start_datetime = pytz.timezone(tz_name).localize(start_datetime)
    #     return [
    #         (
    #            'value_last_24_hours', (
    #                 (start_datetime + relativedelta(days=-1), start_datetime),
    #                 (start_datetime + relativedelta(days=-2), start_datetime + relativedelta(days=-1)))
    #         ),
    #         (
    #             'value_last_7_days', (
    #                 (start_datetime + relativedelta(weeks=-1), start_datetime),
    #                 (start_datetime + relativedelta(weeks=-2), start_datetime + relativedelta(weeks=-1)))
    #         ),
    #         (
    #             'value_last_30_days', (
    #                 (start_datetime + relativedelta(months=-1), start_datetime),
    #                 (start_datetime + relativedelta(months=-2), start_datetime + relativedelta(months=-1)))
    #         )
    #     ]

    # ------------------------------------------------------------
    # FORMATTING / TOOLS
    # ------------------------------------------------------------

    def _calculate_company_based_kpi(self, company_ids, start, end):
        """Generic method that computes the KPI on a given model."""
        self.ensure_one()
        domain = [
            (self.date_field, '>=', start),
            (self.date_field, '<', end),
        ]

        if self.domain:
            domain = expression.AND([domain, literal_eval(self.domain)])

        if not self.company_field:
            value = self.env['mail.message'].search_count(domain)
            return {company_id: value for company_id in company_ids}

        domain = expression.AND([domain, [(self.company_field, 'in', company_ids)]])

        values = self.env[self.res_model_id.model]._read_group(
            domain=domain,
            groupby=[self.company_field],
            aggregates=[f'{self.sum_field}:sum'] if self.sum_field else ['__count'],
        )

        results = {company.id: agg for company, agg in values}
        missing_values = {company_id: 0 for company_id in company_ids if company_id not in results}
        return {**results, **missing_values}

    def _get_margin_value(self, value, previous_value=0.0):
        margin = 0.0
        if (value != previous_value) and (value != 0.0 and previous_value != 0.0):
            margin = float_round((float(value-previous_value) / previous_value or 1) * 100, precision_digits=2)
        return margin

    def _format_currency_amount(self, amount, currency_id):
        pre = currency_id.position == 'before'
        symbol = u'{symbol}'.format(symbol=currency_id.symbol or '')
        return u'{pre}{0}{post}'.format(amount, pre=symbol if pre else '', post=symbol if not pre else '')
